import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ORG_ID = "00000000-0000-0000-0000-000000000001";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // 1. Ensure "BASE DE LEADS" funnel exists with stages
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

      if (baseFunnel) {
        await supabase.from("lead_funnel_stages").insert([
          { funnel_id: baseFunnel.id, name: "Novo", color: "#94a3b8", sort_order: 0 },
          { funnel_id: baseFunnel.id, name: "Comprador", color: "#22c55e", sort_order: 1 },
          { funnel_id: baseFunnel.id, name: "Recorrente", color: "#3b82f6", sort_order: 2 },
          { funnel_id: baseFunnel.id, name: "VIP", color: "#f59e0b", sort_order: 3 },
        ]);
      }
    }

    if (!baseFunnel) {
      return new Response(JSON.stringify({ error: "Could not create BASE DE LEADS funnel" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get first stage for positioning
    const { data: firstStage } = await supabase
      .from("lead_funnel_stages")
      .select("id")
      .eq("funnel_id", baseFunnel.id)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    // 2. Fetch all transactions from ticto_transactions
    const { data: tictoTxs, error: tictoErr } = await supabase
      .from("ticto_transactions")
      .select("customer_email, customer_phone, customer_name, product_name, status, paid_amount, order_date, utm_source, utm_medium, utm_campaign, utm_content, utm_term")
      .order("order_date", { ascending: true });

    if (tictoErr) throw tictoErr;

    // 3. Fetch all from customer_purchases
    const { data: purchases, error: purchErr } = await supabase
      .from("customer_purchases")
      .select("product_name, status, gross_amount, purchased_at, utm_source, utm_medium, utm_campaign, utm_content, utm_term, platform")
      .order("purchased_at", { ascending: true });

    // Also get unified customers for email/phone
    let purchaseContacts: any[] = [];
    if (!purchErr && purchases && purchases.length > 0) {
      const { data: customers } = await supabase
        .from("unified_customers")
        .select("id, email, phone, name");
      
      const custMap = new Map((customers || []).map((c: any) => [c.id, c]));
      
      // Re-fetch with unified_customer_id
      const { data: purchasesWithCust } = await supabase
        .from("customer_purchases")
        .select("unified_customer_id, product_name, status, gross_amount, purchased_at, utm_source, utm_medium, utm_campaign, utm_content, utm_term, platform")
        .order("purchased_at", { ascending: true });

      purchaseContacts = (purchasesWithCust || []).map((p: any) => {
        const cust = custMap.get(p.unified_customer_id);
        return { ...p, email: cust?.email, phone: cust?.phone, name: cust?.name };
      });
    }

    // 4. Merge all into a unique contact map (email → lead data)
    const contactMap = new Map<string, {
      email: string | null;
      phone: string | null;
      name: string | null;
      utm_source: string | null;
      events: { event_name: string; metadata: Record<string, unknown>; created_at: string }[];
    }>();

    function getKey(email: string | null, phone: string | null): string | null {
      return email || phone || null;
    }

    function addContact(
      email: string | null, phone: string | null, name: string | null,
      utm_source: string | null, utm_medium: string | null,
      utm_campaign: string | null, utm_content: string | null, utm_term: string | null,
      event: { event_name: string; metadata: Record<string, unknown>; created_at: string }
    ) {
      const key = getKey(email, phone);
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

    // Process ticto transactions
    (tictoTxs || []).forEach((tx: any) => {
      addContact(
        tx.customer_email, tx.customer_phone, tx.customer_name,
        tx.utm_source, tx.utm_medium, tx.utm_campaign, tx.utm_content, tx.utm_term,
        {
          event_name: "purchase",
          metadata: { platform: "ticto", product_name: tx.product_name, status: tx.status, amount_cents: tx.paid_amount },
          created_at: tx.order_date || new Date().toISOString(),
        }
      );
    });

    // Process customer_purchases (guru etc.)
    purchaseContacts.forEach((p: any) => {
      addContact(
        p.email, p.phone, p.name,
        p.utm_source, p.utm_medium, p.utm_campaign, p.utm_content, p.utm_term,
        {
          event_name: "purchase",
          metadata: { platform: p.platform || "guru", product_name: p.product_name, status: p.status, amount: p.gross_amount },
          created_at: p.purchased_at || new Date().toISOString(),
        }
      );
    });

    // 5. Create leads and events
    let created = 0;
    let skipped = 0;
    let eventsCreated = 0;

    for (const [, contact] of contactMap) {
      // Find or create lead
      let lead: any = null;
      if (contact.phone) {
        const { data } = await supabase.from("leads").select("id").eq("organization_id", ORG_ID).eq("phone", contact.phone).maybeSingle();
        lead = data;
      }
      if (!lead && contact.email) {
        const { data } = await supabase.from("leads").select("id").eq("organization_id", ORG_ID).eq("email", contact.email).maybeSingle();
        lead = data;
      }

      if (!lead) {
        const { data, error } = await supabase.from("leads").insert({
          organization_id: ORG_ID,
          phone: contact.phone || null,
          email: contact.email || null,
          name: contact.name || null,
          utm_source: contact.utm_source || null,
          metadata: {},
        }).select("id").single();
        if (error) { console.error("Lead insert error:", error); skipped++; continue; }
        lead = data;
        created++;
      } else {
        skipped++;
      }

      // Position in BASE DE LEADS
      if (firstStage) {
        const { data: pos } = await supabase.from("lead_stage_positions").select("id").eq("lead_id", lead.id).eq("funnel_id", baseFunnel.id).maybeSingle();
        if (!pos) {
          await supabase.from("lead_stage_positions").insert({ lead_id: lead.id, funnel_id: baseFunnel.id, stage_id: firstStage.id });
        }
      }

      // Create events
      for (const evt of contact.events) {
        await supabase.from("lead_events").insert({
          lead_id: lead.id,
          funnel_id: baseFunnel.id,
          event_name: evt.event_name,
          metadata: evt.metadata,
          created_at: evt.created_at,
        });
        eventsCreated++;
      }
    }

    const result = { success: true, leads_created: created, leads_existing: skipped, events_created: eventsCreated, total_contacts: contactMap.size };
    console.log("Sync complete:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
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
