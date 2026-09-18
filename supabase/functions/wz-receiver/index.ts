// v2.2.0 - funnel scope filter resolve LEAD funnels (fix: automações mortas desde 2026-06-10) + respeita trigger.disabled
// v2.1.0 - atomic dedup by external event id + improved Guru parsing
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { detectUpsellContext, isPreSaleTrigger } from "../_shared/upsellContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Normalização de payload por plataforma ───

interface NormalizedAddress {
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  country: string | null;
}

interface NormalizedEvent {
  contact_phone: string | null;
  contact_name: string | null;
  contact_email: string | null;
  product_name: string | null;
  product_id: string | null;
  offer_name: string | null;
  gross_amount: number;
  paid_amount: number;
  status: string;
  platform: string;
  payment_method: string | null;
  installments: number;
  pix_code: string | null;
  /** Página de pagamento da plataforma (Ticto: checkout.ticto.app/thanks/{hash} com QR + copia-e-cola). */
  pix_url: string | null;
  boleto_code: string | null;
  boleto_url: string | null;
  external_event_id: string | null;
  address: NormalizedAddress;
  raw_payload: Record<string, unknown>;
}

function extractAddress(body: Record<string, any>, ...sources: Record<string, any>[]): NormalizedAddress {
  // Try each source object in order (customer, contact, body root, body.address)
  const addrObj = body.address || {};
  const all = [...sources, body, addrObj];

  const pick = (keys: string[]): string | null => {
    for (const src of all) {
      if (!src) continue;
      for (const k of keys) {
        if (src[k]) return String(src[k]).trim();
      }
    }
    return null;
  };

  return {
    street: pick(['street', 'address_street', 'rua', 'logradouro', 'street_name']),
    number: pick(['number', 'address_number', 'numero', 'street_number']),
    complement: pick(['complement', 'address_complement', 'complemento', 'address_comp']),
    neighborhood: pick(['neighborhood', 'address_neighborhood', 'bairro', 'district']),
    city: pick(['city', 'address_city', 'cidade']),
    state: pick(['state', 'address_state', 'estado', 'uf']),
    zipcode: pick(['zipcode', 'zip_code', 'address_zipcode', 'cep', 'postal_code', 'zip']),
    country: pick(['country', 'pais', 'address_country']),
  };
}

