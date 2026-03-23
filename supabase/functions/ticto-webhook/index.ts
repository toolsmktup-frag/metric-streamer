import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Extract ID and name from UTM values like "Campaign Name|12345" */
function parseUtmPair(value: string | null): { name: string | null; id: string | null } {
  if (!value || value === "Não Informado") return { name: null, id: null };
  const parts = value.split("|");
  if (parts.length === 2) {
    // Strip Meta tracking suffix like "::IwZXh0bg...aem_xxx::" from IDs
    let id = parts[1].trim();
    const colonIdx = id.indexOf("::");
    if (colonIdx > 0) id = id.substring(0, colonIdx);
    return { name: parts[0].trim(), id };
  }
  return { name: value, id: null };
}

function isPaidTraffic(tracking: Record<string, string>): boolean {
  const source = tracking?.utm_source;
  if (!source || source === "Não Informado") return false;
  // Common paid traffic sources
  const paidSources = ["fb", "facebook", "ig", "instagram", "google", "gads", "bing", "tiktok", "kwai", "taboola", "outbrain"];
  return paidSources.some((s) => source.toLowerCase().includes(s));
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

  // 1. Find or create lead (dedup by phone then email)
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

  // 2. Find or create "BASE DE LEADS" funnel
  let { data: baseFunnel } = await supabase.from("lead_funnels").select("id").eq("organization_id", ORG_ID).eq("name", "BASE DE LEADS").maybeSingle();
  if (!baseFunnel) {
    const { data: created } = await supabase.from("lead_funnels").insert({
      organization_id: ORG_ID,
      name: "BASE DE LEADS",
      color: "#6366f1",
      is_active: true,
    }).select("id").single();
    baseFunnel = created;
    if (baseFunnel) {
      const stages = [
        { funnel_id: baseFunnel.id, name: "Novo", color: "#94a3b8", sort_order: 0 },
        { funnel_id: baseFunnel.id, name: "Comprador", color: "#22c55e", sort_order: 1 },
        { funnel_id: baseFunnel.id, name: "Recorrente", color: "#3b82f6", sort_order: 2 },
        { funnel_id: baseFunnel.id, name: "VIP", color: "#f59e0b", sort_order: 3 },
      ];
      await supabase.from("lead_funnel_stages").insert(stages);
    }
  }
  if (!baseFunnel) return;

  // 3. Log lead_event
  await supabase.from("lead_events").insert({
    lead_id: lead.id,
    funnel_id: baseFunnel.id,
    event_name: params.event_name,
    metadata: params.metadata,
  });

  // 4. Position in funnel (first stage if not already positioned)
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
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();

    // Aceita formatos antigos e novos da Ticto sem quebrar o webhook
    const hasSale = payload.sale || payload.order || payload.payment;
    const hasProduct = payload.product || payload.item || payload.items?.[0] || payload.product_name;
    const hasEvent = payload.event || payload.status;
    if (!hasSale && !hasProduct && !hasEvent) {
      console.log("Ping or test payload received, ignoring:", JSON.stringify(payload).slice(0, 200));
      return new Response(JSON.stringify({ success: true, message: "ping ok" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tracking = payload.tracking || payload.utm_data || payload.source || {};
    const order = payload.order || payload.sale || payload.payment || {};
    const item = payload.item || payload.product || payload.items?.[0] || {};
    const customer = payload.customer || payload.buyer || payload.contact || {};
    const payment = payload.payment || {};
    const dates = payload.dates || {};

    // Parse UTMs to extract Meta Ads IDs
    // utm_campaign = "Campaign Name|campaign_id"
    // utm_medium   = "Adset Name|adset_id"
    // utm_content  = "Ad Name|ad_id"
    const campaignParsed = parseUtmPair(tracking.utm_campaign);
    const adsetParsed = parseUtmPair(tracking.utm_medium);
    const adParsed = parseUtmPair(tracking.utm_content);

    const clean = (value: unknown) => {
      if (value === undefined || value === null) return null;
      const text = String(value).trim();
      return !text || text === "Não Informado" ? null : text;
    };

    const utmSource = clean(tracking.utm_source);
    const utmMedium = clean(tracking.utm_medium);
    const utmCampaign = clean(tracking.utm_campaign);
    const utmContent = clean(tracking.utm_content);
    const utmTerm = clean(tracking.utm_term);
    const src = clean(tracking.src);
    const sck = clean(tracking.sck);

    // Build phone string
    const phone = customer.phone
      ? `${customer.phone.ddi || customer.phone_local_code || ""}${customer.phone.ddd || ""}${customer.phone.number || customer.phone_number || ""}`
      : clean(customer.phone_number);

    // Parse dates
    const statusDateRaw = payload.status_date || dates.confirmed_at || dates.updated_at || dates.created_at || null;
    const orderDateRaw = order.order_date || dates.ordered_at || dates.confirmed_at || dates.created_at || null;
    const statusDate = statusDateRaw ? new Date(statusDateRaw).toISOString() : null;
    const orderDate = orderDateRaw ? new Date(orderDateRaw).toISOString() : null;

    // payload.status is the canonical status field from Ticto.
    // payload.event can be "PageView" from tracking — must NOT override status.
    const rawStatus = String(payload.status || order.status || payload.event || "").toLowerCase();
    const statusMap: Record<string, string> = {
      approved: "authorized",
      authorized: "authorized",
      paid: "authorized",
      open: "open",
      pending: "pending",
      waiting_payment: "waiting_payment",
      refunded: "refunded",
      refund: "refunded",
      chargeback: "chargeback",
      canceled: "canceled",
      cancelled: "canceled",
      expired: "expired",
      refused: "refused",
    };
    const normalizedStatus = statusMap[rawStatus] || rawStatus || "open";

    // Ticto v2.0: order.paid_amount and item.amount are already in centavos.
    // item.amount = preço unitário do item (ex: 4700 = R$47,00)
    // order.paid_amount = valor total pago (ex: 7400 = R$74,00 com bump)
    const paidAmount = Number(order.paid_amount ?? item.amount ?? item.total_value ?? item.unit_value ?? 0);
    // Ticto always sends centavos; no heuristic needed
    const amountInCents = Math.round(paidAmount);

    const productName = clean(item.product_name || item.name || payload.product_name) || "";
    const offerName = clean(item.offer_name || item.offer?.name || payload.offer_name);
    const offerId = clean(item.offer_id || item.offer?.id || payload.offer_id) || "";
    const orderId = Number(order.id || payload.order_id || 0) || null;
    const installments = Number(order.installments || payment.installments?.qty || 1) || 1;

    // Use service role to bypass RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
      const { data: funnelData } = await supabase
        .rpc("resolve_funnel_id", { p_product_name: productName });
      funnelId = funnelData || null;
    }

    const record = {
      order_id: orderId,
      order_hash: clean(order.hash || order.marketplace_id || payload.id),
      transaction_hash: clean(order.transaction_hash || payment.marketplace_id || payload.id),
      status: normalizedStatus,
      status_date: statusDate,
      payment_method: clean(payload.payment_method || payment.method),
      paid_amount: amountInCents,
      installments,
      order_date: orderDate,
      product_name: productName,
      product_id: Number(item.product_id || item.id || 0) || null,
      offer_name: offerName,
      offer_id: offerId,
      offer_code: clean(item.offer_code),
      customer_name: clean(customer.name),
      customer_email: clean(customer.email),
      customer_phone: phone,
      customer_code: clean(customer.code || customer.doc),
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_content: utmContent,
      utm_term: utmTerm,
      src,
      sck,
      meta_campaign_id: campaignParsed.id,
      meta_campaign_name: campaignParsed.name,
      meta_adset_id: adsetParsed.id,
      meta_adset_name: adsetParsed.name,
      meta_ad_id: adParsed.id,
      meta_ad_name: adParsed.name,
      is_paid_traffic: isPaidTraffic(tracking),
      funnel_id: funnelId,
      raw_payload: payload,
      updated_at: new Date().toISOString(),
    };

    // Upsert by (order_id, product_id) — idempotência real.
    // Ticto re-envia o mesmo pedido+produto com transaction_hash DIFERENTE
    // a cada retry, então conflitar por transaction_hash criava N linhas.
    // Com order_id+product_id qualquer re-envio atualiza a linha existente.
    const { error } = await supabase
      .from("ticto_transactions")
      .upsert(record, { onConflict: "order_id,product_id" });

    if (error) {
      console.error("DB error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to save transaction", detail: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Ticto webhook processed: status=${record.status} product="${record.product_name}" amount=${record.paid_amount} funnel=${funnelId} order=${record.order_id}`);

    // ── Sincronizar lead na "BASE DE LEADS" ──
    try {
      await syncLeadFromSale(supabase, {
        email: record.customer_email,
        phone: record.customer_phone,
        name: record.customer_name,
        utm_source: record.utm_source,
        utm_medium: record.utm_medium,
        utm_campaign: record.utm_campaign,
        utm_content: record.utm_content,
        utm_term: record.utm_term,
        event_name: "purchase",
        metadata: {
          platform: "ticto",
          product_name: record.product_name,
          status: record.status,
          amount_cents: record.paid_amount,
          order_hash: record.order_hash,
        },
      });
    } catch (leadErr) {
      console.error("Lead sync error (non-fatal):", leadErr);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
