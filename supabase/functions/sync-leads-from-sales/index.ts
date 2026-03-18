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

  // 1. Ensure "BASE DE LEADS" funnel exists
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
    return { success: false, error: "Could not create BASE DE LEADS funnel" };
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
    return { success: false, error: "No stages found" };
  }

  // 2. Fetch transactions (only approved)
  const { data: tictoTxs, error: tictoErr } = await supabase
    .from("ticto_transactions")
    .select("customer_email, customer_phone, customer_name, product_name, status, paid_amount, order_date, utm_source")
    .in("status", APPROVED_STATUSES)
    .order("order_date", { ascending: true });

  if (tictoErr) throw tictoErr;

  // 3. Fetch customer_purchases with unified_customers (only approved)
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

  // 4. Merge into unique contact map (case-insensitive email)
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

  // 5. Get existing leads (normalize for comparison)
  const { data: existingLeads } = await supabase
    .from("leads")
    .select("id, email, phone")
    .eq("organization_id", ORG_ID);

  const leadByEmail = new Map<string, string>();
  const leadByPhone = new Map<string, string>();
  (existingLeads || []).forEach((l: any) => {
    if (l.email) leadByEmail.set(l.email.trim().toLowerCase(), l.id);
    if (l.phone) leadByPhone.set(l.phone, l.id);
  });

  // Batch insert new leads
  const newLeads: any[] = [];
  const existingContactKeys = new Set<string>();

  for (const [key, contact] of contactMap) {
    const normalizedEmail = contact.email;
    const found = (normalizedEmail && leadByEmail.get(normalizedEmail)) || (contact.phone && leadByPhone.get(contact.phone));
    if (found) {
      existingContactKeys.add(key);
    } else {
      newLeads.push({
        organization_id: ORG_ID,
        phone: contact.phone || null,
        email: contact.email || null, // already lowercase
        name: contact.name || null,
        utm_source: contact.utm_source || null,
        metadata: {},
      });
    }
  }

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

  // 6. Position all leads in BASE DE LEADS
  let migrated = 0;
  const { data: positioned } = await supabase
    .from("lead_stage_positions")
    .select("lead_id")
    .eq("funnel_id", baseFunnel.id);

  const positionedSet = new Set((positioned || []).map((p: any) => p.lead_id));

  const { data: allLeads } = await supabase
    .from("leads")
    .select("id")
    .eq("organization_id", ORG_ID);

  const toInsert = (allLeads || [])
    .filter((l: any) => !positionedSet.has(l.id))
    .map((l: any) => ({ lead_id: l.id, funnel_id: baseFunnel.id, stage_id: firstStage.id }));

  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const { error } = await supabase.from("lead_stage_positions").insert(chunk);
    if (error) console.error("Position insert error:", error);
  }
  migrated = toInsert.length;

  // 7. Batch insert events
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

  const result = { success: true, leads_created: created, leads_existing: existingContactKeys.size, events_created: eventsCreated, total_contacts: contactMap.size, leads_migrated_to_funnel: migrated };
  console.log("Sync complete:", JSON.stringify(result));
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resultPromise = performSync();
    (globalThis as any).EdgeRuntime?.waitUntil?.(resultPromise.catch((e: any) => console.error("Background sync error:", e)));

    return new Response(JSON.stringify({ success: true, message: "Sincronização iniciada em background. Aguarde alguns segundos e atualize o dashboard." }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Sync error:", err);
    return new Response(JSON.stringify({ error: "Sync failed", detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
