import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function extractClientIP(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

function sanitizeString(val: unknown, maxLen = 500): string | undefined {
  if (typeof val !== "string") return undefined;
  return val.slice(0, maxLen).trim() || undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();

    const visitorId = sanitizeString(body.visitor_id, 36);
    const event = sanitizeString(body.event, 100);

    if (!visitorId || !isValidUUID(visitorId)) {
      return new Response(
        JSON.stringify({ error: "visitor_id inválido (UUID esperado)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!event) {
      return new Response(
        JSON.stringify({ error: "event é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientIP = extractClientIP(req);
    const serverUserAgent = req.headers.get("user-agent") || "unknown";

    const record = {
      visitor_id: visitorId,
      event_type: event,
      funnel_id: sanitizeString(body.funnel_id, 36),
      stage_id: sanitizeString(body.stage_id, 36),
      page_url: sanitizeString(body.page_url, 2000),
      page_title: sanitizeString(body.page_title, 500),
      referrer: sanitizeString(body.referrer, 2000),
      utm_source: sanitizeString(body.utm_source, 200),
      utm_medium: sanitizeString(body.utm_medium, 200),
      utm_campaign: sanitizeString(body.utm_campaign, 500),
      utm_content: sanitizeString(body.utm_content, 500),
      utm_term: sanitizeString(body.utm_term, 500),
      fbclid: sanitizeString(body.fbclid, 500),
      fbc: sanitizeString(body.fbc, 500),
      fbp: sanitizeString(body.fbp, 500),
      gclid: sanitizeString(body.gclid, 500),
      ip_address: clientIP,
      user_agent: sanitizeString(body.user_agent, 500) || serverUserAgent,
      screen_resolution: sanitizeString(body.screen_resolution, 20),
      timezone: sanitizeString(body.timezone, 100),
      email: sanitizeString(body.email, 320),
    };

    // Remove undefined fields
    const cleanRecord = Object.fromEntries(
      Object.entries(record).filter(([_, v]) => v !== undefined)
    );

    // Persist to clicks table
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { error: dbError } = await supabase
      .from("clicks")
      .insert(cleanRecord);

    if (dbError) {
      console.error("[track-event] DB insert error:", dbError.message);
      // Fallback: log payload so data is not lost
      console.log("[track-event] fallback-log:", JSON.stringify(cleanRecord));
    }

    return new Response(
      JSON.stringify({ ok: true, visitor_id: visitorId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[track-event] error:", err);
    return new Response(
      JSON.stringify({ error: "Payload inválido" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
