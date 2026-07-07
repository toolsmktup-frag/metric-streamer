// wz-cancel-pending: cancela os disparos pendentes de um fluxo da automação WZ.
// Recebe: { flow_id, dry_run? }
// Marca wz_scheduled_steps 'pending' → 'cancelled' e wz_executions
// 'waiting'/'running' → 'cancelled'. Com dry_run só retorna as contagens.
// Usado pela aba Webinário do funil (botão "Cancelar disparos pendentes").

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const CHUNK = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    // 🔒 Exige usuário autenticado (acionado pela UI). Bloqueia cancelamento anônimo.
    const authHeader = req.headers.get("Authorization") || "";
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user: authedUser }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !authedUser) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const flow_id: string | undefined = body.flow_id;
    const dry_run = !!body.dry_run;

    if (!flow_id) {
      return jsonResponse({ error: "Missing params", required: ["flow_id"] }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: flow, error: flowErr } = await supabase
      .from("wz_flows")
      .select("id, name")
      .eq("id", flow_id)
      .single();
    if (flowErr || !flow) return jsonResponse({ error: "Flow not found" }, 404);

    // Executions do flow (paginado — pode passar de 1000)
    const allIds: string[] = [];
    const activeIds: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("wz_executions")
        .select("id, status")
        .eq("flow_id", flow_id)
        .range(offset, offset + 999);
      if (error) return jsonResponse({ error: error.message }, 500);
      for (const row of data || []) {
        allIds.push(row.id);
        if (row.status === "waiting" || row.status === "running") activeIds.push(row.id);
      }
      if (!data || data.length < 1000) break;
    }

    if (dry_run) {
      let pendingSteps = 0;
      for (let i = 0; i < allIds.length; i += CHUNK) {
        const { count, error } = await supabase
          .from("wz_scheduled_steps")
          .select("id", { count: "exact", head: true })
          .in("execution_id", allIds.slice(i, i + CHUNK))
          .eq("status", "pending");
        if (error) return jsonResponse({ error: error.message }, 500);
        pendingSteps += count || 0;
      }
      return jsonResponse({
        dry_run: true,
        flow_id,
        flow_name: flow.name,
        pending_steps: pendingSteps,
        active_executions: activeIds.length,
      });
    }

    let cancelledSteps = 0;
    for (let i = 0; i < allIds.length; i += CHUNK) {
      const { data, error } = await supabase
        .from("wz_scheduled_steps")
        .update({ status: "cancelled" })
        .in("execution_id", allIds.slice(i, i + CHUNK))
        .eq("status", "pending")
        .select("id");
      if (error) return jsonResponse({ error: error.message }, 500);
      cancelledSteps += (data || []).length;
    }

    let cancelledExecutions = 0;
    const finishedAt = new Date().toISOString();
    for (let i = 0; i < activeIds.length; i += CHUNK) {
      // repete o filtro de status para não atropelar execução que o scheduler
      // tenha avançado entre a listagem e o update
      const { data, error } = await supabase
        .from("wz_executions")
        .update({ status: "cancelled", finished_at: finishedAt })
        .in("id", activeIds.slice(i, i + CHUNK))
        .in("status", ["waiting", "running"])
        .select("id");
      if (error) return jsonResponse({ error: error.message }, 500);
      cancelledExecutions += (data || []).length;
    }

    console.log(`[wz-cancel-pending] user=${authedUser.id} flow=${flow_id} steps=${cancelledSteps} execs=${cancelledExecutions}`);

    return jsonResponse({
      dry_run: false,
      flow_id,
      flow_name: flow.name,
      cancelled_steps: cancelledSteps,
      cancelled_executions: cancelledExecutions,
    });
  } catch (e) {
    console.error("[wz-cancel-pending] error:", e);
    return jsonResponse({ error: String((e as Error)?.message || e) }, 500);
  }
});
