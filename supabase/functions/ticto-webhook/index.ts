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

    // Se não tem os campos mínimos, provavelmente é um ping/teste da plataforma — retorna 200
    if (!payload.version || !payload.status || !payload.order) {
      console.log("Ping or test payload received, ignoring:", JSON.stringify(payload).slice(0, 200));
      return new Response(JSON.stringify({ success: true, message: "ping ok" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tracking = payload.tracking || {};
    const order = payload.order || {};
    const item = payload.item || {};
    const customer = payload.customer || {};

    // Parse UTMs to extract Meta Ads IDs
    // utm_campaign = "Campaign Name|campaign_id"
    // utm_medium   = "Adset Name|adset_id"
    // utm_content  = "Ad Name|ad_id"
    const campaignParsed = parseUtmPair(tracking.utm_campaign);
    const adsetParsed = parseUtmPair(tracking.utm_medium);
    const adParsed = parseUtmPair(tracking.utm_content);

    const utmSource = tracking.utm_source !== "Não Informado" ? tracking.utm_source : null;
    const utmMedium = tracking.utm_medium !== "Não Informado" ? tracking.utm_medium : null;
    const utmCampaign = tracking.utm_campaign !== "Não Informado" ? tracking.utm_campaign : null;
    const utmContent = tracking.utm_content !== "Não Informado" ? tracking.utm_content : null;
    const utmTerm = tracking.utm_term !== "Não Informado" ? tracking.utm_term : null;
    const src = tracking.src !== "Não Informado" ? tracking.src : null;
    const sck = tracking.sck !== "Não Informado" ? tracking.sck : null;

    // Build phone string
    const phone = customer.phone
      ? `${customer.phone.ddi || ""}${customer.phone.ddd || ""}${customer.phone.number || ""}`
      : null;

    // Parse dates
    const statusDate = payload.status_date ? new Date(payload.status_date).toISOString() : null;
    const orderDate = order.order_date ? new Date(order.order_date).toISOString() : null;

    // Use service role to bypass RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Resolve funnel_id: first try token from query param, then fallback to product name ILIKE
    const urlToken = new URL(req.url).searchParams.get("token");
    const productName = item.product_name || "";
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
      order_id: order.id,
      order_hash: order.hash,
      transaction_hash: order.transaction_hash,
      status: payload.status,
      status_date: statusDate,
      payment_method: payload.payment_method,
      paid_amount: order.paid_amount || 0, // centavos
      installments: order.installments,
      order_date: orderDate,
      product_name: item.product_name,
      product_id: item.product_id,
      offer_name: item.offer_name,
      offer_id: String(item.offer_id || ""),
      offer_code: item.offer_code,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: phone,
      customer_code: customer.code,
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

    console.log(`Ticto webhook processed: ${payload.status} - order ${order.hash} - tx ${order.transaction_hash}`);

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
