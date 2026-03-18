import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const APPROVED_STATUSES = ["authorized", "approved", "paid", "completed", "Aprovada", "aprovada"];

async function performSync() {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ===== STEP 0: Clean existing data =====
  // Get all lead IDs for this org
  const { data: orgLeads } = await supabase
    .from("leads")
    .select("id")
    .eq("organization_id", ORG_ID);

  const leadIds = (orgLeads || []).map((l: any) => l.id);

  if (leadIds.length > 0) {
    // Delete in batches to avoid payload limits
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

  // Get first stage
  const { data: firstStage } = await supabase
    .from("lead_funnel_stages")
    .select("id")
    .eq("funnel_id", baseFunnel.id)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstStage) {
    console.error("No stages found for BASE DE LEADS funnel");
    return { success: false, error: "No stages found", leads_created: 0, events_created: 0 };
  }

  // ===== STEP 2: Fetch transactions (only approved) =====
  const { data: tictoTxs, error: tictoErr } = await supabase
    .from("ticto_transactions")
    .select("customer_email, customer_phone, customer_name, product_name, status, paid_amount, order_date, utm_source")
    .in("status", APPROVED_STATUSES)
    .order("order_date", { ascending: true });

  if (tictoErr) throw tictoErr;

  // ===== STEP 3: Fetch customer_purchases with unified_customers =====
  const { data: purchasesWithCust } = await supabase
    .from("customer_purchases")
    .select("unified_customer_id, product_name, status, gross_amount, purchased_at, utm_source, platform")
    .in("status", APPROVED_STATUSES)
    .order("purchased_at", { ascending: true });

  const { data: customers } = await supabase
    .from("unified_customers")
    .select("id, email, phone, name");

  const custMap = new Map((customers || []).map((c: any) => [c.id, c]));
  const purchaseContacts = (purchasesWithCust || []).map((p: any) => {
    const cust = custMap.get(p.unified_customer_id);
    return { ...p, email: cust?.email, phone: cust?.phone, name: cust?.name };
  });

  // ===== STEP 4: Merge into unique contact map =====
  const contactMap = new Map<string, {
    email: string | null; phone: string | null; name: string | null;
    utm_source: string | null;
    events: { event_name: string; metadata: Record<string, unknown>; created_at: string }[];
  }>();

  function normalizeEmail(email: string | null): string | null {
    return email ? email.trim().toLowerCase() : null;
  }

  function addContact(
    rawEmail: string | null, phone: string | null, name: string | null,
    utm_source: string | null,
    event: { event_name: string; metadata: Record<string, unknown>; created_at: string }
  ) {
    const email = normalizeEmail(rawEmail);
    const key = email || phone;
    if (!key) return;
    const existing = contactMap.get(key);
    if (existing) {
      existing.events.push(event);
      if (name && !existing.name) existing.name = name;
      if (phone && !existing.phone) existing.phone = phone;
      if (email && !existing.email) existing.email = email;
    } else {
      contactMap.set(key, { email, phone, name, utm_source, events: [event] });
    }
  }

  (tictoTxs || []).forEach((tx: any) => {
    addContact(tx.customer_email, tx.customer_phone, tx.customer_name, tx.utm_source, {
      event_name: "purchase",
      metadata: { platform: "ticto", product_name: tx.product_name, status: tx.status, amount_cents: tx.paid_amount },
      created_at: tx.order_date || new Date().toISOString(),
    });
  });

  purchaseContacts.forEach((p: any) => {
    addContact(p.email, p.phone, p.name, p.utm_source, {
      event_name: "purchase",
      metadata: { platform: p.platform || "guru", product_name: p.product_name, status: p.status, amount: p.gross_amount },
      created_at: p.purchased_at || new Date().toISOString(),
    });
  });

  // ===== STEP 5: Insert all leads fresh =====
  const newLeads: any[] = [];
  for (const [_key, contact] of contactMap) {
    newLeads.push({
      organization_id: ORG_ID,
      phone: contact.phone || null,
      email: contact.email || null,
      name: contact.name || null,
      utm_source: contact.utm_source || null,
      metadata: {},
    });
  }

  const leadByEmail = new Map<string, string>();
  const leadByPhone = new Map<string, string>();
  let created = 0;

  for (let i = 0; i < newLeads.length; i += 500) {
    const chunk = newLeads.slice(i, i + 500);
    const { data: inserted, error } = await supabase.from("leads").insert(chunk).select("id, email, phone");
    if (error) { console.error("Batch insert error:", error); continue; }
    created += (inserted || []).length;
    (inserted || []).forEach((l: any) => {
      if (l.email) leadByEmail.set(l.email.trim().toLowerCase(), l.id);
      if (l.phone) leadByPhone.set(l.phone, l.id);
    });
  }

  // ===== STEP 6: Position all leads in BASE DE LEADS =====
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

  // ===== STEP 7: Insert events =====
  const allEvents: any[] = [];
  for (const [_key, contact] of contactMap) {
    const leadId = (contact.email && leadByEmail.get(contact.email)) || (contact.phone && leadByPhone.get(contact.phone));
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
