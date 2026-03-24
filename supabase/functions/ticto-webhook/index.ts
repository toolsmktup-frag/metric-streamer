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
      waiting_payment: "pending",
      pix_created: "pending",
      pix_pending: "pending",
      pix_expired: "canceled",
      bank_slip_created: "pending",
      bank_slip_delayed: "pending",
      bank_slip_expired: "canceled",
      refunded: "refunded",
      refund: "refunded",
      chargeback: "chargeback",
      canceled: "canceled",
      cancelled: "canceled",
      expired: "canceled",
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
    const bodyToken = clean(payload.token);
    const webhookToken = urlToken || bodyToken;
    let funnelId: string | null = null;

    if (webhookToken) {
      const { data: funnelByToken } = await supabase
        .from("funnels")
        .select("id")
        .eq("webhook_token", webhookToken)
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

    // ── Sincronizar lead — só quando status === "authorized" ──
    if (record.status === "authorized") {
      try {
        await supabase.rpc("sync_lead_from_sale", {
          p_phone: record.customer_phone,
          p_email: record.customer_email,
          p_name: record.customer_name,
          p_utm_source: record.utm_source,
          p_utm_medium: record.utm_medium,
          p_utm_campaign: record.utm_campaign,
          p_utm_content: record.utm_content,
          p_utm_term: record.utm_term,
          p_event_name: "purchase",
          p_product_name: record.product_name || null,
          p_metadata: {
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
