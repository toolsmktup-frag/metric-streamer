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
  const paidSources = ["fb", "facebook", "ig", "instagram", "google", "gads", "bing", "tiktok", "kwai", "taboola", "outbrain"];
  return paidSources.some((s) => source.toLowerCase().includes(s));
}

const clean = (value: unknown) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return !text || text === "Não Informado" ? null : text;
};

/**
 * Busca valor pago em centavos em múltiplos caminhos possíveis do payload Ticto.
 * Retorna o primeiro valor > 0 encontrado, ou 0 se nenhum.
 */
function extractPaidAmountCents(payload: any, order: any, item: any, payment: any, invoice: any): number {
  const candidates = [
    order?.paid_amount,
    invoice?.paid_amount,
    invoice?.amount,
    invoice?.total,
    invoice?.value,
    invoice?.price,
    item?.amount,
    item?.total_value,
    item?.unit_value,
    item?.price,
    item?.value,
    payment?.amount,
    payment?.paid_amount,
    payment?.value,
    payload?.paid_amount,
    payload?.amount,
    payload?.value,
    payload?.price,
    order?.amount,
    order?.value,
    order?.total,
    order?.total_value,
  ];

  for (const c of candidates) {
    const n = Number(c);
    if (n > 0 && isFinite(n)) return Math.round(n);
  }
  return 0;
}

/**
 * Busca nome do produto em múltiplos caminhos possíveis.
 */
