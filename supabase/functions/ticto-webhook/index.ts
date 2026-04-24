import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Extract ID and name from UTM values like "Campaign Name|12345" */
function parseUtmPair(value: string | null): { name: string | null; id: string | null } {
  if (!value || value === "Não Informado") return { name: null, id: null };
  const parts = value.split("|");
  if (parts.length === 2) {
    let id = parts[1].trim();
    const colonIdx = id.indexOf("::");
    if (colonIdx > 0) id = id.substring(0, colonIdx);
    return { name: parts[0].trim(), id };
  }
  return { name: value, id: null };
}

function isPaidTraffic(tracking: Record<string, string>): boolean {
  const source = tracking?.utm_source;
  if (!source || source === "Não Informado") return false;
  const paidSources = ["fb", "facebook", "ig", "instagram", "google", "gads", "bing", "tiktok", "kwai", "taboola", "outbrain"];
  return paidSources.some((s) => source.toLowerCase().includes(s));
}

const clean = (value: unknown) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return !text || text === "Não Informado" ? null : text;
};

function extractPaidAmountCents(payload: any, order: any, item: any, payment: any, invoice: any): number {
  const candidates = [
    order?.paid_amount, invoice?.paid_amount, invoice?.amount, invoice?.total,
    invoice?.value, invoice?.price, item?.amount, item?.total_value,
    item?.unit_value, item?.price, item?.value, payment?.amount,
    payment?.paid_amount, payment?.value, payload?.paid_amount,
    payload?.amount, payload?.value, payload?.price, order?.amount,
    order?.value, order?.total, order?.total_value,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (n > 0 && isFinite(n)) return Math.round(n);
  }
  return 0;
}

function extractProductName(payload: any, item: any, invoice: any): string {
  const candidates = [
    item?.product_name, item?.name, item?.product?.name,
    invoice?.product_name, invoice?.product?.name, invoice?.product?.product_name,
    payload?.product_name, payload?.product?.name, payload?.product?.product_name,
  ];
  for (const c of candidates) {
    const v = clean(c);
    if (v) return v;
  }
  return "";
}

/**
 * Safe date parse — returns ISO string or null, never throws.
 *
 * IMPORTANT: A Ticto envia datas no formato "YYYY-MM-DD HH:mm:ss" SEM timezone,
 * representando o horário local de Brasília (BRT, UTC-3). Se interpretarmos
 * como UTC (comportamento default do `new Date`), a venda fica 3h adiantada e
 * cai no dia errado nas views que filtram por timezone local (Resumo Geral,
 * Campanhas, Resumo do Funil que usam v_all_sales).
 *
 * Tratamos datas "naive" (sem TZ explícito) como BRT (-03:00).
 */
const TICTO_TZ_OFFSET = "-03:00";