function normalizeTicto(body: Record<string, any>): NormalizedEvent {
  // ─── Ticto v2: payload aninhado em data.invoice ───
  const invoice = body.data?.invoice || body.invoice || {};
  const customer = invoice.customer || invoice.buyer || body.customer || body.buyer || {};
  const invoiceProduct = invoice.product || {};
  const invoiceItems = invoice.items || [];
  const firstItem = invoiceItems[0] || {};

  // ─── Ticto v1 / legacy top-level ───
  const item = body.item || {};
  const product = body.product || {};
  const transaction = body.transaction || {};

  // ─── Phone: DDI + DDD + Number (igual ao ticto-webhook) ───
  // Payload real da Ticto manda customer.phone como OBJETO {ddi, ddd, number}
  // (validado 13/07 — tratar como string virava "[object Object]" → null).
  let phone: string | null = null;
  const phoneObj = (customer.phone && typeof customer.phone === "object") ? customer.phone : null;
  const ddi = phoneObj?.ddi || customer.phone_local_code || customer.ddi || "";
  const ddd = phoneObj?.ddd || customer.phone_prefix || customer.ddd || "";
  const number = phoneObj?.number || customer.phone_number ||
    (typeof customer.phone === "string" ? customer.phone : "") || "";
  if (number) {
    phone = `${ddi}${ddd}${number}`.replace(/\D/g, "") || null;
  }
  // fallback v1
  if (!phone) {
    const buyerV1 = body.buyer || body.customer || {};
    if (buyerV1.phone_local_code || buyerV1.phone_number) {
      phone = `${buyerV1.phone_local_code || ""}${buyerV1.phone_number || ""}`.replace(/\D/g, "") || null;
    } else if (buyerV1.phone) {
      phone = String(buyerV1.phone).replace(/\D/g, "") || null;
    }
  }

  // ─── Name / Email ───
  const name = customer.name || customer.full_name || (body.buyer || body.customer || {}).name || null;
  const email = customer.email || (body.buyer || body.customer || {}).email || null;

  // ─── Product ───
  const productName =
    invoiceProduct.name || firstItem.product_name || firstItem.name ||
    item.product_name || product.name || body.product_name || null;

  const productId = String(
    invoiceProduct.id || invoiceProduct.product_id ||
    firstItem.product_id || firstItem.id ||
    item.product_id || product.id || body.product_id || ""
  );

  // ─── Offer ───
  const offerName =
    firstItem.offer_name || item.offer_name || body.offer_name || body.offer?.name || null;

  // ─── Amount (centavos) ───
  const amount = Number(
    invoice.paid_amount || invoice.amount || invoice.total || invoice.value ||
    firstItem.amount || firstItem.total_value ||
    item.amount || transaction.gross_amount || transaction.amount || 0
  );

  // ─── Status ───
  const rawStatus = invoice.status || body.status || transaction.status || "";

  // ─── PIX / Boleto codes ───
  const payment = invoice.payment || body.payment || {};
  // Payload real da Ticto traz o copia-e-cola em transaction.pix_qr_code
  // (validado 13/07 com pix de verdade — os aliases invoice/payment vinham null).
  const pixCode = transaction.pix_qr_code || transaction.pix_code || transaction.pix_emv ||
    invoice.pix_code || invoice.pix_emv || invoice.pix_qrcode ||
    payment.pix_code || payment.pix_emv || payment.pix_qrcode ||
    body.pix_code || body.pix_emv || null;
  const boletoCode = transaction.bank_slip_code ||
    invoice.digitable_line || invoice.boleto_digitable_line ||
    payment.digitable_line || payment.boleto_digitable_line ||
    body.digitable_line || null;
  const boletoUrl = transaction.bank_slip_url ||
    invoice.boleto_url || invoice.boleto_link ||
    payment.boleto_url || payment.boleto_link ||
    body.boleto_url || null;

  const externalEventId = String(
    body.id || invoice.id || invoice.transaction_id || transaction.id || body.transaction_id || ""
  ).trim() || null;

  return {
    contact_phone: phone,
    contact_name: name,
    contact_email: email,
    product_name: productName,
    product_id: productId,
    offer_name: offerName,
    gross_amount: amount,
    paid_amount: amount,
    status: normalizeStatus(rawStatus),
    platform: "ticto",
    payment_method: normalizePaymentMethod(
      invoice.payment_method || body.payment_method || transaction.payment_method
    ),
    installments: Number(invoice.installments || transaction.installments || 1),
    pix_code: pixCode,
    pix_url: transaction.pix_url || invoice.pix_url || body.pix_url || null,
    boleto_code: boletoCode,
    boleto_url: boletoUrl,
    external_event_id: externalEventId,
    address: extractAddress(body, customer, invoice),
    raw_payload: body,
  };
}

function normalizeGuru(body: Record<string, any>): NormalizedEvent {
  const contact = body.contact || body.buyer || {};
  const product = body.product || {};
  const subscription = body.subscription || {};

  // ─── Phone: concatenar phone_local_code + phone_number ───
  let phone: string | null = null;
  const ddi = contact.phone_local_code || contact.ddi || "";
  const rawPhone = contact.phone_number || contact.phone || "";
  if (rawPhone) {
    const cleaned = String(rawPhone).replace(/\D/g, "");
    const ddiClean = String(ddi).replace(/\D/g, "");
    if (ddiClean && !cleaned.startsWith(ddiClean)) {
      phone = `${ddiClean}${cleaned}`;
    } else {
      phone = cleaned || null;
    }
  }

  const grossRaw = body.payment?.total || body.total || body.amount || 0;
  const gross = Number(grossRaw) > 1000 && Number.isInteger(Number(grossRaw))
    ? Number(grossRaw) / 100
    : Number(grossRaw);

  const paymentObj = body.payment || {};

  // ─── PIX code: Guru coloca em payment.pix.qrcode.signature ───
  const pixCode = paymentObj.pix?.qrcode?.signature || paymentObj.pix?.emv ||
    paymentObj.pix_code || paymentObj.pix_emv || paymentObj.pix_qrcode ||
    body.pix_code || body.pix_emv || null;

  const boletoCode = paymentObj.digitable_line || paymentObj.boleto_digitable_line ||
    body.digitable_line || null;
  const boletoUrl = paymentObj.boleto_url || paymentObj.boleto_link ||
    body.boleto_url || null;

  // ─── Installments: pode ser objeto {qty: N} ou número ───
  const instRaw = paymentObj.installments || body.installments || 1;
  const installments = typeof instRaw === "object" ? Number(instRaw.qty || 1) : Number(instRaw || 1);

  // ─── Offer: pode estar em product.offer.name ───
  const offerName = body.offer?.name || product.offer?.name || null;
  // Alinhado com guru-webhook: sale.transaction_id → payment.marketplace_id → sale.id → body.id → sale.order_id
  const sale = body.sale || body;
  const externalEventId = String(sale.transaction_id || paymentObj.marketplace_id || sale.id || body.id || sale.order_id || "").trim() || null;

  return {
    contact_phone: phone,
    contact_name: contact.name || contact.first_name || null,
    contact_email: contact.email || null,
    product_name: product.name || body.product_name || null,
    product_id: String(product.id || product.product_id || product.marketplace_id || ""),
    offer_name: offerName,
    gross_amount: gross,
    paid_amount: gross,
    status: normalizeStatus(body.status || subscription.status || ""),
    platform: "guru",
    payment_method: normalizePaymentMethod(paymentObj.method || body.payment_method),
    installments,
    pix_code: pixCode,
    pix_url: paymentObj.pix?.qrcode?.url || body.pix_url || null,
    boleto_code: boletoCode,
    boleto_url: boletoUrl,
    external_event_id: externalEventId,
    address: extractAddress(body, contact),
    raw_payload: body,
  };
}

