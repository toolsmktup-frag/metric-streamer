// v1.0.1 - redeploy for matheuscolombo.uazapi.com migration
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

// ─── Variable substitution ───

function substituteVariables(text: string, vars: Record<string, any>): string {
  return text
    .replace(/\{\{nome\}\}/gi, vars._contact_name || "")
    .replace(/\{\{email\}\}/gi, vars._contact_email || "")
    .replace(/\{\{telefone\}\}/gi, vars._contact_phone || "")
    .replace(/\{\{produto\}\}/gi, vars.product_name || "")
    .replace(/\{\{oferta\}\}/gi, vars.offer_name || "")
    .replace(/\{\{valor\}\}/gi, formatCurrency(vars.gross_amount))
    .replace(/\{\{parcelas\}\}/gi, String(vars.installments || 1))
    .replace(/\{\{metodo_pagamento\}\}/gi, vars.payment_method || "")
    .replace(/\{\{plataforma\}\}/gi, vars.platform || "")
    .replace(/\{\{codigo_pix\}\}/gi, vars.pix_code || "")
    .replace(/\{\{codigo_boleto\}\}/gi, vars.boleto_code || "")
    .replace(/\{\{link_boleto\}\}/gi, vars.boleto_url || "")
    .trim();
}

function formatCurrency(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "R$0,00";
  return `R$${n.toFixed(2).replace(".", ",")}`;
}

// ─── Sleep helper ───
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

// ─── Main handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[wz-executor] Missing env vars", { hasUrl: !!supabaseUrl, hasKey: !!serviceRoleKey });
    return jsonResponse({ error: "Server configuration error" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { execution_id, flow_id, current_node_id } = await req.json();

    if (!execution_id || !flow_id || !current_node_id) {
      return jsonResponse({ error: "Missing params" }, 400);
    }

    // Fetch execution
    const { data: execution, error: execErr } = await supabase
      .from("wz_executions")
      .select("*")
      .eq("id", execution_id)
      .single();

    if (execErr || !execution) {
      console.error("Execution not found:", execErr);
      return jsonResponse({ error: "Execution not found" }, 404);
    }

    // Fetch flow
    const { data: flow, error: flowErr } = await supabase
      .from("wz_flows")
      .select("nodes, edges")
      .eq("id", flow_id)
      .single();

    if (flowErr || !flow) {
      return jsonResponse({ error: "Flow not found" }, 404);
    }

    const nodes = (flow.nodes || []) as Record<string, any>[];
    const edges = (flow.edges || []) as Record<string, any>[];
    const node = nodes.find((n) => n.id === current_node_id);

    if (!node) {
      await markFinished(supabase, execution_id, "failed");
      return jsonResponse({ error: "Node not found" }, 404);
    }

    // Merge contact info into variables for substitution
    const vars = {
      ...(execution.variables || {}),
      _contact_name: execution.contact_name,
      _contact_email: execution.contact_email,
      _contact_phone: execution.contact_phone,
    };

    const nodeData = node.data || {};
    const nodeType = node.type;

    console.log(`[wz-executor] Exec=${execution_id} Node=${current_node_id} Type=${nodeType}`);

    // Update current_node_id
    await supabase
      .from("wz_executions")
      .update({ current_node_id })
      .eq("id", execution_id);

    // ─── PROCESS NODE ───

    if (nodeType === "whatsapp") {
      await processWhatsAppNode(supabase, execution, nodeData, vars);
    } else if (nodeType === "timer") {
      await processTimerNode(supabase, execution_id, current_node_id, nodeData);
      // Timer creates a scheduled step and stops execution here
      return jsonResponse({ message: "Scheduled", node: current_node_id });
    } else if (nodeType === "condition") {
      const result = evaluateCondition(nodeData, vars);
      const handleId = result ? "yes" : "no";
      const nextEdge = edges.find((e) => e.source === current_node_id && e.sourceHandle === handleId);
      if (nextEdge) {
        return await advanceToNext(supabase, execution_id, flow_id, nextEdge.target);
      } else {
        await markFinished(supabase, execution_id, "completed");
        return jsonResponse({ message: "Condition end", result: handleId });
      }
    } else if (nodeType === "stop") {
      if (nodeData.stopType === "cancel_previous") {
        // Cancel all running executions for same flow + same phone (except current)
        if (execution.contact_phone) {
          await supabase
            .from("wz_executions")
            .update({ status: "cancelled", finished_at: new Date().toISOString() })
            .eq("flow_id", flow_id)
            .eq("contact_phone", execution.contact_phone)
            .eq("status", "running")
            .neq("id", execution_id);
        }
      }
      await markFinished(supabase, execution_id, "completed");
      return jsonResponse({ message: "Flow stopped" });
    }

    // ─── Advance to next node ───
    const nextEdge = edges.find((e) => e.source === current_node_id);
    if (nextEdge) {
      return await advanceToNext(supabase, execution_id, flow_id, nextEdge.target);
    } else {
      await markFinished(supabase, execution_id, "completed");
      return jsonResponse({ message: "Flow completed" });
    }
  } catch (err) {
    console.error("[wz-executor] Error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});

// ─── Node processors ───

async function processWhatsAppNode(
  supabase: any,
  execution: Record<string, any>,
  nodeData: Record<string, any>,
  vars: Record<string, any>
) {
  const messages: Array<{ text: string; type: string; imageUrl?: string; caption?: string }> =
    nodeData.messages || [];

  if (messages.length === 0) {
    console.warn("WhatsApp node has no messages");
    return;
  }

  // Pick random variation
  const msg = messages[Math.floor(Math.random() * messages.length)];
  const text = substituteVariables(msg.text, vars);

  // Get instance
  const instanceId = nodeData.instanceId;
  if (!instanceId) {
    console.error("No instance configured for WhatsApp node");
    return;
  }

  const { data: instance } = await supabase
    .from("wz_instances")
    .select("api_url, api_key")
    .eq("id", instanceId)
    .single();

  if (!instance) {
    console.error("Instance not found:", instanceId);
    return;
  }

  const phone = execution.contact_phone;
  if (!phone) {
    console.warn("No phone for execution:", execution.id);
    return;
  }

  // Humanization delay
  const delayMin = nodeData.delayMin ?? 1;
  const delayMax = nodeData.delayMax ?? 5;
  await sleep(randomDelay(delayMin, delayMax));

  // Send via UAZAPI — token header (v2), phone only in body
  const apiUrl = instance.api_url.replace(/\/+$/, "");
  const cleanPhone = String(phone).replace(/\D/g, "");

  const isMedia = msg.type === "image";
  const endpoint = isMedia
    ? `${apiUrl}/send/media`
    : `${apiUrl}/send/text`;

  const body: Record<string, any> = isMedia
    ? {
        number: cleanPhone,
        type: "image",
        file: msg.imageUrl || "",
        text: substituteVariables(msg.caption || "", vars),
        readchat: true,
        readmessages: true,
        async: false,
      }
    : {
        number: cleanPhone,
        text,
        readchat: true,
        readmessages: true,
        async: false,
      };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        token: instance.api_key,
      },
      body: JSON.stringify(body),
    });

    const result = await res.text();
    console.log(`[wz-executor] WhatsApp sent to ${cleanPhone}: status=${res.status} body=${result.slice(0, 500)}`);

    if (!res.ok) {
      console.error(`[wz-executor] UAZAPI error: ${res.status} ${result.slice(0, 500)}`);
    }
  } catch (err) {
    console.error(`[wz-executor] WhatsApp send error:`, err);
  }
}

