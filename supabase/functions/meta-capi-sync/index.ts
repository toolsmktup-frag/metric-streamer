import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** SHA-256 hash a string and return hex */
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const {
      email,
      phone,
      amount_cents,
      currency = "BRL",
      order_id,
      product_name,
      event_name = "Purchase",
      funnel_ids,
    } = body;

    if (!funnel_ids || !Array.isArray(funnel_ids) || funnel_ids.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "No funnel_ids provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all funnels with meta_pixel_id configured
    const { data: funnels, error: funnelError } = await supabase
      .from("lead_funnels")
      .select("id, meta_pixel_id, meta_access_token")
      .in("id", funnel_ids)
      .not("meta_pixel_id", "is", null);

    if (funnelError) {
      console.error("[meta-capi-sync] Error fetching funnels:", funnelError);
      return new Response(
        JSON.stringify({ success: false, error: funnelError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!funnels || funnels.length === 0) {
      console.log("[meta-capi-sync] No funnels with meta_pixel_id configured, skipping");
      return new Response(
        JSON.stringify({ success: true, message: "No pixels configured", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enrich with click data (visitor journey)
    let clickData: any = null;
    if (email) {
      try {
        const { data } = await supabase
          .from("clicks")
          .select("ip_address, user_agent, fbp, fbc, fbclid")
          .ilike("email", email)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        clickData = data;
      } catch (err) {
        console.warn("[meta-capi-sync] Click lookup error (non-fatal):", err);
      }
    }

    // Hash PII
    const hashedEmail = email ? await sha256(email) : null;
    const hashedPhone = phone ? await sha256(phone.replace(/\D/g, "")) : null;
    const eventId = order_id ? String(order_id) : crypto.randomUUID();
    const eventTime = Math.floor(Date.now() / 1000);

    // Build user_data
    const userData: Record<string, any> = {};
    if (hashedEmail) userData.em = [hashedEmail];
    if (hashedPhone) userData.ph = [hashedPhone];
    if (clickData?.ip_address) userData.client_ip_address = clickData.ip_address;
    if (clickData?.user_agent) userData.client_user_agent = clickData.user_agent;
    if (clickData?.fbp) userData.fbp = clickData.fbp;
    if (clickData?.fbc) userData.fbc = clickData.fbc;
    if (order_id) userData.external_id = [await sha256(String(order_id))];

    // Build event data
    const eventData: Record<string, any> = {
      event_name: event_name,
      event_time: eventTime,
      event_id: eventId,
      action_source: "website",
      user_data: userData,
    };

    if (amount_cents && amount_cents > 0) {
      eventData.custom_data = {
        value: amount_cents / 100,
        currency: currency,
        content_name: product_name || undefined,
      };
    }

    const results: any[] = [];

    // Send to each funnel's pixel
    for (const funnel of funnels) {
      const pixelId = funnel.meta_pixel_id;
      const accessToken = funnel.meta_access_token;

      if (!pixelId || !accessToken) continue;

      const url = `https://graph.facebook.com/v21.0/${pixelId}/events`;

      let status = "success";
      let metaResponse: any = null;

      try {
        const res = await fetch(`${url}?access_token=${accessToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: [eventData] }),
        });

        metaResponse = await res.json();

        if (!res.ok) {
          status = "error";
          console.error(
            `[meta-capi-sync] Meta API error for pixel ${pixelId}:`,
            JSON.stringify(metaResponse)
          );
        } else {
          console.log(
            `[meta-capi-sync] Sent ${event_name} to pixel ${pixelId}: events_received=${metaResponse?.events_received}`
          );
        }
      } catch (fetchErr) {
        status = "error";
        metaResponse = { error: String(fetchErr) };
        console.error(`[meta-capi-sync] Fetch error for pixel ${pixelId}:`, fetchErr);
      }

      // Log to audit table
      try {
        await supabase.from("meta_capi_log").insert({
          funnel_id: funnel.id,
          event_name,
          event_id: eventId,
          email_hash: hashedEmail,
          order_id: order_id ? String(order_id) : null,
          pixel_id: pixelId,
          status,
          meta_response: metaResponse,
        });
      } catch (logErr) {
        console.error("[meta-capi-sync] Log insert error (non-fatal):", logErr);
      }

      results.push({ funnel_id: funnel.id, pixel_id: pixelId, status });
    }

    return new Response(
      JSON.stringify({ success: true, sent: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[meta-capi-sync] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
