import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

/** Extrai ID e nome do par "Nome|id" usado nos UTMs do Meta */
function parseUtmPair(value: string | null): { name: string | null; id: string | null } {
  if (!value) return { name: null, id: null };
  const parts = value.split("|");
  if (parts.length === 2) {
    let id = parts[1].trim();
    const colonIdx = id.indexOf("::");
    if (colonIdx > 0) id = id.substring(0, colonIdx);
    return { name: parts[0].trim(), id };
  }
  return { name: value, id: null };
}

function isPaidTraffic(utmSource: string | null): boolean {
  if (!utmSource) return false;
  const paid = ["fb", "facebook", "ig", "instagram", "google", "gads", "tiktok", "kwai"];
  return paid.some((s) => utmSource.toLowerCase().includes(s));
}

/** Normaliza status da Eduzz para padrão interno */
function mapStatus(status: string): string {
  const map: Record<string, string> = {
    // invoice.status values
    paid:                            "authorized",
    pago:                            "authorized",
    approved:                        "authorized",
    aprovado:                        "authorized",
    uptodade:                        "authorized",
    uptodate:                        "authorized",
    unpaid:                          "waiting_payment",
    pending:                         "waiting_payment",
    pendente:                        "waiting_payment",
    waitingpayment:                  "waiting_payment",
    refunded:                        "refunded",
    reembolsado:                     "refunded",
    cancelled:                       "refunded",
    cancelado:                       "refunded",
    chargeback:                      "chargeback",
    expired:                         "refused",
    refused:                         "refused",
    recusado:                        "refused",
    // payload.event names (fallback quando invoice.status está vazio)
    "myeduzz-invoice-paid":          "authorized",
    "myeduzz.invoice_paid":          "authorized",
    "myeduzz-invoice-refunded":      "refunded",
    "myeduzz.invoice_refunded":      "refunded",
    "myeduzz-invoice-chargeback":    "chargeback",
    "myeduzz.invoice_chargeback":    "chargeback",
    "myeduzz-invoice-canceled":      "refunded",
    "myeduzz.invoice_canceled":      "refunded",
    "myeduzz-invoice-expired":       "refused",
    "myeduzz.invoice_expired":       "refused",
    "myeduzz-invoice-waiting-payment": "waiting_payment",
  };
  return map[status?.toLowerCase()] || status?.toLowerCase() || "unknown";
}

