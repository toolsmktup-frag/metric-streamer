import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Normaliza valor monetário: aceita centavos (int) ou reais (float) */
function parseAmount(value: unknown): number {
  if (!value) return 0;
  const n = Number(value);
  // Guru envia em centavos quando value > 1000 e parece inteiro
  return n > 1000 && Number.isInteger(n) ? n / 100 : n;
}

function normalizePaymentMethod(value: unknown): string | null {
  const method = String(value || "").trim().toLowerCase();
  if (!method) return null;
  if (method.includes("pix")) return "pix";
  if (method.includes("boleto") || method.includes("bank_slip") || method.includes("billet")) return "bank_slip";
  if (method.includes("card") || method.includes("cart")) return "credit_card";
  return method;
}

function clampInstallments(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.round(parsed);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = await req.json();

    // Se não tem os campos mínimos, provavelmente é um ping/teste da plataforma — retorna 200
    const hasSale    = payload.sale    || payload.order;
    const hasProduct = payload.product || payload.item || payload.product_name;
    const hasEvent   = payload.event   || payload.status;
    if (!hasSale && !hasProduct && !hasEvent) {
      console.log("Ping or test payload received, ignoring:", JSON.stringify(payload).slice(0, 200));
      return jsonResponse({ success: true, message: "ping ok" });
    }

    // Guru envia diferentes formatos — normalizar aqui
    // Estrutura comum: { event, sale, product, customer, tracking }
    const sale     = payload.sale     || payload.order    || payload.payment || {};
    const product  = payload.product  || payload.item     || payload.items?.[0] || {};
    const customer = payload.customer || payload.buyer    || payload.contact || {};
    const tracking = payload.tracking || payload.utm_data || payload.source || {};
    const payment  = payload.payment  || {};
    const affiliations = payload.affiliations || [];
    const affiliateName = affiliations[0]?.contact_name || affiliations[0]?.name || null;
    const affiliateCommission = Number(affiliations[0]?.commission?.amount || 0) || null;
    const dates    = payload.dates    || {};

    const productName = product.name || product.product_name || payload.product_name || "";
    const rawStatus   = payload.event || payload.status || sale.status || "authorized";
    const status      = String(rawStatus).toLowerCase();

    // Normalizar status Guru → padrão interno
    const statusMap: Record<string, string> = {
      sale_approved:   "authorized",
      sale_completed:  "authorized",
      sale_refused:    "refused",
      sale_refunded:   "refunded",
      sale_chargeback: "chargeback",
      approved:        "authorized",
      paid:            "authorized",
      waiting_payment: "pending",
      pending:         "pending",
      expired:         "canceled",
      canceled:        "canceled",
    };
    const normalizedStatus = statusMap[status];

    // ── Forward to wz-receiver BEFORE skipping — automations need pending/pix events ──
    try {
      const wzUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/wz-receiver?platform=guru`;
      const wzRes = await fetch(wzUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify(payload),
      });
      const wzBody = await wzRes.text();
      console.log(`[guru-webhook] wz-receiver response: ${wzRes.status} ${wzBody.slice(0, 300)}`);
    } catch (fwdErr) {
      console.error("[guru-webhook] wz-receiver forward error (non-fatal):", fwdErr);
    }

    // PIX pendente não deve gerar erro nem salvar, para a Guru não retentar à toa
    if (normalizedStatus === "pending") {
      console.log(`Skipping pending Guru transaction with status "${status}"`);
      return jsonResponse({ success: true, message: "pending order, skipping" }, 200);
    }

    // Status desconhecido nunca deve quebrar o webhook
    if (!normalizedStatus) {
      console.log(`Skipping unknown Guru transaction status "${status}"`);
      return jsonResponse({ success: true, message: `unknown status ${status}, skipping` }, 200);
    }

    // UTMs — fallback: parse checkout_source que a Guru codifica como
    // "{utm_source}hQwK21wXxR{utm_campaign}hQwK21wXxR{utm_medium}hQwK21wXxR{utm_content}hQwK21wXxR{utm_term}"
    const GURU_SEP = "hQwK21wXxR";
    let csUtms: string[] = [];
    const checkoutSource = tracking.checkout_source || payload.infrastructure?.checkout_source || "";
    if (checkoutSource && checkoutSource.includes(GURU_SEP)) {
      csUtms = checkoutSource.split(GURU_SEP);
      console.log("Parsed checkout_source UTMs:", csUtms);
    }

    const utmSource   = tracking.utm_source   || (csUtms[0] || null) || null;
    const utmCampaign = tracking.utm_campaign || (csUtms[1] || null) || null;
    const utmMedium   = tracking.utm_medium   || (csUtms[2] || null) || null;
    const utmContent  = tracking.utm_content  || (csUtms[3] || null) || null;
    const utmTerm     = tracking.utm_term     || (csUtms[4] || null) || null;

    function inferProductType() {
      const explicitType = String(product.type || payload.product_type || "").toLowerCase();
      const productText = `${productName} ${product.offer?.name || ""}`.toLowerCase();

      if (explicitType.includes("sub") || productText.includes("assinatura") || productText.includes("mensal")) {
        return "assinatura";
      }

      if (
        explicitType === "product" ||
        !!payload.shipment ||
        ["pote", "potes", "frasco", "frascos", "cápsula", "capsula", "capsulas", "cápsulas", "kit"].some(term => productText.includes(term))
      ) {
        return "fisico";
      }

      return "digital";
    }

    // Meta Ads IDs — Guru pode enviar diretamente ou via UTM "Name|id"
    function parseUtmPair(value: string | null): { name: string | null; id: string | null } {
      if (!value) return { name: null, id: null };
      const parts = value.split("|");
      if (parts.length === 2) {
        let id = parts[1].trim();
        const colonIdx = id.indexOf("::");
        if (colonIdx > 0) id = id.substring(0, colonIdx);
        return { name: parts[0].trim(), id };
      }
      return { name: value, id: null };
    }

    const campaignParsed = parseUtmPair(utmCampaign);
    const adsetParsed    = parseUtmPair(utmMedium);
    const adParsed       = parseUtmPair(utmContent);

    let finalUtmSource      = utmSource;
    let finalUtmCampaign    = utmCampaign;
    let finalUtmMedium      = utmMedium;
    let finalUtmContent     = utmContent;
    let finalUtmTerm        = utmTerm;
    let finalMetaCampaignId = sale.meta_campaign_id || campaignParsed.id || null;
    let finalMetaAdsetId    = sale.meta_adset_id    || adsetParsed.id    || null;
    let finalMetaAdId       = sale.meta_ad_id       || adParsed.id       || null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, supabaseKey);

    // Resolve funnel_id: primeiro por token na URL, depois por product name ILIKE
    const urlToken = new URL(req.url).searchParams.get("token");
    let funnelId: string | null = null;

    if (urlToken) {
      const { data: funnelByToken } = await supabase
        .from("funnels")
        .select("id")
        .eq("webhook_token", urlToken)
        .single();
      funnelId = funnelByToken?.id ?? null;
    }

    if (!funnelId && productName) {
      const { data } = await supabase.rpc("resolve_funnel_id", { p_product_name: productName });
      funnelId = data || null;
    }

    const customerPhone = customer.phone || customer.telephone || customer.phone_number
      ? `${customer.phone_local_code || ""}${customer.phone || customer.telephone || customer.phone_number || ""}`
      : null;

    // Resolve or create unified customer
    let unifiedCustomerId: string | null = null;
    if (customer.email || customer.cpf || customer.doc || customer.document || customerPhone) {
      const { data } = await supabase.rpc("resolve_or_create_customer", {
        p_org_id: "00000000-0000-0000-0000-000000000001",
        p_email:  customer.email || null,
        p_cpf:    customer.cpf || customer.doc || customer.document || null,
        p_phone:  customerPhone,
        p_name:   customer.name || customer.full_name || null,
      });
      unifiedCustomerId = data || null;
    }

    // ── UTM Inheritance: se UTMs estão vazios, herdar da compra mais recente (24h) ──
    if (!finalUtmSource && unifiedCustomerId) {
      try {
        const { data: donor } = await supabase
          .from("customer_purchases")
          .select("id, utm_source, utm_campaign, utm_medium, utm_content, utm_term, meta_campaign_id, meta_adset_id, meta_ad_id")
          .eq("unified_customer_id", unifiedCustomerId)
          .eq("status", "authorized")
          .not("utm_source", "is", null)
          .gte("purchased_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order("purchased_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (donor) {
          finalUtmSource      = donor.utm_source;
          finalUtmCampaign    = donor.utm_campaign;
          finalUtmMedium      = donor.utm_medium;
          finalUtmContent     = donor.utm_content;
          finalUtmTerm        = donor.utm_term;
          finalMetaCampaignId = donor.meta_campaign_id || finalMetaCampaignId;
          finalMetaAdsetId    = donor.meta_adset_id || finalMetaAdsetId;
          finalMetaAdId       = donor.meta_ad_id || finalMetaAdId;
          console.log(`[guru-webhook] UTM inherited from purchase ${donor.id}`);
        }
      } catch (inheritErr) {
        console.error("[guru-webhook] UTM inheritance error (non-fatal):", inheritErr);
      }
    }

    const transactionId = sale.transaction_id || payment.marketplace_id || sale.id || payload.id || sale.order_id || null;
    const purchasedAt   = sale.approved_date || sale.created_at || dates.ordered_at || dates.created_at || payload.created_at || new Date().toISOString();

    const totalAmount = parseAmount(payment.total ?? sale.total_amount ?? sale.total);
    const grossAmount = parseAmount(
      payment.total ?? sale.amount ?? sale.paid_amount ?? sale.value ?? payment.gross ?? sale.total_amount
    );
    const parsedNetAmount = parseAmount(sale.net_amount ?? sale.commission ?? payment.net ?? null);
    const netAmount = parsedNetAmount > grossAmount ? grossAmount : parsedNetAmount;

    const record = {
      organization_id:        "00000000-0000-0000-0000-000000000001",
      unified_customer_id:    unifiedCustomerId,
      platform:               "guru",
      platform_transaction_id: String(transactionId || ""),
      platform_order_id:      String(sale.order_id || payload.id || sale.id || ""),
      product_name:           productName,
      product_id:             String(product.id || product.product_id || product.marketplace_id || ""),
      offer_name:             product.offer?.name || product.offer_name || product.plan_name || null,
      offer_id:               String(product.offer?.id || product.offer_id || product.plan_id || ""),
      product_type:           inferProductType(),
      gross_amount:           grossAmount || totalAmount || 0,
      net_amount:             netAmount || null,
      payment_method:         normalizePaymentMethod(sale.payment_method || payment.method || payload.payment_method),
      installments:           clampInstallments(payment.installments?.qty || sale.installments_count || 1),
      status:                 normalizedStatus,
      purchased_at:           new Date(purchasedAt).toISOString(),
      utm_source:             finalUtmSource,
      utm_medium:             finalUtmMedium,
      utm_campaign:           finalUtmCampaign,
      utm_content:            finalUtmContent,
      utm_term:               finalUtmTerm,
      meta_campaign_id:       finalMetaCampaignId,
      meta_adset_id:          finalMetaAdsetId,
      meta_ad_id:             finalMetaAdId,
      funnel_id:              funnelId,
      imported_from:          "webhook",
      raw_data:               payload,
      affiliate_name:         affiliateName,
      affiliate_commission:   affiliateCommission,
    };

    const { error } = await supabase
      .from("customer_purchases")
      .upsert(record, { onConflict: "platform,platform_transaction_id" });

    if (error) {
      console.error("DB error:", error, {
        transactionId,
        status: normalizedStatus,
        grossAmount: record.gross_amount,
        netAmount: record.net_amount,
        paymentMethod: record.payment_method,
        installments: record.installments,
      });
      return jsonResponse({ error: "Failed to save transaction", detail: error.message }, 500);
    }

    console.log(`Guru webhook processed: ${normalizedStatus} - product "${productName}" - funnel_id: ${funnelId}`);

    // ── Sincronizar lead — só quando status === "authorized" ──
    if (normalizedStatus === "authorized") {
      try {
        await supabase.rpc("sync_lead_from_sale", {
          p_phone: customerPhone,
          p_email: customer.email || null,
          p_name: customer.name || customer.full_name || null,
          p_utm_source: utmSource,
          p_utm_medium: utmMedium,
          p_utm_campaign: utmCampaign,
          p_utm_content: utmContent,
          p_utm_term: utmTerm,
          p_event_name: "purchase",
          p_product_name: productName || null,
          p_purchased_at: new Date(purchasedAt).toISOString(),
          p_metadata: {
            platform: "guru",
            product_name: productName,
            status: normalizedStatus,
            amount: record.gross_amount,
          },
        });
      } catch (leadErr) {
        console.error("Lead sync error (non-fatal):", leadErr);
      }
    }


    // wz-receiver forward already done at the top (before status filtering)

    // ── Stock deduction (apenas vendas aprovadas) ──
    if (normalizedStatus === "authorized" && productName) {
      try {
        const stockRes = await fetch(`${supabaseUrl}/functions/v1/stock-deductor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            product_name: productName,
            platform: "guru",
            order_id: transactionId || null,
          }),
        });
        const stockBody = await stockRes.text();
        console.log(`[guru-webhook] stock-deductor: ${stockRes.status} ${stockBody.slice(0, 200)}`);
      } catch (stockErr) {
        console.error("[guru-webhook] stock-deductor error (non-fatal):", stockErr);
      }
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return jsonResponse({ error: "Internal server error", detail: String(err) }, 500);
  }
});