function normalizeGeneric(body: Record<string, any>): NormalizedEvent {
  return {
    contact_phone: body.phone || body.contact_phone || null,
    contact_name: body.name || body.contact_name || null,
    contact_email: body.email || body.contact_email || null,
    product_name: body.product_name || body.product || null,
    product_id: String(body.product_id || ""),
    offer_name: body.offer_name || body.offer || null,
    gross_amount: Number(body.amount || body.gross_amount || 0),
    paid_amount: Number(body.paid_amount || body.amount || 0),
    status: normalizeStatus(body.status || body.event || ""),
    platform: body.platform || "unknown",
    payment_method: normalizePaymentMethod(body.payment_method),
    installments: Number(body.installments || 1),
    pix_code: body.pix_code || body.pix_emv || null,
    pix_url: body.pix_url || null,
    boleto_code: body.digitable_line || body.boleto_code || null,
    boleto_url: body.boleto_url || null,
    external_event_id: String(body.id || body.transaction_id || body.order_id || "").trim() || null,
    address: extractAddress(body),
    raw_payload: body,
  };
}

function normalizeStatus(raw: string): string {
  const s = String(raw).toLowerCase().trim();
  const map: Record<string, string> = {
    approved: "purchase_approved",
    paid: "purchase_approved",
    completed: "purchase_approved",
    authorized: "purchase_approved",
    sale_approved: "purchase_approved",
    purchase_approved: "purchase_approved",
    waiting_payment: "pix_generated",
    pix_generated: "pix_generated",
    pix_created: "pix_generated",
    boleto_generated: "boleto_generated",
    // Ticto manda estes RAW pros boletos (visto ao vivo 13/07 — 18 eventos
    // sem tradução = nenhuma automação disparava pra boleto):
    bank_slip_created: "boleto_generated",
    bank_slip_delayed: "boleto_generated",
    billet_printed: "boleto_generated",
    pending: "pix_generated",
    expired: "pix_expired",
    pix_expired: "pix_expired",
    refused: "payment_refused",
    declined: "payment_refused",
    payment_refused: "payment_refused",
    refunded: "refund",
    refund: "refund",
    chargedback: "refund",
    canceled: "cancellation",
    cancelled: "cancellation",
    cancellation: "cancellation",
    abandoned: "cart_abandoned",
    abandoned_cart: "cart_abandoned",
    cart_abandoned: "cart_abandoned",
  };
  return map[s] || s;
}

function normalizePaymentMethod(value: unknown): string | null {
  const m = String(value || "").toLowerCase().trim();
  if (!m) return null;
  if (m.includes("pix")) return "pix";
  if (m.includes("boleto") || m.includes("bank_slip")) return "bank_slip";
  if (m.includes("card") || m.includes("cart")) return "credit_card";
  return m;
}

