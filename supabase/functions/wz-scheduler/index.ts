// wz-scheduler v2.0.0
// Retry + batch parallel processing
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

const MAX_RETRIES = 3;
const BATCH_SIZE = 10;
const FETCH_LIMIT = 100;

async function processStep(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  step: any
): Promise<{ status: "processed" | "failed" | "skipped" }> {
  try {
    // Claim step atomically
    const { data: updated, error: updateErr } = await supabase
      .from("wz_scheduled_steps")
      .update({ status: "processing" })
      .eq("id", step.id)
      .eq("status", "pending")
      .select("id")
      .single();

    if (updateErr || !updated) {
      return { status: "skipped" };
    }

    // Fetch execution
    const { data: execution, error: execErr } = await supabase
      .from("wz_executions")
      .select("id, flow_id, status")
      .eq("id", step.execution_id)
      .single();

    if (execErr || !execution) {
      await markStepFailed(supabase, step);
      return { status: "failed" };
    }

    if (execution.status === "cancelled" || execution.status === "failed") {
      await supabase.from("wz_scheduled_steps").update({ status: "cancelled" }).eq("id", step.id);
      return { status: "skipped" };
    }

    // Find next node
    const { data: flow, error: flowErr } = await supabase
      .from("wz_flows")
      .select("edges")
      .eq("id", execution.flow_id)
      .single();

    if (flowErr || !flow) {
      await markStepFailed(supabase, step);
      return { status: "failed" };
    }

    const edges = (flow.edges || []) as Array<{ source: string; target: string }>;
    const nextEdge = edges.find((e) => e.source === step.node_id);

    if (!nextEdge) {
      await supabase.from("wz_scheduled_steps").update({ status: "completed" }).eq("id", step.id);
      await supabase
        .from("wz_executions")
        .update({ status: "completed", finished_at: new Date().toISOString() })
        .eq("id", execution.id);
      return { status: "processed" };
    }

    // Resume execution
    await supabase.from("wz_executions").update({ status: "running" }).eq("id", execution.id);

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
      return { status: "processed" };
    } else {
      console.error(`[wz-scheduler] Executor error for step ${step.id}: ${res.status} ${result.slice(0, 300)}`);
      await markStepFailed(supabase, step);
      return { status: "failed" };
    }
  } catch (err) {
    console.error(`[wz-scheduler] Error processing step ${step.id}:`, err);
    await markStepFailed(supabase, step);
    return { status: "failed" };
  }
}

async function markStepFailed(supabase: any, step: any) {
  const retryCount = (step.retry_count || 0) + 1;
  if (retryCount < MAX_RETRIES) {
    // Return to pending with incremented retry count
    await supabase
      .from("wz_scheduled_steps")
      .update({ status: "pending", retry_count: retryCount })
      .eq("id", step.id);
    console.log(`[wz-scheduler] Step ${step.id} retry ${retryCount}/${MAX_RETRIES}`);
  } else {
    await supabase
      .from("wz_scheduled_steps")
      .update({ status: "failed", retry_count: retryCount })
      .eq("id", step.id);
    console.error(`[wz-scheduler] Step ${step.id} failed after ${MAX_RETRIES} retries`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: steps, error: stepsErr } = await supabase
      .from("wz_scheduled_steps")
      .select("*")
      .eq("status", "pending")
      .lte("run_at", new Date().toISOString())
      .order("run_at", { ascending: true })
      .limit(FETCH_LIMIT);

    if (stepsErr) {
      return jsonResponse({ error: "DB error" }, 500);
    }

    if (!steps || steps.length === 0) {
      return jsonResponse({ message: "No pending steps", processed: 0 });
    }

    console.log(`[wz-scheduler] Processing ${steps.length} pending steps in batches of ${BATCH_SIZE}`);

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    // Process in parallel batches
    for (let i = 0; i < steps.length; i += BATCH_SIZE) {
      const batch = steps.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((step: any) => processStep(supabase, supabaseUrl, serviceRoleKey, step))
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value.status === "processed") processed++;
          else if (r.value.status === "failed") failed++;
          else skipped++;
        } else {
          failed++;
        }
      }
    }

    console.log(`[wz-scheduler] Done: ${processed} processed, ${failed} failed, ${skipped} skipped`);
    return jsonResponse({ message: "Done", processed, failed, skipped, total: steps.length });
  } catch (err) {
    console.error("[wz-scheduler] Fatal error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
