import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

async function parseBody(req: Request): Promise<unknown> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    return await req.json();
  }
  // sendBeacon may send as text/plain — try parsing as JSON
  const text = await req.text();
  return JSON.parse(text);
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
    const body = await parseBody(req);

    console.log("[track-event] received:", JSON.stringify(body));

    const visitorId = sanitizeString((body as any).visitor_id, 36);
    const event = sanitizeString((body as any).event, 100);

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
      funnel_id: sanitizeString((body as any).funnel_id, 36),
      stage_id: sanitizeString((body as any).stage_id, 36),
      page_url: sanitizeString((body as any).page_url, 2000),
      page_title: sanitizeString((body as any).page_title, 500),
      referrer: sanitizeString((body as any).referrer, 2000),
      utm_source: sanitizeString((body as any).utm_source, 200),
      utm_medium: sanitizeString((body as any).utm_medium, 200),
      utm_campaign: sanitizeString((body as any).utm_campaign, 500),
      utm_content: sanitizeString((body as any).utm_content, 500),
      utm_term: sanitizeString((body as any).utm_term, 500),
      fbclid: sanitizeString((body as any).fbclid, 500),
      fbc: sanitizeString((body as any).fbc, 500),
      fbp: sanitizeString((body as any).fbp, 500),
      gclid: sanitizeString((body as any).gclid, 500),
      ip_address: clientIP,
      user_agent: sanitizeString((body as any).user_agent, 500) || serverUserAgent,
      screen_resolution: sanitizeString((body as any).screen_resolution, 20),
      timezone: sanitizeString((body as any).timezone, 100),
      email: sanitizeString((body as any).email, 320),
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
      console.log("[track-event] fallback-log:", JSON.stringify(cleanRecord));
    } else {
      console.log("[track-event] inserted OK:", cleanRecord.event_type, cleanRecord.visitor_id);
    }

    // Return immediately — stage move is fire-and-forget
    const response = new Response(
      JSON.stringify({ ok: true, visitor_id: visitorId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

    // Auto-move lead stage based on pageview tracking
    const stageId = sanitizeString((body as any).stage_id, 36);
    const funnelId = sanitizeString((body as any).funnel_id, 36);

    if (event === "pageview" && stageId && funnelId) {
      try {
        // 1. Find email previously captured for this visitor
        const { data: clickRow } = await supabase
          .from("clicks")
          .select("email")
          .eq("visitor_id", visitorId)
          .not("email", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const capturedEmail = clickRow?.email;
        if (!capturedEmail) {
          console.log("[track-event] no email found for visitor", visitorId);
        } else {
          // 2. Find lead by email
          const { data: leadRow } = await supabase
            .from("leads")
            .select("id")
            .eq("email", capturedEmail)
            .limit(1)
            .maybeSingle();

          if (!leadRow) {
            console.log("[track-event] no lead found for email", capturedEmail);
          } else {
            const leadId = leadRow.id;

            // 3. Upsert lead_stage_positions
            const { error: upsertErr } = await supabase
              .from("lead_stage_positions")
              .upsert(
                {
                  lead_id: leadId,
                  funnel_id: funnelId,
                  stage_id: stageId,
                  entered_at: new Date().toISOString(),
                },
                { onConflict: "lead_id,funnel_id" }
              );

            if (upsertErr) {
              console.error("[track-event] stage upsert error:", upsertErr.message);
            } else {
              console.log("[track-event] moved lead", leadId, "to stage", stageId);

              // 4. Record stage change event
              await supabase.from("lead_events").insert({
                lead_id: leadId,
                event_type: "stage_change",
                new_stage_id: stageId,
                source: "tracking_pageview",
                metadata: { visitor_id: visitorId, page_url: cleanRecord.page_url },
              });
            }
          }
        }
      } catch (moveErr) {
        console.error("[track-event] stage move error:", moveErr);
      }
    }

    return response;
  } catch (err) {
    console.error("[track-event] error:", err);
    return new Response(
      JSON.stringify({ error: "Payload inválido" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