async function stableExecutionId(input: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
  const uuidBytes = bytes.slice(0, 16);
  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x40;
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;

  const hex = Array.from(uuidBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function buildEventDedupKey(flowId: string, event: NormalizedEvent): string | null {
  if (!event.external_event_id) return null;
  return [flowId, event.platform, event.status, event.external_event_id].join(":");
}

function isDuplicateInsertError(error: any): boolean {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  return code === "23505" || message.includes("duplicate key") || details.includes("duplicate");
}

// ─── Detect platform from payload ───

function detectPlatform(body: Record<string, any>, url: URL): string {
  const p = url.searchParams.get("platform");
  if (p) return p.toLowerCase();
  // Ticto v2 has data.invoice
  if (body.data?.invoice) return "ticto";
  if (body.producer || body.transaction?.id?.toString().match(/^\d{6,}$/)) return "ticto";
  if (body.item?.product_id) return "ticto";
  if (body.subscription || body.marketplace_id) return "guru";
  return "unknown";
}

// ─── Match trigger nodes ───

function matchesTrigger(triggerData: Record<string, any>, event: NormalizedEvent): boolean {
  // Triggers desativados no editor não disparam (v2.2.0 — antes era ignorado)
  if (triggerData.disabled === true) return false;

  const triggerType = triggerData.triggerType;

  // "any_event" matches everything
  if (triggerType === "any_event") { /* pass */ }
  else if (triggerType !== event.status) return false;

  // Platform filter
  if (triggerData.platform && triggerData.platform !== "any" && triggerData.platform !== event.platform) return false;

  // Product ID filter (supports single string or array; [] = sem filtro)
  if (triggerData.productIdFilter) {
    const filterIds = Array.isArray(triggerData.productIdFilter)
      ? triggerData.productIdFilter.map((id: any) => String(id))
      : [String(triggerData.productIdFilter)];
    if (filterIds.length > 0 && (!event.product_id || !filterIds.includes(String(event.product_id)))) return false;
  }

  // Offer filter (supports single string or array; [] = sem filtro)
  if (triggerData.offerFilter) {
    const filterOffers = Array.isArray(triggerData.offerFilter)
      ? triggerData.offerFilter.map((o: any) => String(o).toLowerCase())
      : [String(triggerData.offerFilter).toLowerCase()];
    if (filterOffers.length > 0 && (!event.offer_name || !filterOffers.some(f => event.offer_name!.toLowerCase().includes(f)))) return false;
  }

  return true;
}

// ─── Main handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[wz-receiver] Missing env vars", { hasUrl: !!supabaseUrl, hasKey: !!serviceRoleKey });
    return jsonResponse({ error: "Server configuration error" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 🔒 Função interna: aceita apenas chamadas autenticadas com a service_role key
  // (invocada internamente pelos webhooks de venda e webhook-lead). Bloqueia chamadas externas.
  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const url = new URL(req.url);
    const platform = detectPlatform(body, url);

    // Normalize
    let event: NormalizedEvent;
    if (platform === "ticto") event = normalizeTicto(body);
    else if (platform === "guru") event = normalizeGuru(body);
    else event = normalizeGeneric(body);

    console.log(`[wz-receiver] Platform=${event.platform} Status=${event.status} EventID=${event.external_event_id} Phone=${event.contact_phone} ProductID=${event.product_id} ProductName=${event.product_name}`);

    // ─── Sync lead to CRM funnels (ensures lead appears in Kanban even if only wz-receiver is called) ───
    if (event.contact_phone || event.contact_email) {
      // Map wz-receiver normalized status to lead event names
      const leadEventMap: Record<string, string> = {
        purchase_approved: "purchase",
        pix_generated: "pix_generated",
        boleto_generated: "boleto_generated",
        payment_refused: "refused",
        refund: "refunded",
        cancellation: "canceled",
        cart_abandoned: "abandoned_cart",
        pix_expired: "pix_expired",
      };
      const leadEventName = leadEventMap[event.status] || event.status;

      try {
        await supabase.rpc("sync_lead_from_sale", {
          p_phone: event.contact_phone,
          p_email: event.contact_email,
          p_name: event.contact_name,
          p_event_name: leadEventName,
          p_product_name: event.product_name || null,
          p_metadata: {
            platform: event.platform,
            transaction_id: event.external_event_id,
            external_event_id: event.external_event_id,
            product_name: event.product_name,
            status: event.status,
            amount: event.gross_amount || event.paid_amount || null,
            address_street: event.address.street,
            address_number: event.address.number,
            address_complement: event.address.complement,
            address_neighborhood: event.address.neighborhood,
            address_city: event.address.city,
            address_state: event.address.state,
            address_zipcode: event.address.zipcode,
          },
        });
        console.log(`[wz-receiver] Lead synced to CRM: event=${leadEventName} phone=${event.contact_phone}`);
      } catch (syncErr) {
        console.error("[wz-receiver] Lead sync error (non-fatal):", syncErr);
      }
    }

    const { data: flows, error: flowsErr } = await supabase
      .from("wz_flows")
      .select("id, nodes, edges")
      .eq("is_active", true);

    if (flowsErr) {
      console.error("Error fetching flows:", flowsErr);
      return jsonResponse({ error: "DB error" }, 500);
    }

    if (!flows || flows.length === 0) {
      console.log("[wz-receiver] No active flows found");
      return jsonResponse({ message: "No active flows", matched: 0 });
    }

    // ─── FUNNEL SCOPE FILTER (v2.2.0) ───
    // If a flow is linked to one or more funnels via lead_funnel_automations,
    // the event MUST belong to one of those funnels. lead_funnel_automations
    // references LEAD funnels (lead_funnels), so scope is resolved against the
    // lead-funnel mapping tables — the same resolution sync_lead_from_sale uses.
    // (v2.1.0 resolved against funnel_products/funnels — TRAFFIC funnel ids —
    // which never intersect lead funnel ids, so every linked flow was skipped.)
    const flowIds = flows.map((f: any) => f.id);
    const { data: funnelLinks } = await supabase
      .from("lead_funnel_automations")
      .select("wz_flow_id, funnel_id")
      .in("wz_flow_id", flowIds);

    const flowToFunnels = new Map<string, string[]>();
    for (const link of (funnelLinks || []) as any[]) {
      const arr = flowToFunnels.get(link.wz_flow_id) || [];
      arr.push(link.funnel_id);
      flowToFunnels.set(link.wz_flow_id, arr);
    }

    const eventFunnelIds = new Set<string>();

    // (a) Caller-declared funnel: webhook-lead validates X-Funnel-Token and
    // forwards metadata.funnel_id — trust it (internal service-role call).
    const declaredFunnelId = body?.metadata?.funnel_id;
    if (declaredFunnelId) eventFunnelIds.add(String(declaredFunnelId));

    // (b) product_id → traffic funnels (legacy) + lead funnels linked via
    // lead_funnel_products.source_funnel_product_id
    if (event.product_id) {
      const { data: prodLinks } = await supabase
        .from("funnel_products")
        .select("id, funnel_id")
        .eq("product_id", String(event.product_id));
      const fpIds: string[] = [];
      for (const r of (prodLinks || []) as any[]) {
        eventFunnelIds.add(r.funnel_id);
        fpIds.push(r.id);
      }
      if (fpIds.length > 0) {
        const { data: lfpBySource } = await supabase
          .from("lead_funnel_products")
          .select("lead_funnel_id")
          .in("source_funnel_product_id", fpIds);
        for (const r of (lfpBySource || []) as any[]) eventFunnelIds.add(r.lead_funnel_id);
      }
    }

    // (c) product_name → lead funnels (paridade com sync_lead_from_sale:
    // igualdade case-insensitive em lead_product_mappings + contains em
    // lead_funnel_products)
    if (event.product_name) {
      const { data: nameMaps } = await supabase
        .from("lead_product_mappings")
        .select("lead_funnel_id")
        .ilike("raw_product_name", event.product_name);
      for (const r of (nameMaps || []) as any[]) eventFunnelIds.add(r.lead_funnel_id);

      const { data: lfpAll } = await supabase
        .from("lead_funnel_products")
        .select("lead_funnel_id, product_name_contains");
      const pname = event.product_name.toLowerCase();
      for (const r of (lfpAll || []) as any[]) {
        const frag = (r.product_name_contains || "").toLowerCase();
        if (frag && pname.includes(frag)) eventFunnelIds.add(r.lead_funnel_id);
      }
    }
    console.log(`[wz-receiver] Funnel scope: product=${event.product_id}/"${event.product_name}" declared=${declaredFunnelId || "-"} belongs to funnels=[${[...eventFunnelIds].join(",")}]`);

    // ─── Auto-cancel: compra aprovada cancela execuções pendentes de pré-venda ───
    const preSaleTriggers = ["pix_generated", "boleto_generated", "cart_abandoned", "pix_expired", "payment_refused"];
    if (event.status === "purchase_approved" && event.contact_phone) {
      console.log(`[wz-receiver] purchase_approved detected for phone=${event.contact_phone} product=${event.product_id} — cancelling pre-sale executions`);

      // Find running/waiting executions for same phone with pre-sale triggers
      const { data: pendingExecs, error: pendErr } = await supabase
        .from("wz_executions")
        .select("id, trigger_event, variables")
        .eq("contact_phone", event.contact_phone)
        .in("status", ["running", "waiting"])
        .in("trigger_event", preSaleTriggers);

      if (!pendErr && pendingExecs && pendingExecs.length > 0) {
        // Filter by same product if product_id is available
        const toCancel = event.product_id
          ? pendingExecs.filter((ex: any) => {
              const exProd = ex.variables?.product_id;
              return !exProd || String(exProd) === String(event.product_id);
            })
          : pendingExecs;

        if (toCancel.length > 0) {
          const cancelIds = toCancel.map((ex: any) => ex.id);
          console.log(`[wz-receiver] Cancelling ${cancelIds.length} pre-sale executions: ${cancelIds.join(", ")}`);

          await supabase
            .from("wz_executions")
            .update({ status: "cancelled", finished_at: new Date().toISOString() })
            .in("id", cancelIds);

          // Also cancel any scheduled steps
          await supabase
            .from("wz_scheduled_steps")
            .update({ status: "cancelled" })
            .in("execution_id", cancelIds)
            .eq("status", "pending");
        }
      }
    }

    // ─── Contexto de upsell: comprou AGORA outro produto? ──────────────────────
    // Caso real (17/09/2026): cliente comprou o Guia (46342), recebeu o acesso e
    // 3 min depois gerou o Pix do Curso Mestre (47629), o order bump da página de
    // obrigado. Como são produtos diferentes, o auto-cancel acima (que só olha o
    // MESMO produto) não se aplica — e o fluxo disparou uma mensagem de "pedido
    // não concluído" para quem tinha acabado de comprar. Aqui marcamos o contexto
    // para que o fluxo possa usar outro texto, em vez de tratar como pendência.
    let isUpsell = false;
    let recentPurchaseProductName: string | null = null;
    if (isPreSaleTrigger(event.status) && event.contact_phone) {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: recentBuys } = await supabase
        .from("wz_executions")
        .select("variables, started_at")
        .eq("contact_phone", event.contact_phone)
        .eq("trigger_event", "purchase_approved")
        .gte("started_at", thirtyMinAgo)
        .order("started_at", { ascending: false })
        .limit(5);

      const ctx = detectUpsellContext(
        event.product_id,
        (recentBuys || []).map((ex: any) => ({
          productId: ex.variables?.product_id,
          productName: ex.variables?.product_name ?? null,
          at: ex.started_at,
        })),
      );
      isUpsell = ctx.isUpsell;
      recentPurchaseProductName = ctx.recentPurchaseProductName;
      if (isUpsell) {
        console.log(`[wz-receiver] UPSELL CONTEXT: phone=${event.contact_phone} acabou de comprar "${recentPurchaseProductName}" e agora gerou ${event.status} de ${event.product_id}`);
      }
    }

    // Check each flow for matching triggers
    let matched = 0;
    const executionIds: string[] = [];

    for (const flow of flows) {
      const nodes = (flow.nodes || []) as Record<string, any>[];
      const edges = (flow.edges || []) as Record<string, any>[];

      // Funnel scope enforcement: if flow is linked to funnels, event's product
      // must belong to one of them. Flows with NO funnel link remain global.
      const linkedFunnels = flowToFunnels.get(flow.id);
      if (linkedFunnels && linkedFunnels.length > 0) {
        const inScope = linkedFunnels.some((fid) => eventFunnelIds.has(fid));
        if (!inScope) {
          console.log(`[wz-receiver] Flow ${flow.id} SKIPPED — linked to funnels [${linkedFunnels.join(",")}] but product ${event.product_id} not in any of them`);
          continue;
        }
      }

      // Find ALL trigger nodes in this flow (multiple triggers per flow supported)
      const triggerNodes = nodes.filter((n) => n.type === "trigger");
      if (triggerNodes.length === 0) continue;

      for (const triggerNode of triggerNodes) {
        const triggerData = triggerNode.data || {};
        const isMatch = matchesTrigger(triggerData, event);

        if (!isMatch) {
          console.log(`[wz-receiver] Flow ${flow.id} trigger ${triggerNode.id} NO MATCH: triggerType=${triggerData.triggerType} vs status=${event.status}, productFilter=${triggerData.productIdFilter} vs productId=${event.product_id}`);
          continue;
        }

        const eventDedupKey = buildEventDedupKey(flow.id, event);
        console.log(`[wz-receiver] Flow ${flow.id} trigger ${triggerNode.id} MATCHED!${eventDedupKey ? ` DedupKey=${eventDedupKey}` : " Checking time-window dedup..."}`);

        // ─── Fallback deduplication: only for payloads without stable external id ───
        if (!eventDedupKey && event.contact_phone) {
          const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: recentExecs } = await supabase
            .from("wz_executions")
            .select("id")
            .eq("flow_id", flow.id)
            .eq("contact_phone", event.contact_phone)
            .eq("trigger_event", event.status)
            .gte("started_at", fiveMinAgo)
            .limit(1);

          if (recentExecs && recentExecs.length > 0) {
            console.log(`[wz-receiver] DEDUP: skipping flow ${flow.id} trigger ${triggerNode.id} — execution ${recentExecs[0].id} already exists for phone=${event.contact_phone}`);
            continue;
          }
        }

        const variables = {
          product_name: event.product_name,
          product_id: event.product_id,
          offer_name: event.offer_name,
          gross_amount: event.gross_amount,
          paid_amount: event.paid_amount,
          payment_method: event.payment_method,
          installments: event.installments,
          platform: event.platform,
          pix_code: event.pix_code,
          pix_url: event.pix_url,
          boleto_code: event.boleto_code,
          boleto_url: event.boleto_url,
          external_event_id: event.external_event_id,
          is_upsell: isUpsell,
          recent_purchase_product_name: recentPurchaseProductName,
          address_street: event.address.street,
          address_number: event.address.number,
          address_complement: event.address.complement,
          address_neighborhood: event.address.neighborhood,
          address_city: event.address.city,
          address_state: event.address.state,
          address_zipcode: event.address.zipcode,
          address_country: event.address.country,
          _dedup_key: eventDedupKey,
        };

        const executionInsert: Record<string, any> = {
          flow_id: flow.id,
          contact_phone: event.contact_phone,
          contact_name: event.contact_name,
          contact_email: event.contact_email,
          trigger_event: event.status,
          trigger_payload: event.raw_payload,
          variables,
          status: "running",
          current_node_id: triggerNode.id,
        };

        if (eventDedupKey) {
          executionInsert.id = await stableExecutionId(eventDedupKey);
        }

        const { data: execution, error: execErr } = await supabase
          .from("wz_executions")
          .insert(executionInsert)
          .select("id")
          .single();

        if (execErr) {
          if (eventDedupKey && isDuplicateInsertError(execErr)) {
            console.log(`[wz-receiver] DEDUP CONFLICT: skipping duplicated event for flow ${flow.id} trigger ${triggerNode.id} key=${eventDedupKey}`);
            continue;
          }
          console.error(`Error creating execution for flow ${flow.id} trigger ${triggerNode.id}:`, execErr);
          continue;
        }

        matched++;
        executionIds.push(execution.id);

        // Find first node after this trigger
        const nextEdge = edges.find((e) => e.source === triggerNode.id);
        if (nextEdge) {
          const execUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/wz-executor`;
          try {
            const execRes = await fetch(execUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                execution_id: execution.id,
                flow_id: flow.id,
                current_node_id: nextEdge.target,
              }),
            });
            const execBody = await execRes.text();
            console.log(`[wz-receiver] wz-executor response for exec ${execution.id}: ${execRes.status} ${execBody.slice(0, 300)}`);
          } catch (err) {
            console.error("Error calling wz-executor:", err);
          }
        } else {
          await supabase
            .from("wz_executions")
            .update({ status: "completed", finished_at: new Date().toISOString() })
            .eq("id", execution.id);
        }
      }
    }

    return jsonResponse({ message: "OK", matched, execution_ids: executionIds });
  } catch (err) {
    console.error("[wz-receiver] Error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
