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

/** Normaliza valor monetário: aceita centavos (int) ou reais (float) */
function parseAmount(value: unknown): number {
  if (!value) return 0;
  const n = Number(value);
  // Guru envia em centavos quando value > 1000 e parece inteiro
  return n > 1000 && Number.isInteger(n) ? n / 100 : n;
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

    // Se não tem os campos mínimos, provavelmente é um ping/teste da plataforma — retorna 200
    const hasSale    = payload.sale    || payload.order;
    const hasProduct = payload.product || payload.item || payload.product_name;
    const hasEvent   = payload.event   || payload.status;
    if (!hasSale && !hasProduct && !hasEvent) {
      console.log("Ping or test payload received, ignoring:", JSON.stringify(payload).slice(0, 200));
      return jsonResponse({ success: true, message: "ping ok" });
    }

    // Guru envia diferentes formatos — normalizar aqui
    // Estrutura comum: { event, sale, product, customer, tracking }
    const sale     = payload.sale     || payload.order    || payload.payment || {};
    const product  = payload.product  || payload.item     || payload.items?.[0] || {};
    const customer = payload.customer || payload.buyer    || payload.contact || {};
    const tracking = payload.tracking || payload.utm_data || payload.source || {};
    const payment  = payload.payment  || {};
    const dates    = payload.dates    || {};

    const productName = product.name || product.product_name || payload.product_name || "";
    const rawStatus   = payload.event || payload.status || sale.status || "authorized";
    const status      = String(rawStatus).toLowerCase();

    // Normalizar status Guru → padrão interno
    const statusMap: Record<string, string> = {
      sale_approved:   "authorized",
      sale_completed:  "authorized",
      sale_refused:    "refused",
      sale_refunded:   "refunded",
      sale_chargeback: "chargeback",
      approved:        "authorized",
      paid:            "authorized",
      waiting_payment: "pending",
      pending:         "pending",
      expired:         "canceled",
      canceled:        "canceled",
    };
    const normalizedStatus = statusMap[status];

    // PIX pendente não deve gerar erro nem salvar, para a Guru não retentar à toa
    if (normalizedStatus === "pending") {
      console.log(`Skipping pending Guru transaction with status "${status}"`);
      return jsonResponse({ success: true, message: "pending order, skipping" }, 200);
    }

    // Status desconhecido nunca deve quebrar o webhook
    if (!normalizedStatus) {
      console.log(`Skipping unknown Guru transaction status "${status}"`);
      return jsonResponse({ success: true, message: `unknown status ${status}, skipping` }, 200);
    }

    // UTMs
    const utmSource   = tracking.utm_source   || null;
    const utmMedium   = tracking.utm_medium   || null;
    const utmCampaign = tracking.utm_campaign || null;
    const utmContent  = tracking.utm_content  || null;
    const utmTerm     = tracking.utm_term     || null;

    function inferProductType() {
      const explicitType = String(product.type || payload.product_type || "").toLowerCase();
      const productText = `${productName} ${product.offer?.name || ""}`.toLowerCase();

      if (explicitType.includes("sub") || productText.includes("assinatura") || productText.includes("mensal")) {
        return "assinatura";
      }

      if (
        explicitType === "product" ||
        !!payload.shipment ||
        ["pote", "potes", "frasco", "frascos", "cápsula", "capsula", "capsulas", "cápsulas", "kit"].some(term => productText.includes(term))
      ) {
        return "fisico";
      }

      return "digital";
    }

    // Meta Ads IDs — Guru pode enviar diretamente ou via UTM "Name|id"
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

    const campaignParsed = parseUtmPair(utmCampaign);
    const adsetParsed    = parseUtmPair(utmMedium);
    const adParsed       = parseUtmPair(utmContent);

    const metaCampaignId = sale.meta_campaign_id || campaignParsed.id || null;
    const metaAdsetId    = sale.meta_adset_id    || adsetParsed.id    || null;
    const metaAdId       = sale.meta_ad_id       || adParsed.id       || null;

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

    const customerPhone = customer.phone || customer.telephone || customer.phone_number
      ? `${customer.phone_local_code || ""}${customer.phone || customer.telephone || customer.phone_number || ""}`
      : null;

    // Resolve or create unified customer
    let unifiedCustomerId: string | null = null;
    if (customer.email || customer.cpf || customer.doc || customer.document || customerPhone) {
      const { data } = await supabase.rpc("resolve_or_create_customer", {
        p_org_id: "00000000-0000-0000-0000-000000000001",
        p_email:  customer.email || null,
        p_cpf:    customer.cpf || customer.doc || customer.document || null,
        p_phone:  customerPhone,
        p_name:   customer.name || customer.full_name || null,
      });
      unifiedCustomerId = data || null;
    }

    const transactionId = sale.transaction_id || payment.marketplace_id || sale.id || payload.id || sale.order_id || null;
    const purchasedAt   = sale.approved_date || sale.created_at || dates.ordered_at || dates.created_at || payload.created_at || new Date().toISOString();

    const record = {
      organization_id:        "00000000-0000-0000-0000-000000000001",
      unified_customer_id:    unifiedCustomerId,
      platform:               "guru",
      platform_transaction_id: String(transactionId || ""),
      platform_order_id:      String(sale.order_id || payload.id || sale.id || ""),
      product_name:           productName,
      product_id:             String(product.id || product.product_id || product.marketplace_id || ""),
      offer_name:             product.offer?.name || product.offer_name || product.plan_name || null,
      offer_id:               String(product.offer?.id || product.offer_id || product.plan_id || ""),
      product_type:           inferProductType(),
      gross_amount:           parseAmount(sale.amount || sale.paid_amount || sale.value || payment.gross || payment.total),
      net_amount:             parseAmount(sale.net_amount || sale.commission || payment.net || null),
      payment_method:         sale.payment_method || payment.method || payload.payment_method || null,
      installments:           Number(sale.installments || payment.installments?.qty || 1),
      status:                 normalizedStatus,
      purchased_at:           new Date(purchasedAt).toISOString(),
      utm_source:             utmSource,
      utm_medium:             utmMedium,
      utm_campaign:           utmCampaign,
      utm_content:            utmContent,
      utm_term:               utmTerm,
      meta_campaign_id:       metaCampaignId,
      meta_adset_id:          metaAdsetId,
      meta_ad_id:             metaAdId,
      funnel_id:              funnelId,
      imported_from:          "webhook",
      raw_data:               payload,
    };

    const { error } = await supabase
      .from("customer_purchases")
      .upsert(record, { onConflict: "platform,platform_transaction_id" });

    if (error) {
      console.error("DB error:", error);
      return jsonResponse({ error: "Failed to save transaction", detail: error.message }, 500);
    }

    console.log(`Guru webhook processed: ${normalizedStatus} - product "${productName}" - funnel_id: ${funnelId}`);

    // ── Sincronizar lead na "BASE DE LEADS" ──
    try {
      await syncLeadFromSale(supabase, {
        email: customer.email || null,
        phone: customer.phone || customer.telephone || null,
        name: customer.name || customer.full_name || null,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        utm_content: utmContent,
        utm_term: utmTerm,
        event_name: "purchase",
        metadata: {
          platform: "guru",
          product_name: productName,
          status: normalizedStatus,
          amount: record.gross_amount,
        },
      });
    } catch (leadErr) {
      console.error("Lead sync error (non-fatal):", leadErr);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return jsonResponse({ error: "Internal server error", detail: String(err) }, 500);
  }
});
