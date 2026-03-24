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
