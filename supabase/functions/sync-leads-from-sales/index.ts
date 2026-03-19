import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ORG_ID will be detected dynamically from existing data
const APPROVED_STATUSES = ["authorized", "approved", "paid", "completed", "Aprovada", "aprovada"];
const BATCH_SIZE = 500;
const PAGE_SIZE = 1000;

function mapStatusToEventName(status: string | null): string {
  if (!status) return "evento_desconhecido";
  const s = status.toLowerCase().trim();
  if (["authorized", "approved", "paid", "completed", "aprovada"].includes(s)) return "pago";
  if (["waiting_payment", "pending", "pendente", "waiting"].includes(s)) return "pix_gerado";
  if (["rejected", "recusada", "refused"].includes(s)) return "rejeitado";
  if (["cancelled", "canceled", "cancelada"].includes(s)) return "cancelado";
  if (["expired", "expirada"].includes(s)) return "expirado";
  if (["refunded", "reembolsada", "reembolsado"].includes(s)) return "reembolsado";
  if (["chargeback"].includes(s)) return "chargeback";
  return s;
}

function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : null;
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/** Fetch all rows from a table using paginated .range() calls */
async function fetchAllPaginated(
  supabase: any,
  table: string,
  selectCols: string,
  filters: Record<string, any>,
  orderCol?: string
): Promise<any[]> {
  const allRows: any[] = [];
  let from = 0;
  while (true) {
    let query = supabase.from(table).select(selectCols).range(from, from + PAGE_SIZE - 1);
    for (const [k, v] of Object.entries(filters)) {
      query = query.eq(k, v);
    }
    if (orderCol) query = query.order(orderCol, { ascending: true });
    const { data, error } = await query;
    if (error) { console.error(`Paginated fetch error on ${table}:`, error.message); break; }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  console.log(`Fetched ${allRows.length} rows from ${table}`);
  return allRows;
}

/** Insert rows in batches, returning count of successful inserts */
async function batchInsert(supabase: any, table: string, rows: any[]): Promise<number> {
  let count = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(chunk);
    if (!error) {
      count += chunk.length;
    } else {
      console.error(`Batch insert error on ${table} (batch ${Math.floor(i / BATCH_SIZE)}):`, error.message);
      // Fallback: try without created_at for lead_events
      if (table === "lead_events") {
        const fallbackChunk = chunk.map((evt: any) => {
          const { created_at, ...rest } = evt;
          return { ...rest, metadata: { ...rest.metadata, original_date: created_at } };
        });
        const { error: err2 } = await supabase.from(table).insert(fallbackChunk);
        if (!err2) count += fallbackChunk.length;
        else console.error(`Fallback batch also failed:`, err2.message);
      }
    }
  }
  return count;
}

/** Upsert leads in batches, building key→id map */
async function batchUpsertLeads(
  supabase: any,
  contactMap: Map<string, any>
): Promise<Map<string, string>> {
  const leadIdByKey = new Map<string, string>();
  const entries = Array.from(contactMap.entries());
  let created = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const leadRows = chunk.map(([_, contact]) => ({
      organization_id: ORG_ID,
      phone: contact.phone || null,
      email: contact.email || null,
      name: contact.name || null,
      utm_source: contact.utm_source || null,
      metadata: {},
    }));

    const { data: inserted, error } = await supabase
      .from("leads")
      .insert(leadRows)
      .select("id, email, phone");

    if (inserted && inserted.length > 0) {
      // Match back by position (same order)
      for (let j = 0; j < inserted.length; j++) {
        leadIdByKey.set(chunk[j][0], inserted[j].id);
      }
      created += inserted.length;
    } else if (error) {
      console.warn(`Batch lead insert failed (batch ${Math.floor(i / BATCH_SIZE)}), falling back to individual:`, error.message);
      // Fallback: insert individually
      for (const [key, contact] of chunk) {
        const { data: single, error: sErr } = await supabase
          .from("leads")
          .insert({
            organization_id: ORG_ID,
            phone: contact.phone || null,
            email: contact.email || null,
            name: contact.name || null,
            utm_source: contact.utm_source || null,
            metadata: {},
          })
          .select("id")
          .single();

        if (single) {
          leadIdByKey.set(key, single.id);
          created++;
        } else if (sErr) {
          // Try to find existing
          let existing = null;
          if (contact.email) {
            const { data } = await supabase.from("leads").select("id")
              .eq("organization_id", ORG_ID).eq("email", contact.email).limit(1).maybeSingle();
            existing = data;
          }
          if (!existing && contact.phone) {
            const { data } = await supabase.from("leads").select("id")
              .eq("organization_id", ORG_ID).eq("phone", contact.phone).limit(1).maybeSingle();
            existing = data;
          }
          if (existing) leadIdByKey.set(key, existing.id);
        }
      }
    }
  }

  console.log(`Leads created/found: ${leadIdByKey.size} (new inserts: ${created})`);
  return leadIdByKey;
}

