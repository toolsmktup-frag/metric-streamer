import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseUtmPair(value: string | null): { name: string | null; id: string | null } {
  if (!value) return { name: null, id: null };
  const parts = value.split("|");
  if (parts.length >= 2) {
    let id = parts[1].trim();
    const colonIdx = id.indexOf("::");
    if (colonIdx > 0) id = id.substring(0, colonIdx);
    return { name: parts[0].trim(), id };
  }
  return { name: value, id: null };
}

function isPaidTraffic(utmSource: string | null): boolean {
  if (!utmSource) return false;
  const paidSources = ["fb", "facebook", "ig", "instagram", "google", "gads", "bing", "tiktok", "kwai", "taboola", "outbrain"];
  return paidSources.some(s => utmSource.toLowerCase().includes(s));
}

/** Mapa canônico de status — normaliza status de qualquer plataforma */
function normalizeStatus(raw: string | null): string {
  if (!raw) return "authorized";
  const s = raw.toLowerCase().trim();
  const map: Record<string, string> = {
    paid: "authorized",
    approved: "authorized",
    authorized: "authorized",
    autorizado: "authorized",
    sale_approved: "authorized",
    sale_completed: "authorized",
    completed: "authorized",
    aprovado: "authorized",
    pago: "authorized",

    pending: "pending",
    waiting_payment: "pending",
    pix_created: "pending",
    pix_pending: "pending",
    bank_slip_created: "pending",
    bank_slip_delayed: "pending",
    unpaid: "pending",
    pendente: "pending",
    "pix gerado": "pending",
    "boleto gerado": "pending",
    "aguardando pagamento": "pending",

    refunded: "refunded",
    refund: "refunded",
    sale_refunded: "refunded",
    reembolsado: "refunded",
    estornado: "refunded",

    chargeback: "chargeback",
    sale_chargeback: "chargeback",

    canceled: "canceled",
    cancelled: "canceled",
    expired: "canceled",
    cancelado: "canceled",
    expirado: "canceled",
    pix_expired: "canceled",
    bank_slip_expired: "canceled",

    refused: "refused",
    recusado: "refused",
    sale_refused: "refused",
  };
  return map[s] || s;
}

