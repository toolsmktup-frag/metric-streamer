// v1.1.0 - added ab_split, smart_delay, webhook, tag, goto, note handlers
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

// ─── Smart Delay calculator ───
function calculateSmartDelayRunAt(nodeData: Record<string, any>): string {
  const targetTime = nodeData.targetTime || "09:00";
  const targetDay = nodeData.targetDay || "any";
  const businessDaysOnly = nodeData.businessDaysOnly || false;

  const [hours, minutes] = targetTime.split(":").map(Number);
  const now = new Date();
  let target = new Date(now);
  target.setHours(hours, minutes, 0, 0);

  // If target time already passed today, move to tomorrow
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  // Adjust for specific day
  const dayMap: Record<string, number> = {
    monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0,
  };

  if (targetDay === "next_business" || businessDaysOnly) {
    // Skip weekends (0=Sun, 6=Sat)
    while (target.getDay() === 0 || target.getDay() === 6) {
      target.setDate(target.getDate() + 1);
    }
  } else if (dayMap[targetDay] !== undefined) {
    const targetDow = dayMap[targetDay];
    while (target.getDay() !== targetDow) {
      target.setDate(target.getDate() + 1);
    }
  }

  return target.toISOString();
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

    // ─── NEW: A/B Split ───
    } else if (nodeType === "ab_split") {
      const paths = nodeData.paths || [
        { label: "A", percent: 50 },
        { label: "B", percent: 50 },
      ];
      const rand = Math.random() * 100;
      let cumulative = 0;
      let selectedIndex = 0;
      for (let i = 0; i < paths.length; i++) {
        cumulative += paths[i].percent;
        if (rand <= cumulative) {
          selectedIndex = i;
          break;
        }
      }
      const sourceHandle = `path_${selectedIndex}`;
      console.log(`[wz-executor] A/B Split: rand=${rand.toFixed(1)} → ${paths[selectedIndex].label} (${sourceHandle})`);
      const nextEdge = edges.find((e) => e.source === current_node_id && e.sourceHandle === sourceHandle);
      if (nextEdge) {
        return await advanceToNext(supabase, execution_id, flow_id, nextEdge.target);
      } else {
        await markFinished(supabase, execution_id, "completed");
        return jsonResponse({ message: "A/B split end — no edge for path" });
      }

    // ─── NEW: Smart Delay ───
    } else if (nodeType === "smart_delay") {
      const runAt = calculateSmartDelayRunAt(nodeData);
      await supabase.from("wz_scheduled_steps").insert({
        execution_id: execution_id,
        node_id: current_node_id,
        run_at: runAt,
        status: "pending",
      });
      await supabase
        .from("wz_executions")
        .update({ status: "waiting", current_node_id })
        .eq("id", execution_id);
      console.log(`[wz-executor] Smart delay scheduled → ${runAt}`);
      return jsonResponse({ message: "Smart delay scheduled", run_at: runAt });

    // ─── NEW: Webhook HTTP ───
    } else if (nodeType === "webhook") {
      const method = (nodeData.method || "POST").toUpperCase();
      const url = substituteVariables(nodeData.url || "", vars);
      let headers: Record<string, string> = { "Content-Type": "application/json" };
      try {
        if (nodeData.headers) {
          const parsed = JSON.parse(nodeData.headers);
          headers = { ...headers, ...parsed };
        }
      } catch (_) { /* invalid JSON headers, use defaults */ }
      const bodyStr = nodeData.body ? substituteVariables(nodeData.body, vars) : undefined;

      if (url) {
        try {
          const fetchOpts: RequestInit = { method, headers };
          if (method !== "GET" && bodyStr) fetchOpts.body = bodyStr;
          const res = await fetch(url, fetchOpts);
          const result = await res.text();
          console.log(`[wz-executor] Webhook ${method} ${url} → ${res.status}`);
        } catch (err) {
          console.error(`[wz-executor] Webhook error:`, err);
        }
      } else {
        console.warn("[wz-executor] Webhook node has no URL configured");
      }

    // ─── NEW: Tag ───
    } else if (nodeType === "tag") {
      const tagName = nodeData.tagName;
      const tagAction = nodeData.tagAction || "add";
      if (tagName && execution.contact_phone) {
        try {
          const { data: leads } = await supabase
            .from("leads")
            .select("id, metadata")
            .eq("phone", execution.contact_phone)
            .limit(1);
          if (leads && leads.length > 0) {
            const lead = leads[0];
            const metadata = lead.metadata || {};
            const tags: string[] = metadata.tags || [];
            if (tagAction === "add" && !tags.includes(tagName)) {
              tags.push(tagName);
            } else if (tagAction === "remove") {
              const idx = tags.indexOf(tagName);
              if (idx >= 0) tags.splice(idx, 1);
            }
            metadata.tags = tags;
            await supabase.from("leads").update({ metadata }).eq("id", lead.id);
            console.log(`[wz-executor] Tag ${tagAction}: "${tagName}" on lead ${lead.id}`);
          }
        } catch (err) {
          console.error("[wz-executor] Tag error:", err);
        }
      }

    // ─── NEW: Goto ───
    } else if (nodeType === "goto") {
      const targetNodeId = nodeData.targetNodeId;
      if (targetNodeId) {
        console.log(`[wz-executor] Goto → ${targetNodeId}`);
        return await advanceToNext(supabase, execution_id, flow_id, targetNodeId);
      } else {
        console.warn("[wz-executor] Goto node has no targetNodeId");
        await markFinished(supabase, execution_id, "completed");
        return jsonResponse({ message: "Goto end — no target" });
      }

    // ─── Note / trigger — skip (non-executable) ───
    } else if (nodeType === "note" || nodeType === "trigger") {
      console.log(`[wz-executor] Skipping non-executable node: ${nodeType}`);
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
  const messages: Array<{
    text: string; type: string; imageUrl?: string; caption?: string;
    skipIfReplied?: boolean;
    blocks?: Array<{ text: string; type: string; imageUrl?: string; caption?: string; skipIfReplied?: boolean }>;
  }> = nodeData.messages || [];

  if (messages.length === 0) {
    console.warn("WhatsApp node has no messages");
    return;
  }

  // Pick random variation
  const msg = messages[Math.floor(Math.random() * messages.length)];

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

  const cleanPhone = String(phone).replace(/\D/g, "");
  const apiUrl = instance.api_url.replace(/\/+$/, "");

  // Resolve blocks
  const blocks = (msg.blocks && msg.blocks.length > 0)
    ? msg.blocks
    : [{ text: msg.text || "", type: msg.type || "text", imageUrl: msg.imageUrl, caption: msg.caption, skipIfReplied: msg.skipIfReplied }];

  // Helper: check if contact replied since execution started
  let hasReplied: boolean | null = null;
  async function checkIfReplied(): Promise<boolean> {
    if (hasReplied !== null) return hasReplied;
    try {
      const { data: replies } = await supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("phone", cleanPhone)
        .eq("direction", "incoming")
        .gte("created_at", execution.started_at)
        .limit(1);
      hasReplied = !!(replies && replies.length > 0);
    } catch (err) {
      console.warn("[wz-executor] Error checking replies:", err);
      hasReplied = false;
    }
    return hasReplied;
  }

  // Send each block sequentially
  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];

    // Check skipIfReplied condition
    if (block.skipIfReplied) {
      const replied = await checkIfReplied();
      if (replied) {
        console.log(`[wz-executor] Skipping block ${bi} — contact replied`);
        continue;
      }
    }

    const text = substituteVariables(block.text, vars);

    // Humanization delay between blocks (skip before first block)
    if (bi > 0) {
      const delayMin = nodeData.delayMin ?? 1;
      const delayMax = nodeData.delayMax ?? 5;
      await sleep(randomDelay(delayMin, delayMax));
    }

    const isMedia = block.type === "image";
    const endpoint = isMedia ? `${apiUrl}/send/media` : `${apiUrl}/send/text`;

    const body: Record<string, any> = isMedia
      ? {
          number: cleanPhone,
          type: "image",
          file: block.imageUrl || "",
          text: substituteVariables(block.caption || "", vars),
          readchat: true, readmessages: true, async: false,
        }
      : {
          number: cleanPhone,
          text,
          readchat: true, readmessages: true, async: false,
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
      console.log(`[wz-executor] WhatsApp block ${bi} sent to ${cleanPhone}: status=${res.status}`);

      if (!res.ok) {
        console.error(`[wz-executor] UAZAPI error: ${res.status} ${result.slice(0, 500)}`);
      }
    } catch (err) {
      console.error(`[wz-executor] WhatsApp send error block ${bi}:`, err);
    }
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
