// wz-scheduler v1.0.0
// Processa wz_scheduled_steps pendentes e retoma execuções via wz-executor
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[wz-scheduler] Missing env vars");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 1. Busca steps pendentes com run_at <= now()
    const { data: steps, error: stepsErr } = await supabase
      .from("wz_scheduled_steps")
      .select("*")
      .eq("status", "pending")
      .lte("run_at", new Date().toISOString())
      .order("run_at", { ascending: true })
      .limit(50);

    if (stepsErr) {
      console.error("[wz-scheduler] Error fetching steps:", stepsErr);
      return jsonResponse({ error: "DB error" }, 500);
    }

    if (!steps || steps.length === 0) {
      return jsonResponse({ message: "No pending steps", processed: 0 });
    }

    console.log(`[wz-scheduler] Processing ${steps.length} pending steps`);

    let processed = 0;
    let failed = 0;

    for (const step of steps) {
      try {
        // 2. Marcar como "processing" atomicamente (evita duplicação)
        const { data: updated, error: updateErr } = await supabase
          .from("wz_scheduled_steps")
          .update({ status: "processing" })
          .eq("id", step.id)
          .eq("status", "pending") // só atualiza se ainda pending
          .select("id")
          .single();

        if (updateErr || !updated) {
          console.log(`[wz-scheduler] Step ${step.id} already claimed, skipping`);
          continue;
        }

        // 3. Buscar execução
        const { data: execution, error: execErr } = await supabase
          .from("wz_executions")
          .select("id, flow_id, status")
          .eq("id", step.execution_id)
          .single();

        if (execErr || !execution) {
          console.error(`[wz-scheduler] Execution ${step.execution_id} not found`);
          await supabase.from("wz_scheduled_steps").update({ status: "failed" }).eq("id", step.id);
          failed++;
          continue;
        }

        // Se execução foi cancelada, não processar
        if (execution.status === "cancelled" || execution.status === "failed") {
          console.log(`[wz-scheduler] Execution ${execution.id} is ${execution.status}, skipping`);
          await supabase.from("wz_scheduled_steps").update({ status: "cancelled" }).eq("id", step.id);
          continue;
        }

        // 4. Buscar flow para encontrar o próximo nó via edges
        const { data: flow, error: flowErr } = await supabase
          .from("wz_flows")
          .select("edges")
          .eq("id", execution.flow_id)
          .single();

        if (flowErr || !flow) {
          console.error(`[wz-scheduler] Flow ${execution.flow_id} not found`);
          await supabase.from("wz_scheduled_steps").update({ status: "failed" }).eq("id", step.id);
          failed++;
          continue;
        }

        const edges = (flow.edges || []) as Array<{ source: string; target: string }>;
        const nextEdge = edges.find((e) => e.source === step.node_id);

        if (!nextEdge) {
          console.log(`[wz-scheduler] No next node after timer ${step.node_id}, completing`);
          await supabase.from("wz_scheduled_steps").update({ status: "completed" }).eq("id", step.id);
          await supabase
            .from("wz_executions")
            .update({ status: "completed", finished_at: new Date().toISOString() })
            .eq("id", execution.id);
          processed++;
          continue;
        }

        // 5. Atualizar execução para running
        await supabase
          .from("wz_executions")
          .update({ status: "running" })
          .eq("id", execution.id);

        // 6. Chamar wz-executor com o próximo nó
        const execUrl = `${supabaseUrl}/functions/v1/wz-executor`;
        const res = await fetch(execUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            execution_id: execution.id,
            flow_id: execution.flow_id,
            current_node_id: nextEdge.target,
          }),
        });

        const result = await res.text();

        if (res.ok) {
          await supabase.from("wz_scheduled_steps").update({ status: "completed" }).eq("id", step.id);
          processed++;
          console.log(`[wz-scheduler] Step ${step.id} → node ${nextEdge.target} OK`);
        } else {
          console.error(`[wz-scheduler] Executor error for step ${step.id}: ${res.status} ${result.slice(0, 300)}`);
          await supabase.from("wz_scheduled_steps").update({ status: "failed" }).eq("id", step.id);
          failed++;
        }
      } catch (err) {
        console.error(`[wz-scheduler] Error processing step ${step.id}:`, err);
        await supabase.from("wz_scheduled_steps").update({ status: "failed" }).eq("id", step.id);
        failed++;
      }
    }

    console.log(`[wz-scheduler] Done: ${processed} processed, ${failed} failed`);
    return jsonResponse({ message: "Done", processed, failed, total: steps.length });
  } catch (err) {
    console.error("[wz-scheduler] Fatal error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
