import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeTransactionId(value: unknown): string | null {
  if (value == null) return null;

  const normalized = String(value)
    .replace(/^\uFEFF/, "")
    .replace(/^\s*=\s*"?/, "")
    .replace(/^"+|"+$/g, "")
    .trim();

  return normalized || null;
}

function buildTransactionIdVariants(value: unknown): string[] {
  const normalized = normalizeTransactionId(value);
  if (!normalized) return [];

  return [...new Set([
    normalized,
    `="${normalized}"`,
    `"${normalized}"`,
    ` ${normalized} `,
  ])];
}

/** Mapa canônico de status — normaliza status de qualquer plataforma */
function normalizeStatus(raw: string | null): string {
  if (!raw) return "authorized";
  const s = raw.toLowerCase().trim();
  const map: Record<string, string> = {
    paid: "authorized", approved: "authorized", authorized: "authorized",
    autorizado: "authorized", sale_approved: "authorized", sale_completed: "authorized",
    completed: "authorized", aprovado: "authorized", pago: "authorized",
    pending: "pending", waiting_payment: "pending", pix_created: "pending",
    pix_pending: "pending", bank_slip_created: "pending", bank_slip_delayed: "pending",
    unpaid: "pending", pendente: "pending", "pix gerado": "pending",
    "boleto gerado": "pending", "aguardando pagamento": "pending",
    refunded: "refunded", refund: "refunded", sale_refunded: "refunded",
    reembolsado: "refunded", estornado: "refunded",
    chargeback: "chargeback", sale_chargeback: "chargeback",
    canceled: "canceled", cancelled: "canceled", expired: "canceled",
    cancelado: "canceled", expirado: "canceled", pix_expired: "canceled",
    bank_slip_expired: "canceled",
    refused: "refused", recusado: "refused", sale_refused: "refused",
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
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
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

    const { records, platform, org_id: requestedOrgId } = body;
    const normalizedRequestedOrgId = typeof requestedOrgId === "string" && requestedOrgId.trim()
      ? requestedOrgId.trim()
      : null;

    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: resolvedOrgId, error: orgError } = await authClient.rpc("get_user_org_id");

    let fallbackOrgId: string | null = null;
    if (!resolvedOrgId) {
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Failed to resolve organization via user_profiles:", profileError.message);
      } else {
        fallbackOrgId = profile?.organization_id || null;
      }
    }

    const org_id = resolvedOrgId || fallbackOrgId || normalizedRequestedOrgId || null;

    console.log(`platform=${platform}, requested_org_id=${normalizedRequestedOrgId}, resolved_org_id=${resolvedOrgId}, records=${records?.length}, user_id=${userData.user.id}`);

    if (orgError) {
      console.error("Failed to resolve organization id:", orgError.message);
    }

    if (!records?.length || !platform || !org_id) {
      return new Response(JSON.stringify({
        error: "Missing required fields",
        details: {
          hasRecords: Boolean(records?.length),
          hasPlatform: Boolean(platform),
          hasOrgId: Boolean(org_id),
          resolvedOrgId: resolvedOrgId || null,
          fallbackOrgId,
          requestedOrgId: normalizedRequestedOrgId,
          userId: userData.user.id,
        },
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sanitizedTxIds = records
      .map((record: any) => normalizeTransactionId(record.platform_transaction_id))
      .filter(Boolean);

    const existingTxIds = new Set<string>();
    if (sanitizedTxIds.length > 0) {
      const lookupTxIds = [...new Set(sanitizedTxIds.flatMap((txId) => buildTransactionIdVariants(txId)))];
      const { data: existingRows, error: existingErr } = await supabase
        .from("customer_purchases")
        .select("platform_transaction_id")
        .eq("organization_id", org_id)
        .eq("platform", platform)
        .in("platform_transaction_id", lookupTxIds);

      if (existingErr) {
        console.error("Failed to preload existing transaction ids:", existingErr.message);
      } else {
        for (const row of existingRows || []) {
          const normalized = normalizeTransactionId(row.platform_transaction_id);
          if (normalized) existingTxIds.add(normalized);
        }
      }
    }

    // ── Pre-resolve funnel_ids por product_name (em batch) ──
    const uniqueProducts = [...new Set(records.map((r: any) => r.product_name).filter(Boolean))];
    const funnelCache: Record<string, string | null> = {};
    for (const pn of uniqueProducts) {
      const { data } = await supabase.rpc("resolve_funnel_id", { p_product_name: pn });
      funnelCache[pn] = data || null;
    }
    console.log(`Resolved ${uniqueProducts.length} product names to funnel_ids`);

    let inserted = 0;
    let skipped = 0;
    let invalid = 0;
    let errors = 0;
    let leadsSynced = 0;
    const errorDetails: string[] = [];

    // ── Bulk prepare customer_purchases records ──
    const cpRecords: any[] = [];
    const ttRecords: any[] = [];
    const leadSyncQueue: any[] = [];
    const seenTxIds = new Set<string>();

    for (const record of records) {
      try {
        // Sanitize transaction ID server-side
        const txId = normalizeTransactionId(record.platform_transaction_id);
        if (!txId) { invalid++; continue; }

        const isSkipped = seenTxIds.has(txId) || existingTxIds.has(txId);
        const normalizedSt = normalizeStatus(record.status);

        // Always queue lead sync for authorized sales (even if purchase already exists)
        if (normalizedSt === "authorized") {
          leadSyncQueue.push(record);
        }

        if (isSkipped) { skipped++; continue; }

        seenTxIds.add(txId);
        existingTxIds.add(txId);
        record.platform_transaction_id = txId;

        const funnelId = funnelCache[record.product_name] || null;

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

        cpRecords.push({
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
          funnel_id: funnelId,
        });

        // Para Ticto e Eduzz: salva também em ticto_transactions
        if (platform === 'ticto' || platform === 'eduzz') {
          const extractId = (v: string | null) => v ? (v.match(/\|(\d{10,})/)?.[1] || null) : null;
          const extractName = (v: string | null) => v ? v.split('|')[0].trim() || null : null;
          const isPaid = ['fb','face','instagram'].some(s =>
            (record.utm_source || '').toLowerCase().includes(s)
          ) || !!extractId(record.utm_campaign);

          ttRecords.push({
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
            funnel_id: funnelId,
            source_platform: platform,
          });
        }

        inserted++;
      } catch (err) {
        errors++;
        errorDetails.push(String(err));
      }
    }

    // ── Bulk insert customer_purchases ──
    if (cpRecords.length > 0) {
      const { error: cpErr } = await supabase.from('customer_purchases')
        .upsert(cpRecords, { onConflict: 'platform,platform_transaction_id' });
      if (cpErr) {
        console.error("Bulk customer_purchases error:", cpErr.message);
        if (cpErr.code !== '23505') errorDetails.push(`cp_bulk: ${cpErr.message}`);
      }
    }

    // ── Bulk insert ticto_transactions ──
    if (ttRecords.length > 0) {
      const { error: ttErr } = await supabase.from('ticto_transactions')
        .upsert(ttRecords, { onConflict: 'transaction_hash' });
      if (ttErr && ttErr.code !== '23505') {
        console.error("Bulk ticto_transactions error:", ttErr.message);
      }
    }

    // ── Fire-and-forget lead syncs (best-effort, time-boxed) ──
    const leadPromises = leadSyncQueue.map(record =>
      supabase.rpc("sync_lead_from_sale", {
        p_phone: record.customer_phone || null,
        p_email: record.customer_email || null,
        p_name: record.customer_name || null,
        p_utm_source: record.utm_source || null,
        p_utm_medium: record.utm_medium || null,
        p_utm_campaign: record.utm_campaign || null,
        p_utm_content: record.utm_content || null,
        p_utm_term: record.utm_term || null,
        p_event_name: "purchase",
        p_product_name: record.product_name || null,
        p_purchased_at: record.purchased_at || new Date().toISOString(),
        p_metadata: {
          platform,
          product_name: record.product_name,
          status: "authorized",
          amount: record.gross_amount || 0,
          source: "planilha_import",
        },
      }).then(() => { leadsSynced++; }).catch((err: any) => {
        console.error("Lead sync error (non-fatal):", err);
      })
    );

    // Wait up to 15s for lead syncs
    await Promise.race([
      Promise.allSettled(leadPromises),
      new Promise(resolve => setTimeout(resolve, 15000)),
    ]);

    console.log(`Done: inserted=${inserted}, skipped=${skipped}, invalid=${invalid}, errors=${errors}, leadsSynced=${leadsSynced}`);
    return new Response(
      JSON.stringify({ inserted, skipped, invalid, errors, errorDetails, leadsSynced, organizationId: org_id }),
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
