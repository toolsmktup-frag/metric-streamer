// spedy-webhook — recebe eventos do Spedy (invoice.authorized / status_changed),
// registra a nota, faz o DE-PARA com os pedidos (order_shipments) e baixa XML+PDF
// para o Storage. A NF já é emitida no Spedy na compra; aqui só lemos.
//
// De-para (ordem de prioridade): referência externa (order/transaction id) → CPF → email.
// Auth: webhook público (verify_jwt=false). Opcional: header X-Webhook-Secret == SPEDY_WEBHOOK_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const env = (k: string) => Deno.env.get(k) || "";
const SPEDY_BASE = (env("SPEDY_BASE_URL") || "https://api.spedy.com.br/v1").replace(/\/+$/, "");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Lê o primeiro caminho existente (dot-path) de um objeto. */
function pick(obj: any, paths: string[]): any {
  for (const p of paths) {
    const v = p.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "") || null;

function spedyHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  const key = env("SPEDY_API_KEY");
  if (key) h["X-Api-Key"] = key;
  return h;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Validação opcional do webhook
  const expected = env("SPEDY_WEBHOOK_SECRET");
  if (expected && req.headers.get("X-Webhook-Secret") !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  // Ping/teste
  const invoiceId = pick(payload, [
    "invoiceId", "invoice_id", "id",
    "invoice.id", "data.id", "productInvoice.id", "data.invoice.id",
  ]);
  if (!invoiceId) {
    return json({ ok: true, message: "sem invoice id — ignorado (ping?)" });
  }

  try {
    // 1) Buscar a nota completa no Spedy (se houver API key) para ter número/CPF/email/referência
    let invoice: any = payload.invoice || payload.data || payload;
    if (env("SPEDY_API_KEY")) {
      try {
        const res = await fetch(`${SPEDY_BASE}/product-invoices/${invoiceId}`, { headers: spedyHeaders() });
        if (res.ok) invoice = await res.json();
      } catch (e) {
        console.error("[spedy-webhook] falha ao buscar nota (segue com payload):", e);
      }
    }

    // Schema real do Spedy (GET /v1/product-invoices/{id}):
    //   { id, number, series, status, issuedOn, authorization:{date},
    //     order:{ id, transactionId }, receiver:{ name, federalTaxNumber, email, address:{...} } }
    const nfNumber = pick(invoice, ["number", "nfeNumber", "nf_number", "numero"]);
    const nfSeries = pick(invoice, ["series", "serie"]);
    const nfStatus = String(
      pick(invoice, ["status", "state"]) || pick(payload, ["status", "event"]) || "",
    ).toLowerCase() || null;
    const issuedAt = pick(invoice, [
      "issuedOn", "effectiveDate", "authorization.date", "authorizedAt", "issuedAt", "createdAt",
    ]);
    // Referências p/ de-para com customer_purchases (Guru): transactionId casa com
    // platform_transaction_id; order.id casa com platform_order_id.
    const refTx = pick(invoice, ["order.transactionId", "transactionId", "integrationId"]);
    const refOrder = pick(invoice, ["order.id", "orderId", "order_id"]);
    const reference = refTx || refOrder;
    const buyerCpf = onlyDigits(pick(invoice, [
      "receiver.federalTaxNumber", "buyer.document", "buyer.cpf", "customer.document", "recipient.document",
    ]));
    const buyerEmail = String(pick(invoice, [
      "receiver.email", "buyer.email", "customer.email", "recipient.email", "email",
    ]) || "").toLowerCase() || null;
    const buyerName = pick(invoice, ["receiver.name", "buyer.name", "customer.name", "recipient.name", "name"]);

    // Endereço oficial da NF (mais limpo que o do checkout) — usado p/ corrigir o pedido.
    const addr = pick(invoice, ["receiver.address", "receiver.shippingAddress"]) || {};
    const nfAddress = {
      ship_street: addr.street ?? null,
      ship_number: addr.number ?? null,
      ship_complement: addr.additionalInformation ?? addr.complement ?? null,
      ship_neighborhood: addr.district ?? addr.neighborhood ?? null,
      ship_city: pick(addr, ["city.name", "city"]) ?? null,
      ship_state: String(pick(addr, ["city.state", "state"]) ?? "").toUpperCase() || null,
      ship_zipcode: onlyDigits(addr.postalCode ?? addr.zipCode ?? addr.zipcode),
    };

    // 2) Upsert da nota recebida (sempre — matched ou órfã)
    await supabase.from("spedy_invoices").upsert({
      organization_id: ORG_ID,
      spedy_invoice_id: String(invoiceId),
      nf_number: nfNumber ? String(nfNumber) : null,
      nf_series: nfSeries ? String(nfSeries) : null,
      nf_status: nfStatus,
      nf_issued_at: issuedAt ? new Date(issuedAt).toISOString() : null,
      reference: reference ? String(reference) : null,
      buyer_cpf: buyerCpf,
      buyer_email: buyerEmail,
      buyer_name: buyerName ? String(buyerName) : null,
      raw: payload,
    }, { onConflict: "spedy_invoice_id" });

    // 3) De-para: achar o pedido de envio
    let shipmentId: string | null = null;

    //   3a) por referência (transactionId/order.id da plataforma) — match exato
    if (refTx || refOrder) {
      const ors: string[] = [];
      if (refTx) ors.push(`platform_transaction_id.eq.${refTx}`);
      if (refOrder) ors.push(`platform_order_id.eq.${refOrder}`);
      const { data: cp } = await supabase
        .from("customer_purchases")
        .select("id")
        .or(ors.join(","))
        .limit(1)
        .maybeSingle();
      if (cp?.id) {
        const { data: os } = await supabase
          .from("order_shipments").select("id").eq("customer_purchase_id", cp.id).maybeSingle();
        shipmentId = os?.id ?? null;
      }
    }

    //   3b) por CPF (pedido físico ainda sem nota, mais recente)
    if (!shipmentId && buyerCpf) {
      const { data: os } = await supabase
        .from("order_shipments")
        .select("id")
        .eq("customer_cpf", buyerCpf)
        .is("spedy_invoice_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      shipmentId = os?.id ?? null;
    }

    //   3c) por email
    if (!shipmentId && buyerEmail) {
      const { data: os } = await supabase
        .from("order_shipments")
        .select("id")
        .eq("customer_email", buyerEmail)
        .is("spedy_invoice_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      shipmentId = os?.id ?? null;
    }

    // 4) Baixar XML + PDF e subir no Storage
    let xmlUrl: string | null = null;
    let pdfUrl: string | null = null;
    const folder = shipmentId || String(invoiceId);

    for (const kind of ["xml", "pdf"] as const) {
      try {
        const res = await fetch(`${SPEDY_BASE}/product-invoices/${invoiceId}/${kind}`, { headers: spedyHeaders() });
        if (!res.ok) { console.error(`[spedy-webhook] download ${kind} ${res.status}`); continue; }
        const buf = new Uint8Array(await res.arrayBuffer());
        const path = `${folder}/nota.${kind}`;
        const { error: upErr } = await supabase.storage.from("notas-fiscais").upload(path, buf, {
          contentType: kind === "xml" ? "application/xml" : "application/pdf",
          upsert: true,
        });
        if (upErr) { console.error(`[spedy-webhook] upload ${kind}:`, upErr.message); continue; }
        const { data: pub } = supabase.storage.from("notas-fiscais").getPublicUrl(path);
        if (kind === "xml") xmlUrl = pub.publicUrl; else pdfUrl = pub.publicUrl;
      } catch (e) {
        console.error(`[spedy-webhook] erro baixando ${kind}:`, e);
      }
    }

    // 5) Persistir URLs + vínculo
    await supabase.from("spedy_invoices").update({
      xml_url: xmlUrl, pdf_url: pdfUrl, matched_shipment_id: shipmentId,
    }).eq("spedy_invoice_id", String(invoiceId));

    if (shipmentId) {
      // Endereço da NF (oficial) só sobrescreve campos que vieram preenchidos.
      const addrPatch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(nfAddress)) {
        if (v !== null && v !== undefined && v !== "") addrPatch[k] = v;
      }
      await supabase.from("order_shipments").update({
        spedy_invoice_id: String(invoiceId),
        nf_number: nfNumber ? String(nfNumber) : null,
        nf_status: nfStatus,
        nf_issued_at: issuedAt ? new Date(issuedAt).toISOString() : null,
        nf_xml_url: xmlUrl,
        nf_pdf_url: pdfUrl,
        ...addrPatch,
      }).eq("id", shipmentId);
    }

    return json({ ok: true, invoice_id: invoiceId, matched: !!shipmentId, xml: !!xmlUrl, pdf: !!pdfUrl });
  } catch (e) {
    console.error("[spedy-webhook] erro:", e);
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
