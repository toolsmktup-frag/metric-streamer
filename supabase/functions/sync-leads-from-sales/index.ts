import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const APPROVED_STATUSES = ["authorized", "approved", "paid", "completed", "Aprovada", "aprovada"];

function normalizeEmail(email: string | null): string | null {
  return email ? email.trim().toLowerCase() : null;
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  // Keep only digits
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

async function performSync() {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ===== STEP 0: Clean existing data =====
  const { data: orgLeads } = await supabase
    .from("leads")
    .select("id")
    .eq("organization_id", ORG_ID);

  const leadIds = (orgLeads || []).map((l: any) => l.id);

  if (leadIds.length > 0) {
    for (let i = 0; i < leadIds.length; i += 500) {
      const chunk = leadIds.slice(i, i + 500);
      await supabase.from("lead_events").delete().in("lead_id", chunk);
      await supabase.from("lead_stage_positions").delete().in("lead_id", chunk);
    }
    for (let i = 0; i < leadIds.length; i += 500) {
      const chunk = leadIds.slice(i, i + 500);
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

  // Ensure stages exist
  const { data: existingStages } = await supabase
    .from("lead_funnel_stages")
    .select("id, name")
    .eq("funnel_id", baseFunnel.id);

  if (!existingStages || existingStages.length === 0) {
    await supabase.from("lead_funnel_stages").insert([
      { funnel_id: baseFunnel.id, name: "Novo", color: "#94a3b8", sort_order: 0 },
      { funnel_id: baseFunnel.id, name: "Comprador", color: "#22c55e", sort_order: 1 },
      { funnel_id: baseFunnel.id, name: "Recorrente", color: "#3b82f6", sort_order: 2 },
      { funnel_id: baseFunnel.id, name: "VIP", color: "#f59e0b", sort_order: 3 },
    ]);
  }

  const { data: firstStage } = await supabase
    .from("lead_funnel_stages")
    .select("id")
    .eq("funnel_id", baseFunnel.id)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstStage) {
    return { success: false, error: "No stages found", leads_created: 0, events_created: 0 };
  }

  // ===== STEP 2: Fetch ONLY from unified_customers + customer_purchases =====
  // This is the canonical deduplicated source
  const { data: customers } = await supabase
    .from("unified_customers")
    .select("id, primary_email, primary_phone, full_name")
    .eq("organization_id", ORG_ID);

  const { data: purchases } = await supabase
    .from("customer_purchases")
    .select("unified_customer_id, product_name, status, gross_amount, purchased_at, utm_source, platform")
    .eq("organization_id", ORG_ID)
    .in("status", APPROVED_STATUSES)
    .order("purchased_at", { ascending: true });

  // Build customer map by unified_customer_id (already deduplicated)
  const custMap = new Map<string, { email: string | null; phone: string | null; name: string | null }>();
  for (const c of (customers || [])) {
    custMap.set(c.id, { email: normalizeEmail(c.email), phone: normalizePhone(c.phone), name: c.name });
  }

  // ===== STEP 3: Build unique contacts from unified_customers that have purchases =====
  const contactMap = new Map<string, {
    email: string | null; phone: string | null; name: string | null;
    utm_source: string | null;
    events: { event_name: string; metadata: Record<string, unknown>; created_at: string }[];
  }>();

  for (const p of (purchases || [])) {
    const cust = custMap.get(p.unified_customer_id);
    if (!cust) continue;

    // Use unified_customer_id as key (already deduplicated by the resolve_or_create_customer RPC)
    const key = p.unified_customer_id;
    const existing = contactMap.get(key);
    const event = {
      event_name: "purchase",
      metadata: { platform: p.platform || "unknown", product_name: p.product_name, status: p.status, amount: p.gross_amount },
      created_at: p.purchased_at || new Date().toISOString(),
    };

    if (existing) {
      existing.events.push(event);
    } else {
      contactMap.set(key, {
        email: cust.email,
        phone: cust.phone,
        name: cust.name,
        utm_source: p.utm_source || null,
        events: [event],
      });
    }
  }

  console.log(`Unique customers with approved purchases: ${contactMap.size}`);

  // ===== STEP 4: Insert leads =====
  const newLeads: any[] = [];
  const keyOrder: string[] = [];
  for (const [key, contact] of contactMap) {
    keyOrder.push(key);
    newLeads.push({
      organization_id: ORG_ID,
      phone: contact.phone || null,
      email: contact.email || null,
      name: contact.name || null,
      utm_source: contact.utm_source || null,
      metadata: {},
    });
  }

  const leadIdByKey = new Map<string, string>();
  let created = 0;

  for (let i = 0; i < newLeads.length; i += 500) {
    const chunk = newLeads.slice(i, i + 500);
    const { data: inserted, error } = await supabase.from("leads").insert(chunk).select("id");
    if (error) { console.error("Batch insert error:", error); continue; }
    (inserted || []).forEach((l: any, idx: number) => {
      leadIdByKey.set(keyOrder[i + idx], l.id);
    });
    created += (inserted || []).length;
  }

  // ===== STEP 5: Position all leads in BASE DE LEADS =====
  const { data: allLeads } = await supabase
    .from("leads")
    .select("id")
    .eq("organization_id", ORG_ID);

  const toInsert = (allLeads || []).map((l: any) => ({
    lead_id: l.id,
    funnel_id: baseFunnel.id,
    stage_id: firstStage.id,
  }));

  let positioned = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const { error } = await supabase.from("lead_stage_positions").insert(chunk);
    if (!error) positioned += chunk.length;
    else console.error("Position insert error:", error);
  }

  // ===== STEP 6: Insert events =====
  const allEvents: any[] = [];
  for (const [key, contact] of contactMap) {
    const leadId = leadIdByKey.get(key);
    if (!leadId) continue;
    for (const evt of contact.events) {
      allEvents.push({
        lead_id: leadId,
        funnel_id: baseFunnel.id,
        event_name: evt.event_name,
        metadata: evt.metadata,
        created_at: evt.created_at,
      });
    }
  }

  let eventsCreated = 0;
  for (let i = 0; i < allEvents.length; i += 500) {
    const chunk = allEvents.slice(i, i + 500);
    const { error } = await supabase.from("lead_events").insert(chunk);
    if (!error) eventsCreated += chunk.length;
  }

  const result = {
    success: true,
    leads_created: created,
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
