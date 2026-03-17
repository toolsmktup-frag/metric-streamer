import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

const INSIGHT_FIELDS = [
  "spend", "impressions", "reach", "clicks",
  "cpc", "cpm", "ctr", "actions", "cost_per_action_type",
].join(",");

const INLINE_FIELDS = `${INSIGHT_FIELDS},inline_link_clicks`;

async function metaFetch(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta API error ${res.status}: ${err}`);
  }
  return res.json();
}

async function metaFetchAll(path: string, token: string, params: Record<string, string> = {}, pageLimit = 500) {
  const results: any[] = [];
  const first = await metaFetch(path, token, { ...params, limit: String(pageLimit) });
  results.push(...(first.data || []));
  let next = first.paging?.next;
  let pageCount = 1;
  const MAX_PAGES = 20;
  while (next && pageCount < MAX_PAGES) {
    const res = await fetch(next);
    if (!res.ok) break;
    const json = await res.json();
    results.push(...(json.data || []));
    next = json.paging?.next;
    pageCount++;
  }
  return results;
}

function mapInsightRow(ins: any, idField: string, objectType: string) {
  return {
    object_id: ins[idField],
    object_type: objectType,
    date_start: ins.date_start,
    date_stop: ins.date_stop,
    spend: Number(ins.spend || 0),
    impressions: Number(ins.impressions || 0),
    reach: Number(ins.reach || 0),
    clicks: Number(ins.clicks || 0),
    link_clicks: Number(ins.inline_link_clicks || 0),
    cpc: Number(ins.cpc || 0),
    cpm: Number(ins.cpm || 0),
    ctr: Number(ins.ctr || 0),
    actions: ins.actions || [],
    cost_per_action_type: ins.cost_per_action_type || [],
  };
}

async function batchUpsert(supabase: any, table: string, rows: any[], onConflict: string, batchSize = 100) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + batchSize), { onConflict });
    if (error) console.error(`Upsert error ${table} batch ${i}:`, JSON.stringify(error));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const META_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
    if (!META_TOKEN) throw new Error("META_ACCESS_TOKEN not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let dateFrom: string | undefined;
    let dateTo: string | undefined;
    let fullSync = false;

    try {
      const body = await req.json();
      dateFrom = body.date_from;
      dateTo = body.date_to;
      fullSync = body.full_sync === true;
    } catch { /* no body */ }

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (!dateTo) dateTo = today.toISOString().split("T")[0];

    if (!dateFrom) {
      if (fullSync) {
        // Full sync: last 30 days
        const d = new Date(today);
        d.setDate(d.getDate() - 30);
        dateFrom = d.toISOString().split("T")[0];
      } else {
        // Fast sync (default): yesterday + today only
        dateFrom = yesterday.toISOString().split("T")[0];
      }
    }

    const timeRange = JSON.stringify({ since: dateFrom, until: dateTo });
    const syncMode = fullSync ? "completo (30d)" : "rápido (2d)";
    console.log(`Sync ${syncMode} started. Range: ${dateFrom} → ${dateTo}`);

    // Clean stale running jobs (>5 min)
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase
      .from("meta_sync_log")
      .update({ finished_at: new Date().toISOString(), status: "failed", error: "Timeout automático." })
      .eq("status", "running")
      .is("finished_at", null)
      .lt("started_at", staleThreshold);

    const { data: syncLog } = await supabase
      .from("meta_sync_log")
      .insert({ status: "running" })
      .select()
      .single();

    let totalRecords = 0;

    try {
    // Coleta IDs de contas de todos os funis + env var (fallback)
    const { data: funnels } = await supabase
      .from("funnels")
      .select("meta_account_id")
      .not("meta_account_id", "is", null);

    const accountSet = new Set<string>();

    // IDs dos funis (suporta múltiplos separados por vírgula)
    for (const f of funnels || []) {
      if (f.meta_account_id) {
        f.meta_account_id.split(",").forEach((id: string) => {
          const clean = id.trim().replace(/^act_/, "");
          if (clean) accountSet.add(clean);
        });
      }
    }

    // Fallback: env var
    const envAccount = Deno.env.get("META_AD_ACCOUNT_ID")?.trim().replace(/^act_/, "");
    if (envAccount) accountSet.add(envAccount);

    if (accountSet.size === 0) throw new Error("Nenhum ID de conta Meta configurado.");

    const accountIds = Array.from(accountSet);
    console.log(`Contas Meta a sincronizar: ${accountIds.join(", ")}`);

    for (const configuredAccountId of accountIds) {
      const actId = `act_${configuredAccountId}`;
      console.log(`\n── Sincronizando conta: ${actId} ──`);

      await supabase.from("meta_ad_accounts").upsert(
        { account_id: configuredAccountId, name: actId, currency: "BRL" },
        { onConflict: "account_id" }
      );

      // ── PHASE 1: Campaigns + Campaign Insights (always) ──
      try {
        console.log("Phase 1: Campaigns + Campaign Insights...");
        const t1 = Date.now();

        const [campaigns, campaignInsights] = await Promise.all([
          metaFetchAll(`/${actId}/campaigns`, META_TOKEN, {
            fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget",
          }),
          metaFetchAll(`/${actId}/insights`, META_TOKEN, {
            fields: `${INLINE_FIELDS},campaign_id`,
            level: "campaign",
            time_range: timeRange,
            time_increment: "1",
          }),
        ]);

        const campaignRows = campaigns.map((c: any) => ({
          id: c.id,
          account_id: configuredAccountId,
          name: c.name,
          status: c.effective_status || c.status,
          objective: c.objective,
          daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
          lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
          updated_at: new Date().toISOString(),
        }));

        const campaignInsightRows = campaignInsights
          .filter((ins: any) => ins.campaign_id)
          .map((ins: any) => mapInsightRow(ins, "campaign_id", "campaign"));

        await Promise.all([
          batchUpsert(supabase, "meta_campaigns", campaignRows, "id"),
          batchUpsert(supabase, "meta_insights", campaignInsightRows, "object_id,object_type,date_start,date_stop"),
        ]);

        totalRecords += campaigns.length + campaignInsightRows.length;
        console.log(`Phase 1 done: ${campaigns.length} campaigns, ${campaignInsightRows.length} insights (${Date.now() - t1}ms)`);
      } catch (e) { console.error("Phase 1 error:", e); }

      // ── PHASE 2: Adsets + Adset Insights (always) ──
      try {
        console.log("Phase 2: Adsets + Adset Insights...");
        const t2 = Date.now();

        const [adsets, adsetInsights] = await Promise.all([
          metaFetchAll(`/${actId}/adsets`, META_TOKEN, {
            fields: "id,name,status,effective_status,campaign_id,targeting",
          }),
          metaFetchAll(`/${actId}/insights`, META_TOKEN, {
            fields: `${INLINE_FIELDS},adset_id`,
            level: "adset",
            time_range: timeRange,
            time_increment: "1",
          }),
        ]);

        const adsetRows = adsets.map((a: any) => ({
          id: a.id,
          campaign_id: a.campaign_id,
          name: a.name,
          status: a.effective_status || a.status,
          targeting: a.targeting || null,
          updated_at: new Date().toISOString(),
        }));

        const adsetInsightRows = adsetInsights
          .filter((ins: any) => ins.adset_id)
          .map((ins: any) => mapInsightRow(ins, "adset_id", "adset"));

        await Promise.all([
          batchUpsert(supabase, "meta_adsets", adsetRows, "id"),
          batchUpsert(supabase, "meta_insights", adsetInsightRows, "object_id,object_type,date_start,date_stop"),
        ]);

        totalRecords += adsets.length + adsetInsightRows.length;
        console.log(`Phase 2 done: ${adsets.length} adsets, ${adsetInsightRows.length} insights (${Date.now() - t2}ms)`);
      } catch (e) { console.error("Phase 2 error:", e); }

      // ── PHASE 3: Ads (always) ──
      try {
        console.log("Phase 3: Ads...");
        const t3 = Date.now();

        const allAds = await metaFetchAll(`/${actId}/ads`, META_TOKEN, {
          fields: "id,name,status,effective_status,adset_id,campaign_id",
        });

        const adRows = allAds.map((a: any) => ({
          id: a.id,
          adset_id: a.adset_id,
          campaign_id: a.campaign_id,
          name: a.name,
          status: a.effective_status || a.status,
          updated_at: new Date().toISOString(),
        }));

        if (adRows.length > 0) await batchUpsert(supabase, "meta_ads", adRows, "id");
        totalRecords += adRows.length;
        console.log(`Phase 3 done: ${adRows.length} ads (${Date.now() - t3}ms)`);
      } catch (e) { console.error("Phase 3 error:", e); }

      // ── PHASE 4: Ad Insights (chunked) ──
      try {
        console.log("Phase 4: Ad Insights...");
        const t4 = Date.now();
        let adInsightTotal = 0;

        const chunks: { since: string; until: string }[] = [];
        const startDate = new Date(dateFrom + "T00:00:00");
        const endDate = new Date(dateTo + "T00:00:00");

        // Fast sync: single chunk (2 days). Full sync: 7-day chunks.
        const chunkDays = fullSync ? 7 : 31;

        let chunkStart = new Date(startDate);
        while (chunkStart <= endDate) {
          const chunkEnd = new Date(chunkStart);
          chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);
          if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());
          chunks.push({
            since: chunkStart.toISOString().split("T")[0],
            until: chunkEnd.toISOString().split("T")[0],
          });
          chunkStart = new Date(chunkEnd);
          chunkStart.setDate(chunkStart.getDate() + 1);
        }

        console.log(`Phase 4: ${chunks.length} chunk(s) to process`);

        for (const chunk of chunks) {
          try {
            const adInsights = await metaFetchAll(`/${actId}/insights`, META_TOKEN, {
              fields: `${INLINE_FIELDS},ad_id`,
              level: "ad",
              time_range: JSON.stringify(chunk),
              time_increment: "1",
            });

            if (adInsights.length > 0) {
              const adInsightRows = adInsights
                .filter((ins: any) => ins.ad_id)
                .map((ins: any) => mapInsightRow(ins, "ad_id", "ad"));
              await batchUpsert(supabase, "meta_insights", adInsightRows, "object_id,object_type,date_start,date_stop");
              adInsightTotal += adInsightRows.length;
            }
          } catch (chunkErr) {
            console.error(`Phase 4 chunk ${chunk.since}-${chunk.until} error:`, chunkErr);
          }
        }

        totalRecords += adInsightTotal;
        console.log(`Phase 4 done: ${adInsightTotal} ad insights (${Date.now() - t4}ms)`);
      } catch (e) { console.error("Phase 4 error:", e); }

    } // fim do for (accountIds)

      if (syncLog) {
        await supabase.from("meta_sync_log").update({
          finished_at: new Date().toISOString(),
          status: "completed",
          records_synced: totalRecords,
        }).eq("id", syncLog.id);
      }

      console.log(`Sync ${syncMode} completed! Total records: ${totalRecords}`);
    } catch (error) {
      console.error("Sync error:", error);
      if (syncLog) {
        await supabase.from("meta_sync_log").update({
          finished_at: new Date().toISOString(),
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        }).eq("id", syncLog.id);
      }
      throw error;
    }

    return new Response(
      JSON.stringify({ success: true, records_synced: totalRecords, mode: syncMode }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Sync failed." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