async function performSync() {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ===== STEP 0a: Detect ORG_ID dynamically =====
  const { data: orgSample, error: orgError } = await supabase
    .from("unified_customers")
    .select("organization_id")
    .limit(1)
    .maybeSingle();

  if (orgError) console.error("Error detecting org_id:", orgError.message);

  const ORG_ID = orgSample?.organization_id;

  if (!ORG_ID) {
    // Try without org filter to diagnose
    const { count: totalCustomers } = await supabase.from("unified_customers").select("id", { count: "exact", head: true });
    const { count: totalPurchases } = await supabase.from("customer_purchases").select("id", { count: "exact", head: true });
    console.error(`No org_id found. Total unified_customers: ${totalCustomers}, total customer_purchases: ${totalPurchases}`);
    return {
      success: false,
      error: `No organization found in unified_customers. Total customers: ${totalCustomers}, purchases: ${totalPurchases}`,
      leads_created: 0,
      events_created: 0,
    };
  }

  console.log(`Detected organization_id: ${ORG_ID}`);

  // ===== STEP 0b: Clean existing data =====
  const orgLeads = await fetchAllPaginated(supabase, "leads", "id", { organization_id: ORG_ID });
  const leadIds = orgLeads.map((l: any) => l.id);

  if (leadIds.length > 0) {
    for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
      const chunk = leadIds.slice(i, i + BATCH_SIZE);
      await supabase.from("lead_events").delete().in("lead_id", chunk);
      await supabase.from("lead_stage_positions").delete().in("lead_id", chunk);
    }
    for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
      const chunk = leadIds.slice(i, i + BATCH_SIZE);
      await supabase.from("leads").delete().in("id", chunk);
    }
    console.log(`Cleaned ${leadIds.length} existing leads`);
  }

  // ===== STEP 1: Ensure "BASE DE LEADS" funnel exists =====
  let { data: baseFunnel } = await supabase
    .from("lead_funnels")
    .select("id")
    .eq("organization_id", ORG_ID)
    .eq("name", "BASE DE LEADS")
    .maybeSingle();

  if (!baseFunnel) {
    const { data: created } = await supabase
      .from("lead_funnels")
      .insert({ organization_id: ORG_ID, name: "BASE DE LEADS", color: "#6366f1", is_active: true })
      .select("id")
      .single();
    baseFunnel = created;
  }

  if (!baseFunnel) {
    console.error("Could not create BASE DE LEADS funnel");
    return { success: false, error: "Could not create BASE DE LEADS funnel", leads_created: 0, events_created: 0 };
  }

  const { data: existingStages } = await supabase
    .from("lead_funnel_stages").select("id, name").eq("funnel_id", baseFunnel.id);

  const stageNames = (existingStages || []).map((s: any) => s.name);

  if (!existingStages || existingStages.length === 0) {
    await supabase.from("lead_funnel_stages").insert([
      { funnel_id: baseFunnel.id, name: "Novo", color: "#94a3b8", sort_order: 0 },
      { funnel_id: baseFunnel.id, name: "Comprador", color: "#22c55e", sort_order: 1 },
      { funnel_id: baseFunnel.id, name: "Perdido", color: "#ef4444", sort_order: 2 },
      { funnel_id: baseFunnel.id, name: "Recorrente", color: "#3b82f6", sort_order: 3 },
      { funnel_id: baseFunnel.id, name: "VIP", color: "#f59e0b", sort_order: 4 },
    ]);
  } else if (!stageNames.includes("Perdido")) {
    const maxOrder = Math.max(...(existingStages || []).map((s: any) => s.sort_order || 0), 0);
    await supabase.from("lead_funnel_stages").insert({
      funnel_id: baseFunnel.id, name: "Perdido", color: "#ef4444", sort_order: maxOrder + 1,
    });
  }

  const { data: allStages } = await supabase
    .from("lead_funnel_stages").select("id, name").eq("funnel_id", baseFunnel.id);

  const stageMap = new Map<string, string>();
  (allStages || []).forEach((s: any) => stageMap.set(s.name, s.id));

  const compradorStageId = stageMap.get("Comprador");
  const perdidoStageId = stageMap.get("Perdido");
  const novoStageId = stageMap.get("Novo");
  const fallbackStageId = novoStageId || compradorStageId || (allStages?.[0]?.id);

  if (!fallbackStageId) {
    return { success: false, error: "No stages found", leads_created: 0, events_created: 0 };
  }

  // ===== STEP 2: Fetch ALL data with pagination =====
  const [customers, purchases] = await Promise.all([
    fetchAllPaginated(supabase, "unified_customers", "id, primary_email, primary_phone, full_name", { organization_id: ORG_ID }),
    fetchAllPaginated(supabase, "customer_purchases", "unified_customer_id, product_name, status, gross_amount, purchased_at, utm_source, platform", { organization_id: ORG_ID }, "purchased_at"),
  ]);

  const custMap = new Map<string, { email: string | null; phone: string | null; name: string | null }>();
  for (const c of customers) {
    custMap.set(c.id, { email: normalizeEmail(c.primary_email), phone: normalizePhone(c.primary_phone), name: c.full_name });
  }

  // ===== STEP 3: Build unique contacts =====
  const contactMap = new Map<string, {
    email: string | null; phone: string | null; name: string | null;
    utm_source: string | null;
    hasApproved: boolean;
    firstPurchaseDate: string | null;
    events: { event_name: string; metadata: Record<string, unknown>; created_at: string }[];
  }>();

  for (const p of purchases) {
    const cust = custMap.get(p.unified_customer_id);
    if (!cust) continue;

    const key = p.unified_customer_id;
    const isApproved = APPROVED_STATUSES.includes(p.status);
    const eventDate = p.purchased_at || new Date().toISOString();
    const eventName = mapStatusToEventName(p.status);
    const event = {
      event_name: eventName,
      metadata: { platform: p.platform || "unknown", product_name: p.product_name, status: p.status, amount: p.gross_amount },
      created_at: eventDate,
    };

    const existing = contactMap.get(key);
    if (existing) {
      existing.events.push(event);
      if (isApproved) existing.hasApproved = true;
      if (!existing.firstPurchaseDate || eventDate < existing.firstPurchaseDate) {
        existing.firstPurchaseDate = eventDate;
      }
    } else {
      contactMap.set(key, {
        email: cust.email, phone: cust.phone, name: cust.name,
        utm_source: p.utm_source || null,
        hasApproved: isApproved,
        firstPurchaseDate: eventDate,
        events: [event],
      });
    }
  }

  console.log(`Unique customers with purchases: ${contactMap.size}`);

  // ===== STEP 4: Insert leads in batches =====
  const leadIdByKey = await batchUpsertLeads(supabase, contactMap);

  // ===== STEP 5: Position leads in correct stage (batch) =====
  const positions: any[] = [];
  for (const [key, contact] of contactMap) {
    const leadId = leadIdByKey.get(key);
    if (!leadId) continue;
    const targetStageId = contact.hasApproved
      ? (compradorStageId || fallbackStageId)
      : (perdidoStageId || fallbackStageId);
    positions.push({
      lead_id: leadId, funnel_id: baseFunnel.id, stage_id: targetStageId,
      entered_at: contact.firstPurchaseDate || new Date().toISOString(),
    });
  }

  const positioned = await batchInsert(supabase, "lead_stage_positions", positions);

  // ===== STEP 6: Insert events in batches =====
  const allEvents: any[] = [];
  for (const [key, contact] of contactMap) {
    const leadId = leadIdByKey.get(key);
    if (!leadId) continue;

    allEvents.push({
      lead_id: leadId, funnel_id: baseFunnel.id,
      event_name: "lead_importado", metadata: { source: "sync" },
      created_at: contact.firstPurchaseDate || new Date().toISOString(),
    });

    for (const evt of contact.events) {
      allEvents.push({
        lead_id: leadId, funnel_id: baseFunnel.id,
        event_name: evt.event_name, metadata: evt.metadata, created_at: evt.created_at,
      });
    }
  }

  const eventsCreated = await batchInsert(supabase, "lead_events", allEvents);

  const result = {
    success: true,
    leads_created: leadIdByKey.size,
    leads_positioned: positioned,
    events_created: eventsCreated,
    total_contacts: contactMap.size,
  };
  console.log("Sync complete:", JSON.stringify(result));
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const result = await performSync();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Sync error:", err);
    return new Response(JSON.stringify({ error: "Sync failed", detail: String(err), leads_created: 0, events_created: 0 }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
