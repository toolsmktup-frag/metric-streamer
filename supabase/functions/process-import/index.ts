import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  console.log("Function started");

  try {
    const authHeader = req.headers.get("Authorization");
    console.log("Auth header present:", !!authHeader);

    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      console.error("Failed to parse body:", e);
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { records, platform, org_id } = body;
    console.log(`platform=${platform}, org_id=${org_id}, records=${records?.length}`);

    if (!records?.length || !platform || !org_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    let leadsSynced = 0;
    const errorDetails: string[] = [];

    for (const record of records) {
      try {
        if (!record.platform_transaction_id) { skipped++; continue; }

        const normalizedSt = normalizeStatus(record.status);

        // Resolve ou cria cliente
        let unified_customer_id: string | null = null;
        if (record.customer_email || record.customer_cpf || record.customer_phone) {
          const { data: cid, error: cerr } = await supabase.rpc('resolve_or_create_customer', {
            p_org_id: org_id,
            p_email: record.customer_email || null,
            p_cpf: record.customer_cpf || null,
            p_phone: record.customer_phone || null,
            p_name: record.customer_name || null,
          });
          if (!cerr) unified_customer_id = cid;
          else console.error("Customer error:", cerr.message);
        }

        // Salva em customer_purchases
        const { error: pe } = await supabase.from('customer_purchases').insert({
          organization_id: org_id,
          unified_customer_id,
          platform,
          platform_transaction_id: record.platform_transaction_id,
          platform_order_id: record.platform_order_id || null,
          product_name: record.product_name || 'Desconhecido',
          product_id: record.product_id ? String(record.product_id) : null,
          offer_name: record.offer_name || null,
          gross_amount: record.gross_amount || 0,
          net_amount: record.net_amount || null,
          payment_method: record.payment_method || null,
          installments: record.installments || 1,
          status: normalizedSt,
          purchased_at: record.purchased_at || new Date().toISOString(),
          utm_source: record.utm_source || null,
          utm_medium: record.utm_medium || null,
          utm_campaign: record.utm_campaign || null,
          utm_content: record.utm_content || null,
          utm_term: record.utm_term || null,
          imported_from: 'planilha',
        });

        if (pe) {
          if (pe.code === '23505') { skipped++; continue; }
          errors++;
          errorDetails.push(`${record.platform_transaction_id}: ${pe.message}`);
          continue;
        }

        // Para Ticto e Eduzz: salva também em ticto_transactions (alimenta o dashboard)
        if (platform === 'ticto' || platform === 'eduzz') {
          const extractId = (v: string | null) => v ? (v.match(/\|(\d{10,})/)?.[1] || null) : null;
          const extractName = (v: string | null) => v ? v.split('|')[0].trim() || null : null;
          const isPaid = ['fb','face','instagram'].some(s =>
            (record.utm_source || '').toLowerCase().includes(s)
          ) || !!extractId(record.utm_campaign);

          const { error: te } = await supabase.from('ticto_transactions').insert({
            organization_id: org_id,
            transaction_hash: record.platform_transaction_id,
            order_hash: record.platform_order_id || null,
            order_id: record.platform_order_id ? parseInt(record.platform_order_id) || null : null,
            status: normalizedSt,
            payment_method: record.payment_method || null,
            paid_amount: Math.round((record.gross_amount || 0) * 100),
            installments: record.installments || 1,
            order_date: record.purchased_at || new Date().toISOString(),
            product_name: record.product_name || null,
            product_id: record.product_id ? parseInt(record.product_id) || null : null,
            offer_name: record.offer_name || null,
            customer_name: record.customer_name || null,
            customer_email: record.customer_email || null,
            customer_phone: record.customer_phone || null,
            customer_code: record.customer_cpf || null,
            utm_source: record.utm_source || null,
            utm_medium: record.utm_medium || null,
            utm_campaign: record.utm_campaign || null,
            utm_content: record.utm_content || null,
            utm_term: record.utm_term || null,
            meta_campaign_id: extractId(record.utm_campaign),
            meta_campaign_name: extractName(record.utm_campaign),
            meta_adset_id: extractId(record.utm_content),
            meta_adset_name: extractName(record.utm_content),
            meta_ad_id: extractId(record.utm_term),
            meta_ad_name: extractName(record.utm_term),
            is_paid_traffic: isPaid,
          });
          if (te && te.code !== '23505') {
            console.error("ticto_transactions error:", te.message);
          }
        }

        // ── Sync lead para "BASE DE LEADS" ──
        if (normalizedSt === "authorized") {
          try {
            await syncLeadFromSale(supabase, {
              email: record.customer_email || null,
              phone: record.customer_phone || null,
              name: record.customer_name || null,
              utm_source: record.utm_source || null,
              utm_medium: record.utm_medium || null,
              utm_campaign: record.utm_campaign || null,
              utm_content: record.utm_content || null,
              utm_term: record.utm_term || null,
              event_name: "purchase",
              metadata: {
                platform,
                product_name: record.product_name,
                status: normalizedSt,
                amount: record.gross_amount || 0,
                source: "planilha_import",
              },
            });
            leadsSynced++;
          } catch (err) {
            console.error("Lead sync error (non-fatal):", err);
          }
        }

        inserted++;
      } catch (err) {
        errors++;
        errorDetails.push(String(err));
      }
    }

    console.log(`Done: inserted=${inserted}, skipped=${skipped}, errors=${errors}, leadsSynced=${leadsSynced}`);
    return new Response(
      JSON.stringify({ inserted, skipped, errors, errorDetails, leadsSynced }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Import failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