function safeISO(raw: unknown): string | null {
  if (!raw) return null;
  try {
    let s = String(raw).trim();
    if (!s) return null;

    // Detectar se já tem timezone: 'Z', '+HH:MM', '-HH:MM' (após o 'T'/espaço de hora)
    const hasTz = /[zZ]$|[+\-]\d{2}:?\d{2}$/.test(s);

    if (!hasTz) {
      // Normalizar separador: "2026-04-21 01:10:54" → "2026-04-21T01:10:54"
      s = s.replace(" ", "T");
      // Anexar offset BRT para que o JS interprete corretamente
      s = `${s}${TICTO_TZ_OFFSET}`;
    }

    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startMs = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let payload: any = {};
  let urlToken: string | null = null;

  try {
    payload = await req.json();
    urlToken = new URL(req.url).searchParams.get("token");
  } catch (parseErr) {
    // Audit even parse failures
    try {
      await supabase.from("webhook_audit").insert({
        source: "ticto",
        webhook_token: urlToken,
        error_message: `JSON parse error: ${String(parseErr)}`,
        raw_payload: null,
        processing_ms: Date.now() - startMs,
      });
    } catch (_) {}
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const topKeys = Object.keys(payload).join(", ");
    console.log(`[ticto-webhook] Top-level keys: ${topKeys}`);

    // ── Normalizar payload de abandono (estrutura alternativa da Ticto) ──
    if (payload.name_prod && !payload.item) {
      payload.item = {
        product_name: payload.name_prod,
        product_id: payload.id_prod,
        offer_name: payload.name_offer,
        offer_id: payload.id_offer,
      };
      payload.customer = {
        name: payload.name_customer,
        email: payload.email_customer,
        phone_number: payload.phone_number_customer,
      };
      if (!payload.status && payload.status !== "") {
        payload.status = "abandoned_cart";
      }
      console.log("[ticto-webhook] Normalized abandoned_cart alt payload");
    }

    const invoice = payload.data?.invoice || payload.invoice || payload.data || {};

    const hasSale = payload.sale || payload.order || payload.payment || invoice.id;
    const hasProduct = payload.product || payload.item || payload.items?.[0] || payload.product_name || invoice.product || invoice.product_name;
    const hasEvent = payload.event || payload.status || invoice.status;
    if (!hasSale && !hasProduct && !hasEvent) {
      // Audit ping
      try {
        await supabase.from("webhook_audit").insert({
          source: "ticto",
          webhook_token: urlToken,
          normalized_status: "ping",
          raw_payload: payload,
          processing_ms: Date.now() - startMs,
        });
      } catch (_) {}
      return new Response(JSON.stringify({ success: true, message: "ping ok" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tracking = payload.tracking || invoice.tracking || invoice.utm_data || payload.utm_data || payload.source || {};
    const queryParams = payload.query_params || {};
    const contract = payload.contract || {};
    const order = payload.order || payload.sale || invoice || contract || payload.payment || {};
    const item = payload.item || payload.product || invoice.product || payload.items?.[0] || invoice.items?.[0] || {};
    const customer = payload.customer || invoice.customer || invoice.buyer || payload.buyer || payload.contact || {};
    const payment = payload.payment || invoice.payment || {};
    const dates = payload.dates || invoice.dates || {};
    const affiliations = payload.affiliations || invoice.affiliations || [];
    const affiliateName = affiliations[0]?.contact_name || affiliations[0]?.name || null;
    const affiliateCommission = Number(affiliations[0]?.commission?.amount || 0) || null;

    const campaignParsed = parseUtmPair(tracking.utm_campaign);
    const adsetParsed = parseUtmPair(tracking.utm_medium);
    const adParsed = parseUtmPair(tracking.utm_content);

    let utmSource = clean(tracking.utm_source);
    let utmMedium = clean(tracking.utm_medium);
    let utmCampaign = clean(tracking.utm_campaign);
    let utmContent = clean(tracking.utm_content);
    let utmTerm = clean(tracking.utm_term);
    const src = clean(tracking.src);
    const sck = clean(tracking.sck);
    let inheritedCampaignId: string | null = null;
    let inheritedAdsetId: string | null = null;
    let inheritedAdId: string | null = null;

    // ── Tracking IDs do Facebook/Google (de query_params) ──
    let fbc    = clean(queryParams.fbc);
    let fbp    = clean(queryParams.fbp);
    let fbclid = clean(queryParams.fbclid);
    let gclid  = clean(queryParams.gclid);

    const phone = customer.phone
      ? `${customer.phone.ddi || customer.phone_local_code || ""}${customer.phone.ddd || ""}${customer.phone.number || customer.phone_number || ""}`
      : clean(customer.phone_number);

    const statusDateRaw = payload.status_date || invoice.status_date || invoice.confirmed_at || invoice.attemptDate || dates.confirmed_at || dates.updated_at || dates.created_at || invoice.created_at || contract.updatedAt || null;
    const orderDateRaw = order.order_date || invoice.order_date || invoice.created_at || invoice.attemptDate || contract.createdAt || dates.ordered_at || dates.confirmed_at || dates.created_at || null;
    const statusDate = safeISO(statusDateRaw);
    const orderDate = safeISO(orderDateRaw);

    const rawStatus = String(payload.status || order.status || invoice.status || contract.status || payload.event || "").toLowerCase();
    const late = rawStatus === "late" ? "pending" : null;
    const statusMap: Record<string, string> = {
      // ── Aprovados / pagos ──
      approved: "authorized", authorized: "authorized", paid: "authorized",
      sale_approved: "authorized", sale_completed: "authorized",
      completed: "authorized", purchase_approved: "authorized",
      purchase_complete: "authorized", transaction_approved: "authorized",
      // ── Pendentes ──
      open: "open", pending: "pending", waiting_payment: "pending",
      pix_created: "pending", pix_pending: "pending",
      bank_slip_created: "pending", bank_slip_delayed: "pending",
      // ── Cancelados / expirados ──
      pix_expired: "canceled", bank_slip_expired: "canceled",
      canceled: "canceled", cancelled: "canceled", expired: "canceled", refused: "refused",
      // ── Estorno ──
      refunded: "refunded", refund: "refunded", chargeback: "chargeback", claimed: "refunded",
      // ── Abandono ──
      abandoned_cart: "abandoned_cart", cart_abandoned: "abandoned_cart",
      abandoned: "abandoned_cart",
    };
    const normalizedStatus = late || statusMap[rawStatus] || rawStatus || "open";

    const amountInCents = extractPaidAmountCents(payload, order, item, payment, invoice);
    const productName = extractProductName(payload, item, invoice);
    const offerName = clean(item.offer_name || item.offer?.name || invoice.offer_name || payload.offer_name);
    const offerId = clean(item.offer_id || item.offer?.id || invoice.offer_id || payload.offer_id) || "";
    const orderId = Number(order.id || invoice.id || contract.id || payload.order_id || 0) || null;
    const productId = Number(item.product_id || item.id || invoice.product_id || invoice.product?.id || payload.product_id || 0) || null;
    const installments = Number(order.installments || payment.installments?.qty || invoice.installments || 1) || 1;

    // ── UTM Inheritance: se UTMs estão vazios, herdar da venda mais recente do mesmo cliente (24h) ──
    const customerEmail = clean(customer.email);
    if (!utmSource && (customerEmail || phone)) {
      try {
        // Try by email first
        let donor: any = null;
        const selectCols = "id, utm_source, utm_campaign, utm_medium, utm_content, utm_term, meta_campaign_id, meta_adset_id, meta_ad_id, fbc, fbp, fbclid, gclid";
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        if (customerEmail) {
          const { data } = await supabase
            .from("ticto_transactions")
            .select(selectCols)
            .eq("status", "authorized")
            .ilike("customer_email", customerEmail)
            .not("utm_source", "is", null)
            .gte("order_date", cutoff)
            .order("order_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          donor = data;
        }

        if (!donor && phone) {
          const phoneDigits = phone.replace(/\D/g, "");
          if (phoneDigits.length >= 10) {
            const { data } = await supabase
              .from("ticto_transactions")
              .select(selectCols)
              .eq("status", "authorized")
              .like("customer_phone", `%${phoneDigits.slice(-10)}`)
              .not("utm_source", "is", null)
              .gte("order_date", cutoff)
              .order("order_date", { ascending: false })
              .limit(1)
              .maybeSingle();
            donor = data;
          }
        }

        if (donor) {
          utmSource   = donor.utm_source;
          utmCampaign = donor.utm_campaign;
          utmMedium   = donor.utm_medium;
          utmContent  = donor.utm_content;
          utmTerm     = donor.utm_term;
          inheritedCampaignId = donor.meta_campaign_id;
          inheritedAdsetId    = donor.meta_adset_id;
          inheritedAdId       = donor.meta_ad_id;
          if (!fbc)    fbc    = donor.fbc;
          if (!fbp)    fbp    = donor.fbp;
          if (!fbclid) fbclid = donor.fbclid;
          if (!gclid)  gclid  = donor.gclid;
          console.log(`[ticto-webhook] UTM inherited from transaction ${donor.id}`);
        }
      } catch (inheritErr) {
        console.error("[ticto-webhook] UTM inheritance error (non-fatal):", inheritErr);
      }
    }

    console.log(`[ticto-webhook] Extracted: status=${normalizedStatus} rawStatus=${rawStatus} amount=${amountInCents} product="${productName}" orderId=${orderId} productId=${productId}`);

    const bodyToken = clean(payload.token);
    const webhookToken = urlToken || bodyToken;
    let funnelId: string | null = null;

    if (webhookToken) {
      // Lookup em funnel_platforms (fonte única de verdade pós-migração multi-plataforma)
      const { data: byPlatform } = await supabase
        .from("funnel_platforms")
        .select("funnel_id")
        .eq("webhook_token", webhookToken)
        .eq("is_active", true)
        .maybeSingle();
      funnelId = byPlatform?.funnel_id ?? null;
    }

    if (!funnelId && productName) {
      const { data: funnelData } = await supabase
        .rpc("resolve_funnel_id", { p_product_name: productName });
      funnelId = funnelData || null;
    }

    // ── Audit: registrar ANTES do save principal ──
    try {
      await supabase.from("webhook_audit").insert({
        source: "ticto",
        webhook_token: webhookToken,
        funnel_id: funnelId,
        order_id: orderId,
        product_id: productId,
        raw_status: rawStatus,
        normalized_status: normalizedStatus,
        paid_amount: amountInCents,
        product_name: productName || null,
        raw_payload: payload,
        processing_ms: Date.now() - startMs,
      });
    } catch (auditErr) {
      console.error("[ticto-webhook] Audit insert error (non-fatal):", auditErr);
    }

    // ── Proteção contra sobrescrita ──
    let finalAmount = amountInCents;
    let finalProductName = productName;
    let finalOfferName = offerName;

    if (orderId && productId) {
      const { data: existing } = await supabase
        .from("ticto_transactions")
        .select("paid_amount, product_name, offer_name, funnel_id")
        .eq("order_id", orderId)
        .eq("product_id", productId)
        .maybeSingle();

      if (existing) {
        if (finalAmount === 0 && (existing.paid_amount || 0) > 0) {
          finalAmount = existing.paid_amount;
        }
        if (!finalProductName && existing.product_name) {
          finalProductName = existing.product_name;
        }
        if (!finalOfferName && existing.offer_name) {
          finalOfferName = existing.offer_name;
        }
        if (!funnelId && existing.funnel_id) {
          funnelId = existing.funnel_id;
        }
      }
    }

    // ── Extrair checkout_url e page_url ──
    const checkoutUrl = clean(tracking.checkout_url || queryParams.checkout_url || payload.checkout_url || payload.checkout_page) || null;
    const pageUrl = clean(tracking.page_url || queryParams.page || payload.page_url || payload.page) || null;

    const record = {
      order_id: orderId,
      order_hash: clean(order.hash || order.marketplace_id || payload.id),
      transaction_hash: clean(order.transaction_hash || payment.marketplace_id || payload.id),
      status: normalizedStatus,
      status_date: statusDate,
      payment_method: clean(payload.payment_method || payment.method),
      paid_amount: finalAmount,
      installments,
      order_date: orderDate,
      product_name: finalProductName,
      product_id: productId,
      offer_name: finalOfferName,
      offer_id: offerId,
      offer_code: clean(item.offer_code),
      customer_name: clean(customer.name),
      customer_email: clean(customer.email),
      customer_phone: phone,
      customer_code: clean(customer.code || customer.doc),
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_content: utmContent,
      utm_term: utmTerm,
      src,
      sck,
      meta_campaign_id: inheritedCampaignId || campaignParsed.id,
      meta_campaign_name: campaignParsed.name,
      meta_adset_id: inheritedAdsetId || adsetParsed.id,
      meta_adset_name: adsetParsed.name,
      meta_ad_id: inheritedAdId || adParsed.id,
      meta_ad_name: adParsed.name,
      is_paid_traffic: utmSource ? isPaidTraffic({ ...tracking, utm_source: utmSource }) : isPaidTraffic(tracking),
      funnel_id: funnelId,
      raw_payload: payload,
      ingestion_type: 'webhook',
      source_platform: 'ticto',
      updated_at: new Date().toISOString(),
      affiliate_name: affiliateName,
      affiliate_commission: affiliateCommission,
      fbc,
      fbp,
      fbclid,
      gclid,
      checkout_url: checkoutUrl,
      page_url: pageUrl,
    };

    // ── Save: select+insert/update manual ──
    let saveError: any = null;

    if (orderId && productId) {
      const { data: existing } = await supabase
        .from("ticto_transactions")
        .select("id")
        .eq("order_id", orderId)
        .eq("product_id", productId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("ticto_transactions")
          .update(record)
          .eq("id", existing.id);
        saveError = error;
      } else {
        const { error } = await supabase
          .from("ticto_transactions")
          .insert(record);
        saveError = error;
      }
    } else if (record.transaction_hash) {
      const { error } = await supabase
        .from("ticto_transactions")
        .upsert(record, { onConflict: "transaction_hash" });
      saveError = error;
    } else {
      const { error } = await supabase
        .from("ticto_transactions")
        .insert(record);
      saveError = error;
    }

    if (saveError) {
      console.error("[ticto-webhook] DB error:", saveError);
      // Update audit with error
      try {
        await supabase.from("webhook_audit").insert({
          source: "ticto",
          webhook_token: webhookToken,
          funnel_id: funnelId,
          order_id: orderId,
          product_id: productId,
          raw_status: rawStatus,
          normalized_status: normalizedStatus,
          error_message: `Save error: ${saveError.message}`,
          raw_payload: payload,
          processing_ms: Date.now() - startMs,
        });
      } catch (_) {}
      return new Response(
        JSON.stringify({ error: "Failed to save transaction", detail: saveError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ticto-webhook] Saved: status=${record.status} product="${record.product_name}" amount=${record.paid_amount} funnel=${funnelId} order=${record.order_id}`);

    // ── Sync lead (authorized + eventos de timeline) ──
    const leadSyncEvents: Record<string, string> = {
      authorized: "purchase",
      pending: "pix_generated",
      abandoned_cart: "abandoned_cart",
      refused: "refused",
      refunded: "refunded",
      chargeback: "chargeback",
    };
    const leadEventName = leadSyncEvents[record.status];
    if (leadEventName && (record.customer_phone || record.customer_email)) {
      try {
        await supabase.rpc("sync_lead_from_sale", {
          p_phone: record.customer_phone,
          p_email: record.customer_email,
          p_name: record.customer_name,
          p_utm_source: record.utm_source,
          p_utm_medium: record.utm_medium,
          p_utm_campaign: record.utm_campaign,
          p_utm_content: record.utm_content,
          p_utm_term: record.utm_term,
          p_event_name: leadEventName,
          p_product_name: record.product_name || null,
          p_purchased_at: orderDate || new Date().toISOString(),
          p_metadata: {
            platform: "ticto",
            transaction_id: String((record as any).platform_transaction_id || record.order_hash || ""),
            product_name: record.product_name,
            status: record.status,
            amount_cents: record.paid_amount,
            order_hash: record.order_hash,
            address_street: customer.street || customer.address_street || customer.logradouro || null,
            address_number: customer.number || customer.address_number || customer.numero || null,
            address_complement: customer.complement || customer.address_complement || customer.complemento || null,
            address_neighborhood: customer.neighborhood || customer.bairro || customer.district || null,
            address_city: customer.city || customer.cidade || null,
            address_state: customer.state || customer.estado || customer.uf || null,
            address_zipcode: customer.zipcode || customer.zip_code || customer.cep || null,
            address_country: customer.country || null,
          },
        });
      } catch (leadErr) {
        console.error("[ticto-webhook] Lead sync error (non-fatal):", leadErr);
      }

      // ── Meta CAPI: enviar evento de conversão server-side ──
      if (record.status === "authorized") {
        try {
          // Find lead_funnels where this lead was routed (by product name match)
          const { data: matchedFunnels } = await supabase
            .from("lead_funnels")
            .select("id")
            .not("meta_pixel_id", "is", null)
            .eq("is_active", true);

          if (matchedFunnels && matchedFunnels.length > 0) {
            const capiRes = await fetch(`${supabaseUrl}/functions/v1/meta-capi-sync`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                email: record.customer_email,
                phone: record.customer_phone,
                amount_cents: record.paid_amount,
                currency: "BRL",
                order_id: record.order_id || record.order_hash,
                product_name: record.product_name,
                event_name: "Purchase",
                funnel_ids: matchedFunnels.map((f: any) => f.id),
              }),
            });
            const capiBody = await capiRes.text();
            console.log(`[ticto-webhook] meta-capi-sync: ${capiRes.status} ${capiBody.slice(0, 300)}`);
          }
        } catch (capiErr) {
          console.error("[ticto-webhook] meta-capi-sync error (non-fatal):", capiErr);
        }
      }
    }

    // ── Forward to wz-receiver (awaited to prevent premature termination) ──
    try {
      const wzUrl = `${supabaseUrl}/functions/v1/wz-receiver?platform=ticto`;
      const wzRes = await fetch(wzUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify(payload),
      });
      const wzBody = await wzRes.text();
      console.log(`[ticto-webhook] wz-receiver response: ${wzRes.status} ${wzBody.slice(0, 300)}`);
    } catch (fwdErr) {
      console.error("[ticto-webhook] wz-receiver forward error (non-fatal):", fwdErr);
    }

    // ── Stock deduction (apenas vendas aprovadas) ──
    if (record.status === "authorized" && record.product_name) {
      try {
        const stockRes = await fetch(`${supabaseUrl}/functions/v1/stock-deductor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            product_name: record.product_name,
            product_id: record.product_id ? String(record.product_id) : null,
            platform: "ticto",
            order_id: record.order_id || null,
          }),
        });
        const stockBody = await stockRes.text();
        console.log(`[ticto-webhook] stock-deductor: ${stockRes.status} ${stockBody.slice(0, 200)}`);
      } catch (stockErr) {
        console.error("[ticto-webhook] stock-deductor error (non-fatal):", stockErr);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ticto-webhook] Webhook error:", err);
    // Audit the crash
    try {
      await supabase.from("webhook_audit").insert({
        source: "ticto",
        webhook_token: urlToken,
        error_message: `Unhandled: ${String(err)}`,
        raw_payload: payload,
        processing_ms: Date.now() - startMs,
      });
    } catch (_) {}
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
