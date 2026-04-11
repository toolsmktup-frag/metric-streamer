import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TrackingPayload {
  visitor_id: string;
  event: string;
  funnel_id?: string;
  stage_id?: string;
  page_url?: string;
  page_title?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  gclid?: string;
  screen_resolution?: string;
  timezone?: string;
  user_agent?: string;
  timestamp?: string;
}

function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function extractClientIP(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
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

    // Validate required fields
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

    const payload: TrackingPayload & { client_ip: string; server_user_agent: string } = {
      visitor_id: visitorId,
      event,
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
      screen_resolution: sanitizeString(body.screen_resolution, 20),
      timezone: sanitizeString(body.timezone, 100),
      user_agent: sanitizeString(body.user_agent, 500) || serverUserAgent,
      timestamp: sanitizeString(body.timestamp, 30),
      client_ip: clientIP,
      server_user_agent: serverUserAgent,
    };

    // Phase 1: Log only — Phase 2 will persist to `clicks` table
    console.log("[track-event]", JSON.stringify(payload));

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