/** Sync a sale as a lead into the "BASE DE LEADS" funnel */
async function syncLeadFromSale(
  supabase: ReturnType<typeof createClient>,
  params: {
    email: string | null;
    phone: string | null;
    name: string | null;
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
    event_name: string;
    metadata: Record<string, unknown>;
  }
) {
  const ORG_ID = "00000000-0000-0000-0000-000000000001";
  if (!params.email && !params.phone) return;

  let lead: any = null;
  if (params.phone) {
    const { data } = await supabase.from("leads").select("*").eq("organization_id", ORG_ID).eq("phone", params.phone).maybeSingle();
    lead = data;
  }
  if (!lead && params.email) {
    const { data } = await supabase.from("leads").select("*").eq("organization_id", ORG_ID).eq("email", params.email).maybeSingle();
    lead = data;
  }

  if (!lead) {
    const { data, error } = await supabase.from("leads").insert({
      organization_id: ORG_ID,
      phone: params.phone || null,
      email: params.email || null,
      name: params.name || null,
      utm_source: params.utm_source || null,
      utm_medium: params.utm_medium || null,
      utm_campaign: params.utm_campaign || null,
      utm_content: params.utm_content || null,
      utm_term: params.utm_term || null,
      metadata: {},
    }).select().single();
    if (error) { console.error("Lead insert error:", error); return; }
    lead = data;
  } else {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (params.name && !lead.name) updates.name = params.name;
    if (params.utm_source) updates.utm_source = params.utm_source;
    await supabase.from("leads").update(updates).eq("id", lead.id);
  }

  let { data: baseFunnel } = await supabase.from("lead_funnels").select("id").eq("organization_id", ORG_ID).eq("name", "BASE DE LEADS").maybeSingle();
  if (!baseFunnel) {
    const { data: created } = await supabase.from("lead_funnels").insert({
      organization_id: ORG_ID, name: "BASE DE LEADS", color: "#6366f1", is_active: true,
    }).select("id").single();
    baseFunnel = created;
    if (baseFunnel) {
      await supabase.from("lead_funnel_stages").insert([
        { funnel_id: baseFunnel.id, name: "Novo", color: "#94a3b8", sort_order: 0 },
        { funnel_id: baseFunnel.id, name: "Comprador", color: "#22c55e", sort_order: 1 },
        { funnel_id: baseFunnel.id, name: "Recorrente", color: "#3b82f6", sort_order: 2 },
        { funnel_id: baseFunnel.id, name: "VIP", color: "#f59e0b", sort_order: 3 },
      ]);
    }
  }
  if (!baseFunnel) return;

  await supabase.from("lead_events").insert({
    lead_id: lead.id, funnel_id: baseFunnel.id, event_name: params.event_name, metadata: params.metadata,
  });

  const { data: existingPos } = await supabase.from("lead_stage_positions").select("id").eq("lead_id", lead.id).eq("funnel_id", baseFunnel.id).maybeSingle();
  if (!existingPos) {
    const { data: firstStage } = await supabase.from("lead_funnel_stages").select("id").eq("funnel_id", baseFunnel.id).order("sort_order", { ascending: true }).limit(1).maybeSingle();
    if (firstStage) {
      await supabase.from("lead_stage_positions").insert({ lead_id: lead.id, funnel_id: baseFunnel.id, stage_id: firstStage.id });
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = await req.json();

    // Ping/teste — event === "ping" ou data.message === "ping"
    if (payload.event === "ping" || payload.data?.message === "ping") {
      console.log("Ping payload, ignoring:", JSON.stringify(payload).slice(0, 200));
      return jsonResponse({ success: true, message: "ping ok" });
    }

    // ── Formato real da Eduzz (API v2/MyEduzz) ──
    // Estrutura: { id, event, sentDate, data: { invoice, customer, content, tracking } }
    const data     = payload.data     || {};
    const invoice  = data.invoice     || {};
    const customer = data.customer    || {};
    const content  = data.content     || data.product || {};
    const tracking = data.tracking    || data.utm     || {};

    // ID da transação: data.invoice.id (não o payload.id que é o ID do webhook delivery)
    const invoiceId = String(invoice.id || "");

    const rawStatus  = invoice.status || payload.event || "unknown";
    const datePaid   = invoice.attemptDate || invoice.paidAt
                       || invoice.dueDate  || payload.sentDate
                       || new Date().toISOString();

    // Valor em REAIS
    const amountReais = parseFloat(invoice.amount || invoice.value || invoice.price || 0);

    const paymentMethod = invoice.payment?.method || invoice.paymentMethod || null;
    const installments  = parseInt(invoice.installments || 1);

    const productId   = String(content.id   || "");
    const productName = content.name || content.title || "";
    const offerName   = content.offer || content.offerName || null;

    const clientName  = customer.name  || null;
    const clientEmail = customer.email || null;
    const clientDoc   = customer.document || customer.cpf || null;
    const clientPhone = customer.phone || null;

    const utmSource   = tracking.utm_source   || payload.utm_source   || null;
    const utmMedium   = tracking.utm_medium   || payload.utm_medium   || null;
    const utmCampaign = tracking.utm_campaign || payload.utm_campaign || null;
    const utmContent  = tracking.utm_content  || payload.utm_content  || null;
    const utmTerm     = tracking.utm_term     || payload.utm_term     || null;

    const campaignParsed = parseUtmPair(utmCampaign);
    const adsetParsed    = parseUtmPair(utmMedium);
    const adParsed       = parseUtmPair(utmContent);

    if (!invoiceId) {
      // Evento sem fatura (ex: nutror, safevideo, carrinho) — ignorar silenciosamente
      console.log("No invoice_id, ignoring event:", payload.event, JSON.stringify(payload).slice(0, 200));
      return jsonResponse({ success: true, message: "event ignored" });
    }

    const transactionHash = String(invoiceId);
    const normalizedStatus = mapStatus(rawStatus);
    const paidAmountCentavos = Math.round(amountReais * 100);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, supabaseKey);

    // Resolve funnel_id: primeiro por token na URL, depois por product name ILIKE
    const urlToken = new URL(req.url).searchParams.get("token");
    let funnelId: string | null = null;

    if (urlToken) {
      const { data: funnelByToken } = await supabase
        .from("funnels")
        .select("id")
        .eq("webhook_token", urlToken)
        .single();
      funnelId = funnelByToken?.id ?? null;
    }

    if (!funnelId && productName) {
      const { data } = await supabase.rpc("resolve_funnel_id", { p_product_name: productName });
      funnelId = data || null;
    }

    // Grava em ticto_transactions (mesma tabela que o Ticto webhook)
    // Isso garante inclusão automática na v_all_sales sem mudanças na view
    const record = {
      organization_id:    "00000000-0000-0000-0000-000000000001",
      transaction_hash:   transactionHash,
      order_hash:         transactionHash,
      status:             normalizedStatus,
      payment_method:     paymentMethod,
      paid_amount:        paidAmountCentavos,  // centavos, consistente com Ticto
      installments:       installments,
      order_date:         new Date(datePaid).toISOString(),
      product_name:       productName,
      product_id:         productId ? parseInt(productId) || null : null,
      offer_name:         offerName,
      customer_name:      clientName,
      customer_email:     clientEmail,
      customer_phone:     clientPhone,
      customer_code:      clientDoc,
      utm_source:         utmSource,
      utm_medium:         utmMedium,
      utm_campaign:       utmCampaign,
      utm_content:        utmContent,
      utm_term:           utmTerm,
      meta_campaign_id:   campaignParsed.id,
      meta_campaign_name: campaignParsed.name,
      meta_adset_id:      adsetParsed.id,
      meta_adset_name:    adsetParsed.name,
      meta_ad_id:         adParsed.id,
      meta_ad_name:       adParsed.name,
      is_paid_traffic:    isPaidTraffic(utmSource),
      funnel_id:          funnelId,
      raw_payload:        payload,
      updated_at:         new Date().toISOString(),
    };

    // Upsert por transaction_hash: se a mesma fatura vier via webhook E CSV, não duplica
    const { error } = await supabase
      .from("ticto_transactions")
      .upsert(record, { onConflict: "transaction_hash" });

    if (error) {
      console.error("DB error:", error);
      return jsonResponse({ error: "Failed to save transaction", detail: error.message }, 500);
    }

    console.log(
      `Eduzz webhook processed: ${normalizedStatus} | invoice ${invoiceId}` +
      ` | product "${productName}" | funnel_id: ${funnelId} | R$${amountReais}`
    );

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return jsonResponse({ error: "Internal server error", detail: String(err) }, 500);
  }
});
