import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  computeRecompra,
  type DurationTier,
  pickTier,
  POT_SOURCES,
  type RecompraPurchase,
} from "../_shared/recompra.ts";

// ════════════════════════════════════════════════════════════════════
// recontact-cron — move automático de leads de recompra vencidos.
//
// Espelha a lógica do front (useRecontactDeadlines + computeRecompra):
//  - Processa SOMENTE produtos com pot_duration_days + reminder_days_before
//    (modelo de potes). Funis com recontact_days fixo (sem pote) são ignorados,
//    exatamente como o botão "Atualizar Funil" no front.
//  - Match lead → cliente por email/telefone (variantes) → customer_purchases.
//  - Considera só compras de POTES (quantity_source ∈ mapping/parser_*).
//  - Vencido = daysRemaining < 0. Respeita auto_move_from_stage_id (se houver).
//
// Body opcional: { "dry_run": true, "funnel_id": "<uuid>" }
//  - dry_run=true: NÃO move nada; retorna o que moveria (+ breakdown por etapa).
// ════════════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH = 400;

/** Variantes de telefone — espelha addPhoneVariants do front. */
function phoneVariants(raw: string): string[] {
  const digits = raw.replace(/\D/g, "");
  const variants = new Set<string>([raw, digits, `+${digits}`]);
  if (digits.startsWith("55") && digits.length >= 12) {
    variants.add(digits.slice(2));
  } else if (digits.length >= 10 && digits.length <= 11) {
    variants.add(`55${digits}`);
    variants.add(`+55${digits}`);
  }
  return [...variants].filter(Boolean);
}