/** Sync a sale as a lead into the "BASE DE LEADS" funnel */
async function syncLeadFromSale(
  supabase: ReturnType<typeof createClient>,
  params: {
    email: string | null;
    phone: string | null;
    name: string | null;
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
    event_name: string;
    metadata: Record<string, unknown>;
  }
) {
  const ORG_ID = "00000000-0000-0000-0000-000000000001";
  if (!params.email && !params.phone) return;

  let lead: any = null;
  if (params.phone) {
    const { data } = await supabase.from("leads").select("*").eq("organization_id", ORG_ID).eq("phone", params.phone).maybeSingle();
    lead = data;
  }
  if (!lead && params.email) {
    const { data } = await supabase.from("leads").select("*").eq("organization_id", ORG_ID).eq("email", params.email).maybeSingle();
    lead = data;
  }

  if (!lead) {
    const { data, error } = await supabase.from("leads").insert({
      organization_id: ORG_ID,
      phone: params.phone || null,
      email: params.email || null,
      name: params.name || null,
      utm_source: params.utm_source || null,
      utm_medium: params.utm_medium || null,
      utm_campaign: params.utm_campaign || null,
      utm_content: params.utm_content || null,
      utm_term: params.utm_term || null,
      metadata: {},
    }).select().single();
    if (error) { console.error("Lead insert error:", error); return; }
    lead = data;
  } else {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (params.name && !lead.name) updates.name = params.name;
    if (params.utm_source) updates.utm_source = params.utm_source;
    await supabase.from("leads").update(updates).eq("id", lead.id);
  }

  let { data: baseFunnel } = await supabase.from("lead_funnels").select("id").eq("organization_id", ORG_ID).eq("name", "BASE DE LEADS").maybeSingle();
  if (!baseFunnel) {
    const { data: created } = await supabase.from("lead_funnels").insert({
      organization_id: ORG_ID, name: "BASE DE LEADS", color: "#6366f1", is_active: true,
    }).select("id").single();
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
  if (!baseFunnel) return;

  await supabase.from("lead_events").insert({
    lead_id: lead.id, funnel_id: baseFunnel.id, event_name: params.event_name, metadata: params.metadata,
  });

  const { data: existingPos } = await supabase.from("lead_stage_positions").select("id").eq("lead_id", lead.id).eq("funnel_id", baseFunnel.id).maybeSingle();
  if (!existingPos) {
    const { data: firstStage } = await supabase.from("lead_funnel_stages").select("id").eq("funnel_id", baseFunnel.id).order("sort_order", { ascending: true }).limit(1).maybeSingle();
    if (firstStage) {
      await supabase.from("lead_stage_positions").insert({ lead_id: lead.id, funnel_id: baseFunnel.id, stage_id: firstStage.id });
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { records: inputRecords } = await req.json();

    if (!inputRecords || !Array.isArray(inputRecords) || inputRecords.length === 0) {
      return new Response(JSON.stringify({ error: "No records provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const dbRecords = inputRecords.map((r: any) => {
      const campaignParsed = parseUtmPair(r.utm_campaign);
      const adsetParsed = parseUtmPair(r.utm_medium);
      const adParsed = parseUtmPair(r.utm_content);

      return {
        order_id: r.order_id || null,
        order_hash: r.order_hash || null,
        order_date: r.order_date || null,
        product_id: r.product_id || null,
        product_name: r.product_name || null,
        offer_name: r.offer_name || null,
        offer_code: r.offer_code || null,
        transaction_hash: r.transaction_hash,
        status: normalizeStatus(r.status),
        status_date: r.status_date || null,
        payment_method: r.payment_method || null,
        installments: r.installments || 1,
        paid_amount: r.paid_amount || 0,
        customer_name: r.customer_name || null,
        customer_email: r.customer_email || null,
        customer_phone: r.customer_phone || null,
        customer_code: r.customer_code || null,
        src: r.src || null,
        sck: r.sck || null,
        utm_source: r.utm_source || null,
        utm_campaign: r.utm_campaign || null,
        utm_medium: r.utm_medium || null,
        utm_content: r.utm_content || null,
        utm_term: r.utm_term || null,
        meta_campaign_id: campaignParsed.id,
        meta_campaign_name: campaignParsed.name,
        meta_adset_id: adsetParsed.id,
        meta_adset_name: adsetParsed.name,
        meta_ad_id: adParsed.id,
        meta_ad_name: adParsed.name,
        is_paid_traffic: isPaidTraffic(r.utm_source),
        updated_at: new Date().toISOString(),
      };
    });

    // Insert in batches of 50
    let inserted = 0;
    const errors: string[] = [];
    for (let i = 0; i < dbRecords.length; i += 50) {
      const batch = dbRecords.slice(i, i + 50);
      const { error } = await supabase
        .from("ticto_transactions")
        .upsert(batch, { onConflict: "transaction_hash" });
      if (error) {
        errors.push(`Batch ${Math.floor(i / 50)}: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }

    // ── Sync leads para "BASE DE LEADS" ──
    let leadsSynced = 0;
    for (const rec of dbRecords) {
      if (rec.status !== "authorized") continue;
      try {
        await syncLeadFromSale(supabase, {
          email: rec.customer_email,
          phone: rec.customer_phone,
          name: rec.customer_name,
          utm_source: rec.utm_source,
          utm_medium: rec.utm_medium,
          utm_campaign: rec.utm_campaign,
          utm_content: rec.utm_content,
          utm_term: rec.utm_term,
          event_name: "purchase",
          metadata: {
            platform: "ticto",
            product_name: rec.product_name,
            status: rec.status,
            amount_cents: rec.paid_amount,
            source: "csv_import",
          },
        });
        leadsSynced++;
      } catch (err) {
        console.error("Lead sync error (non-fatal):", err);
      }
    }

    console.log(`Import: ${inserted} inserted, ${errors.length} errors, ${leadsSynced} leads synced`);

    return new Response(
      JSON.stringify({ success: true, inserted, errors, leadsSynced }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Import error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
