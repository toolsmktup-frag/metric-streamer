// v2.0.0 - added per-node logging to wz_execution_logs
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

// ─── Node Logger ───

async function logNodeStart(supabase: any, executionId: string, nodeId: string, nodeType: string, inputData: any): Promise<string> {
  try {
    const { data } = await supabase.from("wz_execution_logs").insert({
      execution_id: executionId,
      node_id: nodeId,
      node_type: nodeType,
      status: "running",
      input_data: inputData,
      started_at: new Date().toISOString(),
    }).select("id").single();
    return data?.id || "";
  } catch (err) {
    console.error("[wz-executor] Log start error:", err);
    return "";
  }
}

async function logNodeEnd(supabase: any, logId: string, status: string, outputData?: any, errorMessage?: string) {
  if (!logId) return;
  try {
    await supabase.from("wz_execution_logs").update({
      status,
      output_data: outputData || null,
      error_message: errorMessage || null,
      finished_at: new Date().toISOString(),
    }).eq("id", logId);
  } catch (err) {
    console.error("[wz-executor] Log end error:", err);
  }
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

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const dayMap: Record<string, number> = {
    monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0,
  };

  if (targetDay === "next_business" || businessDaysOnly) {
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
    console.error("[wz-executor] Missing env vars");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();
    const { execution_id, flow_id, current_node_id, replay_execution_id } = body;

    // ─── REPLAY MODE ───
    if (replay_execution_id) {
      console.log(`[wz-executor] Replay requested for execution ${replay_execution_id}`);

      const { data: original, error: origErr } = await supabase
        .from("wz_executions")
        .select("*")
        .eq("id", replay_execution_id)
        .single();

      if (origErr || !original) {
        return jsonResponse({ error: "Original execution not found" }, 404);
      }

      // Fetch the flow to find the first node after trigger
      const { data: replayFlow, error: rfErr } = await supabase
        .from("wz_flows")
        .select("nodes, edges")
        .eq("id", original.flow_id)
        .single();

      if (rfErr || !replayFlow) {
        return jsonResponse({ error: "Flow not found for replay" }, 404);
      }

      const rNodes = (replayFlow.nodes || []) as Record<string, any>[];
      const rEdges = (replayFlow.edges || []) as Record<string, any>[];

      // Find trigger node, then find the first node connected after it
      const triggerNode = rNodes.find((n: any) => n.type === "trigger");
      if (!triggerNode) {
        return jsonResponse({ error: "No trigger node in flow" }, 400);
      }
      const firstEdge = rEdges.find((e: any) => e.source === triggerNode.id);
      if (!firstEdge) {
        return jsonResponse({ error: "No edge from trigger node" }, 400);
      }

      // Create new execution cloned from original
      const { data: newExec, error: newErr } = await supabase
        .from("wz_executions")
        .insert({
          flow_id: original.flow_id,
          contact_phone: original.contact_phone,
          contact_name: original.contact_name,
          contact_email: original.contact_email,
          trigger_event: "replay",
          trigger_payload: original.trigger_payload,
          variables: original.variables || {},
          status: "running",
          current_node_id: firstEdge.target,
        })
        .select("id")
        .single();

      if (newErr || !newExec) {
        return jsonResponse({ error: "Failed to create replay execution" }, 500);
      }

      console.log(`[wz-executor] Replay execution created: ${newExec.id} (original: ${replay_execution_id})`);

      // Fire the executor for the new execution
      const execUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/wz-executor`;
      const execRes = await fetch(execUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          execution_id: newExec.id,
          flow_id: original.flow_id,
          current_node_id: firstEdge.target,
        }),
      });
      const execResult = await execRes.text();

      return jsonResponse({
        message: "Replay started",
        original_execution_id: replay_execution_id,
        new_execution_id: newExec.id,
      });
    }

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

    // Build vars with execution context
    const vars: Record<string, any> = {
      ...(execution.variables || {}),
      _contact_name: execution.contact_name,
      _contact_email: execution.contact_email,
      _contact_phone: execution.contact_phone,
    };

    // Load lead tags from metadata if contact has a phone
    if (execution.contact_phone) {
      try {
        const { data: leadData } = await supabase
          .from("leads")
          .select("metadata")
          .eq("phone", execution.contact_phone)
          .maybeSingle();
        const leadTags: string[] = leadData?.metadata?.tags || [];
        vars._lead_tags = leadTags;
        vars.tag = leadTags.join(", ");
      } catch (e) {
        console.warn("[wz-executor] Failed to load lead tags:", e);
        vars._lead_tags = [];
        vars.tag = "";
      }
    }

    const nodeData = node.data || {};
    const nodeType = node.type;

    console.log(`[wz-executor] Exec=${execution_id} Node=${current_node_id} Type=${nodeType}`);

    await supabase
      .from("wz_executions")
      .update({ current_node_id })
      .eq("id", execution_id);

    // ─── Log start ───
    const logId = await logNodeStart(supabase, execution_id, current_node_id, nodeType, {
      node_data: nodeData,
      variables: vars,
    });

    // ─── PROCESS NODE ───
    try {
      if (nodeType === "whatsapp") {
        const result = await processWhatsAppNode(supabase, execution, nodeData, vars);
        await logNodeEnd(supabase, logId, "success", result);

      } else if (nodeType === "timer") {
        const runAt = await processTimerNode(supabase, execution_id, current_node_id, nodeData);
        await logNodeEnd(supabase, logId, "success", { summary: `Agendado → ${runAt}`, run_at: runAt });
        return jsonResponse({ message: "Scheduled", node: current_node_id });

      } else if (nodeType === "condition") {
        const result = evaluateCondition(nodeData, vars);
        const handleId = result ? "yes" : "no";
        await logNodeEnd(supabase, logId, "success", { summary: handleId, result, variable: nodeData.variable, operator: nodeData.operator });
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
        await logNodeEnd(supabase, logId, "success", { summary: nodeData.stopType || "stop" });
        await markFinished(supabase, execution_id, "completed");
        return jsonResponse({ message: "Flow stopped" });

      } else if (nodeType === "ab_split") {
        const splitMode = nodeData.splitMode || "percentage";
        const paths = nodeData.paths || [
          { label: "A", percent: 50 },
          { label: "B", percent: 50 },
        ];
        const sellers: { id: string; name: string }[] = nodeData.sellers || [];
        const assignAction = nodeData.assignAction || "assign_and_branch";
        const isSeller = splitMode === "round_robin" || splitMode === "random";

        let selectedIndex = 0;
        let selectedLabel = "";
        let selectedSellerId: string | null = null;
        let selectedSellerName = "";
        let logExtra: Record<string, any> = {};

        if (splitMode === "percentage") {
          const rand = Math.random() * 100;
          let cumulative = 0;
          for (let i = 0; i < paths.length; i++) {
            cumulative += paths[i].percent;
            if (rand <= cumulative) { selectedIndex = i; break; }
          }
          selectedLabel = paths[selectedIndex].label;
          logExtra = { rand: rand.toFixed(1) };

        } else if (splitMode === "fixed_count") {
          // Count how many executions already passed through this node
          const { count } = await supabase
            .from("wz_execution_logs")
            .select("id", { count: "exact", head: true })
            .eq("node_id", current_node_id)
            .eq("node_type", "ab_split")
            .eq("status", "success");
          const totalPassed = count || 0;
          let cumCount = 0;
          for (let i = 0; i < paths.length; i++) {
            cumCount += paths[i].count || 0;
            if (totalPassed < cumCount) { selectedIndex = i; break; }
          }
          selectedLabel = paths[selectedIndex].label;
          logExtra = { total_passed: totalPassed };

        } else if (isSeller && sellers.length > 0) {
          if (splitMode === "round_robin") {
            // Count previous executions for this node to distribute sequentially
            const { count } = await supabase
              .from("wz_execution_logs")
              .select("id", { count: "exact", head: true })
              .eq("node_id", current_node_id)
              .eq("node_type", "ab_split")
              .eq("status", "success");
            selectedIndex = (count || 0) % sellers.length;
          } else {
            // random
            selectedIndex = Math.floor(Math.random() * sellers.length);
          }
          selectedSellerId = sellers[selectedIndex].id;
          selectedSellerName = sellers[selectedIndex].name;
          selectedLabel = selectedSellerName;
          logExtra = { seller_id: selectedSellerId, seller_name: selectedSellerName, mode: splitMode };

          // ─── Assign seller in CRM ───
          if (selectedSellerId && execution.contact_phone) {
            const cleanPhone = String(execution.contact_phone).replace(/\D/g, "");
            const { data: matchedLeads } = await supabase
              .from("leads")
              .select("id")
              .eq("phone", cleanPhone)
              .limit(1);
            if (matchedLeads && matchedLeads.length > 0) {
              await supabase
                .from("leads")
                .update({ assigned_to: selectedSellerId, updated_at: new Date().toISOString() })
                .eq("id", matchedLeads[0].id);
              logExtra.lead_id = matchedLeads[0].id;
              logExtra.assigned = true;
            } else {
              logExtra.assigned = false;
              logExtra.reason = "Lead não encontrado pelo telefone";
            }
          }
        } else if (isSeller && sellers.length === 0) {
          await logNodeEnd(supabase, logId, "skipped", { summary: "Nenhum vendedor configurado" });
          // Fall through to default next edge
          const nextEdge = edges.find((e: any) => e.source === current_node_id);
          if (nextEdge) {
            return await advanceToNext(supabase, execution_id, flow_id, nextEdge.target);
          } else {
            await markFinished(supabase, execution_id, "completed");
            return jsonResponse({ message: "A/B split end — no sellers" });
          }
        }

        // Determine output handle
        let sourceHandle: string;
        if (isSeller && assignAction === "assign_only") {
          sourceHandle = "path_0"; // single output
        } else {
          sourceHandle = `path_${selectedIndex}`;
        }

        await logNodeEnd(supabase, logId, "success", { summary: `Path ${selectedLabel}`, path: sourceHandle, mode: splitMode, ...logExtra });
        const nextEdge = edges.find((e: any) => e.source === current_node_id && e.sourceHandle === sourceHandle);
        if (nextEdge) {
          return await advanceToNext(supabase, execution_id, flow_id, nextEdge.target);
        } else {
          await markFinished(supabase, execution_id, "completed");
          return jsonResponse({ message: "A/B split end" });
        }

      } else if (nodeType === "smart_delay") {
        const runAt = calculateSmartDelayRunAt(nodeData);
        await supabase.from("wz_scheduled_steps").insert({
          execution_id, node_id: current_node_id, run_at: runAt, status: "pending",
        });
        await supabase.from("wz_executions").update({ status: "waiting", current_node_id }).eq("id", execution_id);
        await logNodeEnd(supabase, logId, "success", { summary: `Smart delay → ${runAt}`, run_at: runAt });
        return jsonResponse({ message: "Smart delay scheduled", run_at: runAt });

      } else if (nodeType === "webhook") {
        const method = (nodeData.method || "POST").toUpperCase();
        const url = substituteVariables(nodeData.url || "", vars);
        let headers: Record<string, string> = { "Content-Type": "application/json" };
        try {
          if (nodeData.headers) headers = { ...headers, ...JSON.parse(nodeData.headers) };
        } catch (_) {}
        const bodyStr = nodeData.body ? substituteVariables(nodeData.body, vars) : undefined;

        if (url) {
          const fetchOpts: RequestInit = { method, headers };
          if (method !== "GET" && bodyStr) fetchOpts.body = bodyStr;
          const res = await fetch(url, fetchOpts);
          const resText = await res.text();
          await logNodeEnd(supabase, logId, res.ok ? "success" : "failed", {
            summary: `${method} ${res.status}`,
            status_code: res.status,
            response: resText.slice(0, 500),
          }, res.ok ? undefined : `HTTP ${res.status}`);
        } else {
          await logNodeEnd(supabase, logId, "skipped", { summary: "No URL" });
        }

      } else if (nodeType === "tag") {
        const tagName = nodeData.tagName;
        const tagAction = nodeData.tagAction || "add";
        if (tagName && execution.contact_phone) {
          const { data: leads } = await supabase
            .from("leads").select("id, metadata").eq("phone", execution.contact_phone).limit(1);
          if (leads && leads.length > 0) {
            const lead = leads[0];
            const metadata = lead.metadata || {};
            const tags: string[] = metadata.tags || [];
            if (tagAction === "add" && !tags.includes(tagName)) tags.push(tagName);
            else if (tagAction === "remove") {
              const idx = tags.indexOf(tagName);
              if (idx >= 0) tags.splice(idx, 1);
            }
            metadata.tags = tags;
            await supabase.from("leads").update({ metadata }).eq("id", lead.id);
            await logNodeEnd(supabase, logId, "success", { summary: `${tagAction} "${tagName}"`, lead_id: lead.id });
          } else {
            await logNodeEnd(supabase, logId, "skipped", { summary: "Lead não encontrado" });
          }
        } else {
          await logNodeEnd(supabase, logId, "skipped", { summary: "Sem tag ou telefone" });
        }

      } else if (nodeType === "goto") {
        const targetNodeId = nodeData.targetNodeId;
        if (targetNodeId) {
          await logNodeEnd(supabase, logId, "success", { summary: `→ ${targetNodeId}` });
          return await advanceToNext(supabase, execution_id, flow_id, targetNodeId);
        } else {
          await logNodeEnd(supabase, logId, "skipped", { summary: "Sem destino" });
          await markFinished(supabase, execution_id, "completed");
          return jsonResponse({ message: "Goto end — no target" });
        }

      } else if (nodeType === "move_stage") {
        const funnelId: string | undefined = nodeData.funnelId;
        const stageId: string | undefined = nodeData.stageId;
        const registerEvent = nodeData.registerEvent !== false;

        if (!funnelId || !stageId) {
          await logNodeEnd(supabase, logId, "skipped", { summary: "Funil/coluna não configurado" });
        } else {
          // Resolve lead via phone (primary) or email (fallback)
          let leadId: string | null = null;
          if (execution.contact_phone) {
            const { data: leads } = await supabase
              .from("leads").select("id").eq("phone", execution.contact_phone).limit(1);
            if (leads && leads.length > 0) leadId = leads[0].id;
          }
          if (!leadId && execution.contact_email) {
            const { data: leads } = await supabase
              .from("leads").select("id").ilike("email", execution.contact_email).limit(1);
            if (leads && leads.length > 0) leadId = leads[0].id;
          }

          if (!leadId) {
            await logNodeEnd(supabase, logId, "skipped", { summary: "Lead não encontrado" });
          } else {
            // Find existing position in this funnel
            const { data: currentPos } = await supabase
              .from("lead_stage_positions")
              .select("id, stage_id")
              .eq("lead_id", leadId)
              .eq("funnel_id", funnelId)
              .maybeSingle();

            const fromStageId: string | null = currentPos?.stage_id || null;
            const enteredAt = new Date().toISOString();

            if (currentPos) {
              if (currentPos.stage_id === stageId) {
                await logNodeEnd(supabase, logId, "skipped", {
                  summary: "Lead já está na coluna",
                  lead_id: leadId, stage_id: stageId,
                });
              } else {
                const { error: upErr } = await supabase
                  .from("lead_stage_positions")
                  .update({ stage_id: stageId, entered_at: enteredAt })
                  .eq("id", currentPos.id);
                if (upErr) throw upErr;

                if (registerEvent) {
                  await supabase.from("lead_events").insert({
                    lead_id: leadId,
                    funnel_id: funnelId,
                    event_name: "stage_change",
                    metadata: {
                      from_stage_id: fromStageId,
                      to_stage_id: stageId,
                      moved_by: "automation",
                      flow_id,
                      execution_id,
                      node_id: current_node_id,
                    },
                  });
                }

                await logNodeEnd(supabase, logId, "success", {
                  summary: `Movido → ${nodeData.stageName || stageId}`,
                  lead_id: leadId,
                  from_stage_id: fromStageId,
                  to_stage_id: stageId,
                });
              }
            } else {
              const { error: insErr } = await supabase
                .from("lead_stage_positions")
                .insert({
                  lead_id: leadId,
                  funnel_id: funnelId,
                  stage_id: stageId,
                  entered_at: enteredAt,
                });
              if (insErr) throw insErr;

              if (registerEvent) {
                await supabase.from("lead_events").insert({
                  lead_id: leadId,
                  funnel_id: funnelId,
                  event_name: "stage_change",
                  metadata: {
                    from_stage_id: null,
                    to_stage_id: stageId,
                    moved_by: "automation",
                    flow_id,
                    execution_id,
                    node_id: current_node_id,
                  },
                });
              }

              await logNodeEnd(supabase, logId, "success", {
                summary: `Inserido em ${nodeData.stageName || stageId}`,
                lead_id: leadId,
                to_stage_id: stageId,
              });
            }
          }
        }

      } else if (nodeType === "note" || nodeType === "trigger") {
        await logNodeEnd(supabase, logId, "skipped", { summary: "Nó não-executável" });
      } else {
        await logNodeEnd(supabase, logId, "skipped", { summary: `Tipo desconhecido: ${nodeType}` });
      }
    } catch (nodeErr) {
      await logNodeEnd(supabase, logId, "failed", null, String(nodeErr));
      console.error(`[wz-executor] Node error:`, nodeErr);
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
): Promise<Record<string, any>> {
  const messages: any[] = nodeData.messages || [];
  const result: Record<string, any> = { blocks_sent: 0, blocks_skipped: 0, errors: [] };

  if (messages.length === 0) {
    result.summary = "Sem mensagens";
    return result;
  }

  const msg = messages[Math.floor(Math.random() * messages.length)];
  const instanceId = nodeData.instanceId;
  if (!instanceId) { result.summary = "Sem instância"; return result; }

  // Try chat instances first, fallback to manual (wz_instances)
  let instance: { api_url: string; api_token: string } | null = null;
  const { data: chatInst } = await supabase
    .from("whatsapp_instances").select("api_url, api_token").eq("id", instanceId).single();
  if (chatInst) {
    instance = chatInst;
  } else {
    const { data: manualInst } = await supabase
      .from("wz_instances").select("api_url, api_key").eq("id", instanceId).single();
    if (manualInst) {
      instance = { api_url: manualInst.api_url, api_token: manualInst.api_key };
    }
  }
  if (!instance) { result.summary = "Instância não encontrada"; return result; }

  const phone = execution.contact_phone;
  if (!phone) { result.summary = "Sem telefone"; return result; }

  const cleanPhone = String(phone).replace(/\D/g, "");
  const apiUrl = instance.api_url.replace(/\/+$/, "");

  const blocks = (msg.blocks && msg.blocks.length > 0)
    ? msg.blocks
    : [{ text: msg.text || "", type: msg.type || "text", imageUrl: msg.imageUrl, caption: msg.caption, skipIfReplied: msg.skipIfReplied }];

  let hasReplied: boolean | null = null;
  async function checkIfReplied(): Promise<boolean> {
    if (hasReplied !== null) return hasReplied;
    try {
      const { data: replies } = await supabase
        .from("whatsapp_messages").select("id").eq("phone", cleanPhone)
        .eq("direction", "incoming").gte("created_at", execution.started_at).limit(1);
      hasReplied = !!(replies && replies.length > 0);
    } catch { hasReplied = false; }
    return hasReplied;
  }

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    if (block.skipIfReplied) {
      const replied = await checkIfReplied();
      if (replied) { result.blocks_skipped++; continue; }
    }

    const text = substituteVariables(block.text, vars);
    if (bi > 0) await sleep(randomDelay(nodeData.delayMin ?? 1, nodeData.delayMax ?? 5));

    const isMedia = block.type === "image";
    const endpoint = isMedia ? `${apiUrl}/send/media` : `${apiUrl}/send/text`;
    const body: Record<string, any> = isMedia
      ? { number: cleanPhone, type: "image", file: block.imageUrl || "", text: substituteVariables(block.caption || "", vars), readchat: true, readmessages: true, async: false }
      : { number: cleanPhone, text, readchat: true, readmessages: true, async: false };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", token: instance.api_token },
        body: JSON.stringify(body),
      });
      const resText = await res.text();
      if (res.ok) {
        result.blocks_sent++;
      } else {
        result.errors.push(`Block ${bi}: HTTP ${res.status}`);
      }
    } catch (err) {
      result.errors.push(`Block ${bi}: ${String(err)}`);
    }
  }

  result.summary = `${result.blocks_sent} enviados, ${result.blocks_skipped} pulados`;
  result.phone = cleanPhone;
  return result;
}

async function processTimerNode(
  supabase: any,
  executionId: string,
  nodeId: string,
  nodeData: Record<string, any>
): Promise<string> {
  const delay = Number(nodeData.delay || 1);
  const unit = nodeData.unit || "minutes";

  let ms = delay * 60 * 1000;
  if (unit === "hours") ms = delay * 60 * 60 * 1000;
  else if (unit === "days") ms = delay * 24 * 60 * 60 * 1000;

  const runAt = new Date(Date.now() + ms).toISOString();

  await supabase.from("wz_scheduled_steps").insert({
    execution_id: executionId, node_id: nodeId, run_at: runAt, status: "pending",
  });

  await supabase.from("wz_executions")
    .update({ status: "waiting", current_node_id: nodeId })
    .eq("id", executionId);

  console.log(`[wz-executor] Timer scheduled: ${delay} ${unit} → ${runAt}`);
  return runAt;
}

function evaluateCondition(nodeData: Record<string, any>, vars: Record<string, any>): boolean {
  const variable = nodeData.variable;
  const operator = nodeData.operator;
  const compareValue = nodeData.compareValue;
  if (!variable || !operator || compareValue === undefined) return false;

  // Special handling for tag variable — check against the tags array
  if (variable === "tag") {
    const tags: string[] = (vars._lead_tags || []).map((t: string) => t.toLowerCase());
    const expected = String(compareValue).toLowerCase();
    switch (operator) {
      case "equals":
      case "contains":
        return tags.includes(expected);
      case "not_equals":
        return !tags.includes(expected);
      default:
        return false;
    }
  }

  const actual = String(vars[variable] || "").toLowerCase();
  const expected = String(compareValue).toLowerCase();

  switch (operator) {
    case "equals": return actual === expected;
    case "contains": return actual.includes(expected);
    case "greater_than": return Number(actual) > Number(expected);
    case "less_than": return Number(actual) < Number(expected);
    case "not_equals": return actual !== expected;
    default: return false;
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
