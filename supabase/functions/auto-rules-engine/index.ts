import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const _corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

interface RuleCondition {
  metric: string;
  operator: string;
  value: number;
}

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

async function metaPost(path: string, token: string, body: Record<string, any> = {}) {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Meta API POST error ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: _corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const META_TOKEN = Deno.env.get("META_ACCESS_TOKEN") || null;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Fetch all active rules
    const { data: rules, error: rErr } = await sb
      .from("automation_rules")
      .select("*")
      .eq("is_active", true);

    if (rErr) throw rErr;
    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ..._corsHeaders, "Content-Type": "application/json" },
      });
    }

    let triggered = 0;

    for (const rule of rules) {
      const orgId = rule.organization_id;
      const conditions = rule.conditions as RuleCondition[];

      // 2. Compute metrics for this org (last 7 days)
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const sinceStr = since.toISOString().split("T")[0];

      const { data: insights } = await sb
        .from("meta_insights")
        .select("spend, campaign_id")
        .eq("organization_id", orgId)
        .gte("date_start", sinceStr);

      const totalSpend = (insights || []).reduce(
        (s: number, r: any) => s + Number(r.spend || 0),
        0
      );

      const { data: sales } = await sb
        .from("v_all_sales")
        .select("amount_cents")
        .eq("organization_id", orgId)
        .gte("created_at", sinceStr);

      const totalRevenue =
        (sales || []).reduce(
          (s: number, r: any) => s + Number(r.amount_cents || 0),
          0
        ) / 100;

      const salesCount = (sales || []).length;

      const metrics: Record<string, number> = {
        spend: totalSpend,
        revenue: totalRevenue,
        cpa: salesCount > 0 ? totalSpend / salesCount : 0,
        roi: totalSpend > 0 ? ((totalRevenue - totalSpend) / totalSpend) * 100 : 0,
        roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      };

      // 3. Evaluate conditions (AND logic)
      const allMet = conditions.every((c) => {
        const val = metrics[c.metric] ?? 0;
        switch (c.operator) {
          case ">": return val > c.value;
          case "<": return val < c.value;
          case ">=": return val >= c.value;
          case "<=": return val <= c.value;
          case "=": return val === c.value;
          default: return false;
        }
      });

      if (!allMet) {
        // Update last_checked_at even if not triggered
        await sb
          .from("automation_rules")
          .update({ last_checked_at: new Date().toISOString() })
          .eq("id", rule.id);
        continue;
      }

      // 4. Execute action
      let metaResponse: any = null;
      let targetId: string | null = null;
      let status = "success";

      try {
        if (rule.action === "alert") {
          metaResponse = { type: "alert", message: `Rule "${rule.name}" triggered`, metrics };

        } else if (rule.action === "pause_campaign" && META_TOKEN) {
          // Get campaign IDs to pause
          const campaignIds = await getCampaignIds(sb, rule, orgId);
          const results: any[] = [];

          for (const cid of campaignIds) {
            try {
              const res = await metaPost(`/${cid}`, META_TOKEN, { status: "PAUSED" });
              results.push({ campaign_id: cid, success: true, response: res });
              targetId = targetId ? `${targetId},${cid}` : cid;
            } catch (err: any) {
              results.push({ campaign_id: cid, success: false, error: err.message });
            }
          }
          metaResponse = { type: "pause_campaign", results, metrics, campaigns_affected: campaignIds.length };

        } else if (rule.action === "reduce_budget" && META_TOKEN) {
          const reductionPct = rule.action_params?.reduction_percent || 20;
          const campaignIds = await getCampaignIds(sb, rule, orgId);
          const results: any[] = [];

          for (const cid of campaignIds) {
            try {
              // Fetch current budget
              const info = await metaFetch(`/${cid}`, META_TOKEN, {
                fields: "daily_budget,lifetime_budget,budget_remaining",
              });

              const currentBudget = Number(info.daily_budget || info.lifetime_budget || 0);
              if (currentBudget <= 0) {
                results.push({ campaign_id: cid, skipped: true, reason: "no budget found" });
                continue;
              }

              const newBudget = Math.round(currentBudget * (1 - reductionPct / 100));
              const budgetField = info.daily_budget ? "daily_budget" : "lifetime_budget";

              const res = await metaPost(`/${cid}`, META_TOKEN, { [budgetField]: String(newBudget) });
              results.push({
                campaign_id: cid,
                success: true,
                old_budget: currentBudget,
                new_budget: newBudget,
                reduction_pct: reductionPct,
                response: res,
              });
              targetId = targetId ? `${targetId},${cid}` : cid;
            } catch (err: any) {
              results.push({ campaign_id: cid, success: false, error: err.message });
            }
          }
          metaResponse = { type: "reduce_budget", results, metrics, reduction_pct: reductionPct };

        } else if (!META_TOKEN && rule.action !== "alert") {
          metaResponse = {
            type: rule.action,
            message: `META_ACCESS_TOKEN not configured — action skipped`,
            metrics,
          };
          status = "error";
        }
      } catch (actionErr: any) {
        metaResponse = { type: rule.action, error: actionErr.message, metrics };
        status = "error";
      }

      // 5. Write log
      await sb.from("automation_rule_logs").insert({
        rule_id: rule.id,
        conditions_snapshot: { conditions, metrics },
        action_taken: rule.action,
        target_id: targetId,
        meta_response: metaResponse,
        status,
      });

      // 6. Update rule timestamps
      await sb
        .from("automation_rules")
        .update({
          last_checked_at: new Date().toISOString(),
          last_triggered_at: new Date().toISOString(),
        })
        .eq("id", rule.id);

      triggered++;
    }

    return new Response(
      JSON.stringify({ processed: rules.length, triggered }),
      { headers: { ..._corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("auto-rules-engine error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ..._corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Resolve campaign IDs for a rule based on scope_ids, funnel_id, or all org campaigns
 */
async function getCampaignIds(sb: any, rule: any, orgId: string): Promise<string[]> {
  // If specific scope_ids provided, use them
  if (rule.scope_ids && rule.scope_ids.length > 0) {
    return rule.scope_ids;
  }

  // If funnel_id specified, get campaigns for that funnel
  if (rule.funnel_id) {
    const { data } = await sb
      .from("meta_insights")
      .select("campaign_id")
      .eq("organization_id", orgId)
      .eq("funnel_id", rule.funnel_id)
      .not("campaign_id", "is", null);

    const ids = [...new Set((data || []).map((r: any) => r.campaign_id))];
    return ids as string[];
  }

  // Otherwise get all org campaigns from recent insights
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const { data } = await sb
    .from("meta_insights")
    .select("campaign_id")
    .eq("organization_id", orgId)
    .gte("date_start", since.toISOString().split("T")[0])
    .not("campaign_id", "is", null);

  const ids = [...new Set((data || []).map((r: any) => r.campaign_id))];
  return ids as string[];
}