function extractProductName(payload: any, item: any, invoice: any): string {
  const candidates = [
    item?.product_name,
    item?.name,
    item?.product?.name,
    invoice?.product_name,
    invoice?.product?.name,
    invoice?.product?.product_name,
    payload?.product_name,
    payload?.product?.name,
    payload?.product?.product_name,
  ];
  for (const c of candidates) {
    const v = clean(c);
    if (v) return v;
  }
  return "";
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

    // Log resumido do payload para diagnóstico
    const topKeys = Object.keys(payload).join(", ");
    console.log(`[ticto-webhook] Top-level keys: ${topKeys}`);

    // ── Unwrap invoice structure ──
    // Ticto v2: payload.data.invoice | Eduzz-style: payload.invoice (top-level)
    const invoice = payload.data?.invoice || payload.invoice || payload.data || {};
    const invoiceKeys = Object.keys(invoice).join(", ");
    if (invoiceKeys) {
      console.log(`[ticto-webhook] Invoice keys: ${invoiceKeys}`);
    }

    // Aceita formatos antigos e novos da Ticto sem quebrar o webhook
    const hasSale = payload.sale || payload.order || payload.payment || invoice.id;
    const hasProduct = payload.product || payload.item || payload.items?.[0] || payload.product_name || invoice.product || invoice.product_name;
    const hasEvent = payload.event || payload.status || invoice.status;
    if (!hasSale && !hasProduct && !hasEvent) {
      console.log("[ticto-webhook] Ping or test payload, ignoring:", JSON.stringify(payload).slice(0, 300));
      return new Response(JSON.stringify({ success: true, message: "ping ok" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tracking = payload.tracking || invoice.tracking || invoice.utm_data || payload.utm_data || payload.source || {};
    const order = payload.order || payload.sale || invoice || payload.payment || {};
    const item = payload.item || payload.product || invoice.product || payload.items?.[0] || invoice.items?.[0] || {};
    const customer = payload.customer || invoice.customer || invoice.buyer || payload.buyer || payload.contact || {};
    const payment = payload.payment || invoice.payment || {};
    const dates = payload.dates || invoice.dates || {};

    // Parse UTMs to extract Meta Ads IDs
    const campaignParsed = parseUtmPair(tracking.utm_campaign);
    const adsetParsed = parseUtmPair(tracking.utm_medium);
    const adParsed = parseUtmPair(tracking.utm_content);

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

    // Parse dates (include invoice fallbacks)
    const statusDateRaw = payload.status_date || invoice.status_date || invoice.confirmed_at || dates.confirmed_at || dates.updated_at || dates.created_at || invoice.created_at || null;
    const orderDateRaw = order.order_date || invoice.order_date || invoice.created_at || dates.ordered_at || dates.confirmed_at || dates.created_at || null;
    const statusDate = statusDateRaw ? new Date(statusDateRaw).toISOString() : null;
    const orderDate = orderDateRaw ? new Date(orderDateRaw).toISOString() : null;

    // Normalize status (include invoice.status)
    const rawStatus = String(payload.status || order.status || invoice.status || payload.event || "").toLowerCase();
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

    // ── Extração resiliente de valor e produto ──
    const amountInCents = extractPaidAmountCents(payload, order, item, payment, invoice);
    const productName = extractProductName(payload, item, invoice);
    const offerName = clean(item.offer_name || item.offer?.name || invoice.offer_name || payload.offer_name);
    const offerId = clean(item.offer_id || item.offer?.id || invoice.offer_id || payload.offer_id) || "";
    const orderId = Number(order.id || invoice.id || payload.order_id || 0) || null;
    const productId = Number(item.product_id || item.id || invoice.product_id || invoice.product?.id || payload.product_id || 0) || null;
    const installments = Number(order.installments || payment.installments?.qty || invoice.installments || 1) || 1;

    console.log(`[ticto-webhook] Extracted: status=${normalizedStatus} rawStatus=${rawStatus} amount=${amountInCents} product="${productName}" orderId=${orderId} productId=${productId}`);

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

    // ── Proteção contra sobrescrita: preservar dados bons ──
    // Se o novo payload vem com amount=0 ou product vazio,
    // verificar se já existe registro melhor no banco
    let finalAmount = amountInCents;
    let finalProductName = productName;
    let finalOfferName = offerName;

    if (orderId && productId) {
      const { data: existing } = await supabase
        .from("ticto_transactions")
        .select("paid_amount, product_name, offer_name, funnel_id")
        .eq("order_id", orderId)
        .eq("product_id", productId)
        .maybeSingle();

      if (existing) {
        // Preservar valor se o novo vier zerado mas o antigo tem valor
        if (finalAmount === 0 && (existing.paid_amount || 0) > 0) {
          finalAmount = existing.paid_amount;
          console.log(`[ticto-webhook] Preserving existing paid_amount=${finalAmount} (new was 0)`);
        }
        // Preservar product_name se o novo vier vazio
        if (!finalProductName && existing.product_name) {
          finalProductName = existing.product_name;
          console.log(`[ticto-webhook] Preserving existing product_name="${finalProductName}"`);
        }
        // Preservar offer_name se o novo vier vazio
        if (!finalOfferName && existing.offer_name) {
          finalOfferName = existing.offer_name;
        }
        // Preservar funnel_id se já existia
        if (!funnelId && existing.funnel_id) {
          funnelId = existing.funnel_id;
        }
      }
    }

    const record = {
      order_id: orderId,
      order_hash: clean(order.hash || order.marketplace_id || payload.id),
      transaction_hash: clean(order.transaction_hash || payment.marketplace_id || payload.id),
      status: normalizedStatus,
      status_date: statusDate,
      payment_method: clean(payload.payment_method || payment.method),
      paid_amount: finalAmount,
      installments,
      order_date: orderDate,
      product_name: finalProductName,
      product_id: productId,
      offer_name: finalOfferName,
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

    const { error } = await supabase
      .from("ticto_transactions")
      .upsert(record, { onConflict: "order_id,product_id" });

    if (error) {
      console.error("[ticto-webhook] DB error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to save transaction", detail: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ticto-webhook] Saved: status=${record.status} product="${record.product_name}" amount=${record.paid_amount} funnel=${funnelId} order=${record.order_id}`);

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
          p_purchased_at: orderDate || new Date().toISOString(),
          p_metadata: {
            platform: "ticto",
            product_name: record.product_name,
            status: record.status,
            amount_cents: record.paid_amount,
            order_hash: record.order_hash,
          },
        });
      } catch (leadErr) {
        console.error("[ticto-webhook] Lead sync error (non-fatal):", leadErr);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ticto-webhook] Webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
