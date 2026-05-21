// Diagnóstico Meta: status do token, últimas syncs, contas, contagens.
// Endpoint público (sem auth) só para leitura agregada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const out: any = { ok: true };

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1) Últimas syncs
    const { data: syncs } = await supabase
      .from("meta_sync_log")
      .select("id,status,started_at,finished_at,records_synced,error")
      .order("started_at", { ascending: false })
      .limit(10);
    out.last_syncs = syncs;

    // 2) Contagens
    const { count: cInsights } = await supabase
      .from("meta_insights").select("*", { count: "exact", head: true });
    const { count: cInsightsRecent } = await supabase
      .from("meta_insights").select("*", { count: "exact", head: true })
      .gte("date_start", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
    const { count: cCampaigns } = await supabase
      .from("meta_campaigns").select("*", { count: "exact", head: true });
    out.counts = { meta_insights_total: cInsights, meta_insights_last_7d: cInsightsRecent, meta_campaigns: cCampaigns };

    // 3) Max date_start em meta_insights
    const { data: maxRow } = await supabase
      .from("meta_insights").select("date_start").order("date_start", { ascending: false }).limit(1);
    out.latest_insight_date = maxRow?.[0]?.date_start || null;

    // 4) Funis com meta_account_id
    const { data: funnels } = await supabase
      .from("funnels").select("id,name,meta_account_id").not("meta_account_id", "is", null);
    out.funnels_with_account = funnels;

    // 5) Validar token Meta
    const token = Deno.env.get("META_ACCESS_TOKEN");
    out.token_present = !!token;
    if (token) {
      const r = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${token}`);
      const j = await r.json();
      out.token_check = { http_status: r.status, body: j };

      // Testar gasto últimos 7 dias na primeira conta configurada
      const accountSet = new Set<string>();
      for (const f of funnels || []) {
        if (f.meta_account_id) {
          for (const id of String(f.meta_account_id).split(",")) {
            const clean = id.trim().replace(/^act_/, "");
            if (clean) accountSet.add(clean);
          }
        }
      }
      const envAcc = Deno.env.get("META_AD_ACCOUNT_ID")?.trim().replace(/^act_/, "");
      if (envAcc) accountSet.add(envAcc);
      out.accounts_configured = Array.from(accountSet);

      if (accountSet.size > 0) {
        const acc = Array.from(accountSet)[0];
        const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        const until = new Date().toISOString().slice(0, 10);
        const url = `https://graph.facebook.com/v21.0/act_${acc}/insights?fields=spend,impressions&level=account&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&access_token=${token}`;
        const r2 = await fetch(url);
        const j2 = await r2.json();
        out.test_spend_last_7d = { account: acc, http_status: r2.status, body: j2 };
      }
    }

    return new Response(JSON.stringify(out, null, 2), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }, null, 2), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