async function processTimerNode(
  supabase: any,
  executionId: string,
  nodeId: string,
  nodeData: Record<string, any>
) {
  const delay = Number(nodeData.delay || 1);
  const unit = nodeData.unit || "minutes";

  let ms = delay * 60 * 1000; // default minutes
  if (unit === "hours") ms = delay * 60 * 60 * 1000;
  else if (unit === "days") ms = delay * 24 * 60 * 60 * 1000;

  const runAt = new Date(Date.now() + ms).toISOString();

  // Create scheduled step
  await supabase.from("wz_scheduled_steps").insert({
    execution_id: executionId,
    node_id: nodeId,
    run_at: runAt,
    status: "pending",
  });

  // Update execution to waiting
  await supabase
    .from("wz_executions")
    .update({ status: "waiting", current_node_id: nodeId })
    .eq("id", executionId);

  console.log(`[wz-executor] Timer scheduled: ${delay} ${unit} → ${runAt}`);
}

function evaluateCondition(nodeData: Record<string, any>, vars: Record<string, any>): boolean {
  const variable = nodeData.variable;
  const operator = nodeData.operator;
  const compareValue = nodeData.compareValue;

  if (!variable || !operator || compareValue === undefined) return false;

  const actual = String(vars[variable] || "").toLowerCase();
  const expected = String(compareValue).toLowerCase();

  switch (operator) {
    case "equals":
      return actual === expected;
    case "contains":
      return actual.includes(expected);
    case "greater_than":
      return Number(actual) > Number(expected);
    case "less_than":
      return Number(actual) < Number(expected);
    case "not_equals":
      return actual !== expected;
    default:
      return false;
  }
}

// ─── Helpers ───

async function markFinished(supabase: any, executionId: string, status: string) {
  await supabase
    .from("wz_executions")
    .update({ status, finished_at: new Date().toISOString() })
    .eq("id", executionId);
}

async function advanceToNext(
  supabase: any,
  executionId: string,
  flowId: string,
  nextNodeId: string
): Promise<Response> {
  // Call self recursively for next node
  const execUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/wz-executor`;
  try {
    const res = await fetch(execUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        execution_id: executionId,
        flow_id: flowId,
        current_node_id: nextNodeId,
      }),
    });
    const result = await res.text();
    return jsonResponse({ message: "Advanced", next: nextNodeId });
  } catch (err) {
    console.error("Error advancing:", err);
    await markFinished(supabase, executionId, "failed");
    return jsonResponse({ error: "Advance failed" }, 500);
  }
}
