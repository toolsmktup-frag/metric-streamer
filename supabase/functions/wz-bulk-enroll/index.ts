// wz-bulk-enroll: enrola leads existentes em um fluxo da automação WZ.
// Recebe: { flow_id, funnel_id, stage_ids[], limit?, dry_run? }
// Busca leads posicionados nas colunas indicadas, cria 1 wz_execution por lead
// (com dedup) e dispara wz-executor no nó seguinte ao trigger.

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

const BATCH_SIZE = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    // 🔒 Exige usuário autenticado (acionado manualmente pela UI). Bloqueia disparo anônimo em massa de WhatsApp.
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
    const funnel_id: string | undefined = body.funnel_id;
    const stage_ids: string[] = Array.isArray(body.stage_ids) ? body.stage_ids : [];
    const limit: number = Math.min(Math.max(parseInt(body.limit ?? "5000", 10) || 5000, 1), 50000);
    const dry_run = !!body.dry_run;

    if (!flow_id || !funnel_id || stage_ids.length === 0) {
      return jsonResponse({
        error: "Missing params",
        required: ["flow_id", "funnel_id", "stage_ids[]"],
      }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Load flow + find first non-trigger entry node
    const { data: flow, error: flowErr } = await supabase
      .from("wz_flows")
      .select("id, name, nodes, edges, is_active")
      .eq("id", flow_id)
      .single();

    if (flowErr || !flow) return jsonResponse({ error: "Flow not found" }, 404);

    const nodes = (flow.nodes || []) as Array<Record<string, any>>;
    const edges = (flow.edges || []) as Array<Record<string, any>>;

    // Find a trigger node (any). Bulk enroll skips trigger and goes to its first downstream node.
    const triggerNode = nodes.find((n) => n.type === "trigger");
    let startNodeId: string | null = null;
    let triggerEventLabel = "bulk_enroll";

    if (triggerNode) {
      const nextEdge = edges.find((e) => e.source === triggerNode.id);
      if (nextEdge) startNodeId = nextEdge.target;
      triggerEventLabel = triggerNode.data?.triggerType || "bulk_enroll";
    } else {
      // No trigger: pick node with no incoming edges
      const targetIds = new Set(edges.map((e) => e.target));
      const root = nodes.find((n) => n.type !== "note" && !targetIds.has(n.id));
      if (root) startNodeId = root.id;
    }

    if (!startNodeId) {
      return jsonResponse({ error: "Flow tem nenhum nó para iniciar (precisa de pelo menos 1 nó executável)" }, 400);
    }

    // 2. Count leads in selected stages (preview / dry_run)
    const { count: totalLeads, error: countErr } = await supabase
      .from("lead_stage_positions")
      .select("lead_id", { count: "exact", head: true })
      .eq("funnel_id", funnel_id)
      .in("stage_id", stage_ids);

    if (countErr) return jsonResponse({ error: "Count failed", details: countErr.message }, 500);

    if (dry_run) {
      return jsonResponse({
        dry_run: true,
        total_leads: totalLeads || 0,
        flow_id,
        flow_name: flow.name,
        start_node_id: startNodeId,
      });
    }

    if (!flow.is_active) {
      return jsonResponse({
        error: "Fluxo está inativo. Ative o fluxo antes de enrolar leads.",
        flow_id, flow_name: flow.name,
      }, 400);
    }

    // 3. Fetch lead_ids in batches
    let enrolled = 0;
    let skipped_already_active = 0;
    let skipped_no_contact = 0;
    let errors = 0;
    const execIds: string[] = [];
    const cap = Math.min(totalLeads || 0, limit);

    for (let offset = 0; offset < cap; offset += BATCH_SIZE) {
      const { data: positions, error: posErr } = await supabase
        .from("lead_stage_positions")
        .select("lead_id, stage_id")
        .eq("funnel_id", funnel_id)
        .in("stage_id", stage_ids)
        .range(offset, Math.min(offset + BATCH_SIZE - 1, cap - 1));

      if (posErr || !positions || positions.length === 0) break;

      const leadIds = positions.map((p) => p.lead_id);

      // Load lead contact info
      const { data: leads } = await supabase
        .from("leads")
        .select("id, name, email, phone")
        .in("id", leadIds);

      const leadMap = new Map<string, any>();
      (leads || []).forEach((l) => leadMap.set(l.id, l));

      // Check which leads already have a running/waiting execution in this flow → skip
      const { data: activeExecs } = await supabase
        .from("wz_executions")
        .select("contact_phone, contact_email")
        .eq("flow_id", flow_id)
        .in("status", ["running", "waiting", "pending"]);

      const activePhones = new Set<string>();
      const activeEmails = new Set<string>();
      (activeExecs || []).forEach((e: any) => {
        if (e.contact_phone) activePhones.add(e.contact_phone);
        if (e.contact_email) activeEmails.add(String(e.contact_email).toLowerCase());
      });

      for (const pos of positions) {
        const lead = leadMap.get(pos.lead_id);
        if (!lead) { errors++; continue; }
        if (!lead.phone && !lead.email) { skipped_no_contact++; continue; }

        if (
          (lead.phone && activePhones.has(lead.phone)) ||
          (lead.email && activeEmails.has(String(lead.email).toLowerCase()))
        ) {
          skipped_already_active++;
          continue;
        }

        const variables: Record<string, any> = {
          nome: lead.name || "",
          telefone: lead.phone || "",
          email: lead.email || "",
          _bulk_enroll: true,
          _funnel_id: funnel_id,
          _stage_id: pos.stage_id,
        };

        const { data: created, error: insErr } = await supabase
          .from("wz_executions")
          .insert({
            flow_id,
            contact_phone: lead.phone,
            contact_name: lead.name,
            contact_email: lead.email,
            trigger_event: triggerEventLabel,
            trigger_payload: { source: "bulk_enroll", funnel_id, stage_id: pos.stage_id, lead_id: lead.id },
            variables,
            status: "running",
            current_node_id: startNodeId,
          })
          .select("id")
          .single();

        if (insErr || !created) { errors++; continue; }

        enrolled++;
        execIds.push(created.id);

        // Mark phone/email so further leads in batch don't double-enroll
        if (lead.phone) activePhones.add(lead.phone);
        if (lead.email) activeEmails.add(String(lead.email).toLowerCase());

        // Fire wz-executor (fire-and-forget; no await)
        const execUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/wz-executor`;
        try {
          fetch(execUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              execution_id: created.id,
              flow_id,
              current_node_id: startNodeId,
            }),
          }).catch((e) => console.error("[wz-bulk-enroll] executor fetch failed:", e));
        } catch (e) {
          console.error("[wz-bulk-enroll] executor invoke failed:", e);
        }
      }
    }

    return jsonResponse({
      success: true,
      flow_id,
      flow_name: flow.name,
      total_leads: totalLeads || 0,
      enrolled,
      skipped_already_active,
      skipped_no_contact,
      errors,
      sample_execution_ids: execIds.slice(0, 20),
    });
  } catch (err) {
    console.error("[wz-bulk-enroll] Error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
