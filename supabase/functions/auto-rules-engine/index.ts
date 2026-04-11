import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://deno.land/x/cors_headers@v0.1.1/mod.ts";

const _corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RuleCondition {
  metric: string;
  operator: string;
  value: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: _corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

      // Fetch spend from meta_insights
      const { data: insights } = await sb
        .from("meta_insights")
        .select("spend, campaign_id")
        .eq("organization_id", orgId)
        .gte("date_start", sinceStr);

      const totalSpend = (insights || []).reduce(
        (s: number, r: any) => s + Number(r.spend || 0),
        0
      );

      // Fetch revenue from v_all_sales (view)
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

      // Derive metrics
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

      if (!allMet) continue;

      // 4. Execute action
      let metaResponse: any = null;
      let targetId: string | null = null;

      if (rule.action === "alert") {
        // For now, just log the alert — could send email/webhook in the future
        metaResponse = { type: "alert", message: `Rule "${rule.name}" triggered`, metrics };
      } else if (rule.action === "pause_campaign" || rule.action === "reduce_budget") {
        // Get Meta access token from the funnel or org
        // For now, log as pending — actual Meta API integration requires access_token per funnel
        metaResponse = {
          type: rule.action,
          message: `Action ${rule.action} would be executed`,
          metrics,
          note: "Meta API integration pending — requires access_token configuration",
        };
      }

      // 5. Write log
      await sb.from("automation_rule_logs").insert({
        rule_id: rule.id,
        conditions_snapshot: { conditions, metrics },
        action_taken: rule.action,
        target_id: targetId,
        meta_response: metaResponse,
        status: "success",
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

    // Update last_checked_at for rules that didn't trigger
    const now = new Date().toISOString();
    for (const rule of rules) {
      await sb
        .from("automation_rules")
        .update({ last_checked_at: now })
        .eq("id", rule.id)
        .is("last_checked_at", null)
        .or(`last_checked_at.lt.${now}`);
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