interface FunnelTier extends DurationTier {
  productId: string;
  autoMoveStageId: string | null;
  autoMoveFromStageId: string | null;
  displayName: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (token !== SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Body opcional
    let dryRun = false;
    let funnelFilter: string | null = null;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
      funnelFilter = typeof body?.funnel_id === "string" ? body.funnel_id : null;
    } catch (_) { /* sem body */ }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1) Produtos com config de POTE (pot_duration_days + reminder_days_before)
    let prodQuery = supabase
      .from("lead_funnel_products")
      .select(
        "id, lead_funnel_id, display_name, product_name_contains, pot_duration_days, reminder_days_before, auto_move_stage_id, auto_move_from_stage_id",
      )
      .not("pot_duration_days", "is", null)
      .not("reminder_days_before", "is", null);
    if (funnelFilter) prodQuery = prodQuery.eq("lead_funnel_id", funnelFilter);

    const { data: products, error: prodErr } = await prodQuery;
    if (prodErr) throw prodErr;
    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ dry_run: dryRun, moved: 0, message: "Nenhum produto com config de pote" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Agrupa tiers por funil
    const tiersByFunnel = new Map<string, FunnelTier[]>();
    for (const p of products) {
      const arr = tiersByFunnel.get(p.lead_funnel_id) || [];
      arr.push({
        durationDays: p.pot_duration_days!,
        reminderDaysBefore: p.reminder_days_before!,
        productId: p.id,
        autoMoveStageId: p.auto_move_stage_id,
        autoMoveFromStageId: p.auto_move_from_stage_id,
        displayName: p.display_name || p.product_name_contains || "pote",
      });
      tiersByFunnel.set(p.lead_funnel_id, arr);
    }

    const now = new Date();
    let totalMoved = 0;
    const perFunnel: Record<string, unknown> = {};
    const wouldMoveByFromStage: Record<string, number> = {};
    const movePlan: Array<{ positionId: string; leadId: string; funnelId: string; fromStageId: string; toStageId: string }> = [];

    for (const [funnelId, tiers] of tiersByFunnel) {
      // 2) Posições + leads (email/phone) do funil
      const { data: positions, error: posErr } = await supabase
        .from("lead_stage_positions")
        .select("id, lead_id, stage_id, leads!inner(id, email, phone)")
        .eq("funnel_id", funnelId);
      if (posErr) {
        console.error(`positions ${funnelId}:`, posErr.message);
        continue;
      }
      if (!positions || positions.length === 0) continue;

      // 3) Mapas email/phone → leadIds (com variantes)
      const emailToLeads = new Map<string, Set<string>>();
      const phoneToLeads = new Map<string, Set<string>>();
      for (const pos of positions as any[]) {
        const lead = pos.leads;
        if (!lead) continue;
        const email = lead.email?.toLowerCase().trim();
        const phone = lead.phone?.trim();
        if (email && email.includes("@")) {
          const s = emailToLeads.get(email) || new Set<string>();
          s.add(pos.lead_id);
          emailToLeads.set(email, s);
        }
        if (phone) {
          for (const v of phoneVariants(phone)) {
            const s = phoneToLeads.get(v) || new Set<string>();
            s.add(pos.lead_id);
            phoneToLeads.set(v, s);
          }
        }
      }

      // 4) Resolve unified_customers por email/phone → leadIds
      const customerToLeads = new Map<string, Set<string>>();
      const resolveCustomers = async (column: "primary_email" | "primary_phone", lookup: Map<string, Set<string>>) => {
        const values = [...lookup.keys()];
        for (let i = 0; i < values.length; i += BATCH) {
          const chunk = values.slice(i, i + BATCH);
          const { data, error } = await supabase
            .from("unified_customers")
            .select(`id, ${column}`)
            .in(column, chunk);
          if (error) { console.error(`unified ${column}:`, error.message); continue; }
          for (const row of (data as any[]) || []) {
            const raw = (row[column] as string | null)?.toString();
            if (!raw) continue;
            const key = column === "primary_email" ? raw.toLowerCase().trim() : raw.trim();
            const leadIds = lookup.get(key);
            if (!leadIds) continue;
            const s = customerToLeads.get(row.id) || new Set<string>();
            for (const lid of leadIds) s.add(lid);
            customerToLeads.set(row.id, s);
          }
        }
      };
      await resolveCustomers("primary_email", emailToLeads);
      await resolveCustomers("primary_phone", phoneToLeads);

      // 5) Compras (authorized) dos clientes → potes por lead
      const potPurchasesByLead = new Map<string, RecompraPurchase[]>();
      const customerIds = [...customerToLeads.keys()];
      for (let i = 0; i < customerIds.length; i += BATCH) {
        const chunk = customerIds.slice(i, i + BATCH);
        const { data, error } = await supabase
          .from("customer_purchases")
          .select("unified_customer_id, purchased_at, status, quantity, quantity_source")
          .in("unified_customer_id", chunk)
          .eq("status", "authorized");
        if (error) { console.error("purchases:", error.message); continue; }
        for (const row of (data as any[]) || []) {
          if (!row.quantity_source || !POT_SOURCES.has(row.quantity_source)) continue;
          if (!row.quantity || row.quantity <= 0) continue;
          if (!row.purchased_at) continue;
          const d = new Date(row.purchased_at);
          if (Number.isNaN(d.getTime())) continue;
          const leadIds = customerToLeads.get(row.unified_customer_id);
          if (!leadIds) continue;
          for (const lid of leadIds) {
            const arr = potPurchasesByLead.get(lid) || [];
            arr.push({ date: d, quantity: row.quantity });
            potPurchasesByLead.set(lid, arr);
          }
        }
      }

      // 6) Por lead: computeRecompra → vencido → planeja move
      let matched = 0, overdue = 0, wouldMove = 0;
      for (const pos of positions as any[]) {
        const pots = potPurchasesByLead.get(pos.lead_id);
        if (!pots?.length) continue;
        matched++;
        const r = computeRecompra(pots, tiers, now);
        if (!r) continue;
        if (r.daysRemaining >= 0) continue;
        overdue++;
        const tier = pickTier(tiers, r.totalDays);
        if (!tier?.autoMoveStageId) continue;
        if (pos.stage_id === tier.autoMoveStageId) continue; // já no destino
        if (tier.autoMoveFromStageId && pos.stage_id !== tier.autoMoveFromStageId) continue; // protege origem
        wouldMove++;
        wouldMoveByFromStage[pos.stage_id] = (wouldMoveByFromStage[pos.stage_id] || 0) + 1;
        movePlan.push({
          positionId: pos.id,
          leadId: pos.lead_id,
          funnelId,
          fromStageId: pos.stage_id,
          toStageId: tier.autoMoveStageId,
        });
      }
      perFunnel[funnelId] = { positions: positions.length, matched, overdue, wouldMove };
    }

    // 7) Executa (ou não, se dry-run)
    if (!dryRun) {
      for (const m of movePlan) {
        const { error: moveErr } = await supabase
          .from("lead_stage_positions")
          .update({ stage_id: m.toStageId })
          .eq("id", m.positionId);
        if (moveErr) { console.error(`move ${m.leadId}:`, moveErr.message); continue; }
        await supabase.from("lead_events").insert({
          lead_id: m.leadId,
          funnel_id: m.funnelId,
          event_name: "auto_recontact_move",
          metadata: { from_stage_id: m.fromStageId, to_stage_id: m.toStageId, triggered_by: "cron" },
        });
        totalMoved++;
      }
    }

    const result = {
      dry_run: dryRun,
      moved: dryRun ? 0 : totalMoved,
      would_move: movePlan.length,
      per_funnel: perFunnel,
      would_move_by_from_stage: wouldMoveByFromStage,
    };
    console.log("recontact-cron:", JSON.stringify(result));
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("recontact-cron error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
