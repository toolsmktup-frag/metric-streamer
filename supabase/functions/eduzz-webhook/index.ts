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

/** Extrai ID e nome do par "Nome|id" usado nos UTMs do Meta */
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

function isPaidTraffic(utmSource: string | null): boolean {
  if (!utmSource) return false;
  const paid = ["fb", "facebook", "ig", "instagram", "google", "gads", "tiktok", "kwai"];
  return paid.some((s) => utmSource.toLowerCase().includes(s));
}

/** Normaliza status da Eduzz para padrão canônico (alinhado com process-import) */
function mapStatus(status: string): string {
  const map: Record<string, string> = {
    paid:                            "authorized",
    pago:                            "authorized",
    approved:                        "authorized",
    aprovado:                        "authorized",
    uptodade:                        "authorized",
    uptodate:                        "authorized",
    unpaid:                          "pending",
    pending:                         "pending",
    pendente:                        "pending",
    waitingpayment:                  "pending",
    refunded:                        "refunded",
    reembolsado:                     "refunded",
    cancelled:                       "canceled",
    cancelado:                       "canceled",
    chargeback:                      "chargeback",
    expired:                         "canceled",
    refused:                         "refused",
    recusado:                        "refused",
    "myeduzz-invoice-paid":          "authorized",
    "myeduzz.invoice_paid":          "authorized",
    "myeduzz-invoice-refunded":      "refunded",
    "myeduzz.invoice_refunded":      "refunded",
    "myeduzz-invoice-chargeback":    "chargeback",
    "myeduzz.invoice_chargeback":    "chargeback",
    "myeduzz-invoice-canceled":      "canceled",
    "myeduzz.invoice_canceled":      "canceled",
    "myeduzz-invoice-expired":       "canceled",
    "myeduzz.invoice_expired":       "canceled",
    "myeduzz-invoice-waiting-payment": "pending",
  };
  return map[status?.toLowerCase()] || status?.toLowerCase() || "unknown";
}

function normalizePaymentMethod(value: unknown): string | null {
  const method = String(value || "").trim().toLowerCase();
  if (!method) return null;
  if (method.includes("pix")) return "pix";
  if (method.includes("boleto") || method.includes("bank_slip") || method.includes("billet")) return "bank_slip";
  if (method.includes("card") || method.includes("cart")) return "credit_card";
  return method;
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

    // Ping/teste
    if (payload.event === "ping" || payload.data?.message === "ping") {
      console.log("Ping payload, ignoring:", JSON.stringify(payload).slice(0, 200));
      return jsonResponse({ success: true, message: "ping ok" });
    }

    const data     = payload.data     || {};
    const invoice  = data.invoice     || {};
    const customer = data.customer    || {};
    const content  = data.content     || data.product || {};
    const tracking = data.tracking    || data.utm     || {};
    const queryParams = data.query_params || payload.query_params || {};

    const invoiceId = String(invoice.id || "");

    const rawStatus  = invoice.status || payload.event || "unknown";
    const datePaid   = invoice.attemptDate || invoice.paidAt
                       || invoice.dueDate  || payload.sentDate
                       || new Date().toISOString();

    const amountReais = parseFloat(invoice.amount || invoice.value || invoice.price || 0);

    const paymentMethod = normalizePaymentMethod(invoice.payment?.method || invoice.paymentMethod);
    const installments  = parseInt(invoice.installments || 1);

    const productId   = String(content.id   || "");
    const productName = content.name || content.title || "";
    const offerName   = content.offer || content.offerName || null;

    const clientName  = customer.name  || null;
    const clientEmail = customer.email || null;
    const clientDoc   = customer.document || customer.cpf || null;
    const clientPhone = customer.phone || null;

    const utmSource   = tracking.utm_source   || payload.utm_source   || null;
    const utmMedium   = tracking.utm_medium   || payload.utm_medium   || null;
    const utmCampaign = tracking.utm_campaign || payload.utm_campaign || null;
    const utmContent  = tracking.utm_content  || payload.utm_content  || null;
    const utmTerm     = tracking.utm_term     || payload.utm_term     || null;

    // ── Tracking IDs do Facebook/Google ──
    const fbc    = queryParams.fbc || tracking.fbc || null;
    const fbp    = queryParams.fbp || tracking.fbp || null;
    const fbclid = queryParams.fbclid || tracking.fbclid || null;
    const gclid  = queryParams.gclid || tracking.gclid || null;

    const campaignParsed = parseUtmPair(utmCampaign);
    const adsetParsed    = parseUtmPair(utmMedium);
    const adParsed       = parseUtmPair(utmContent);

    if (!invoiceId) {
      console.log("No invoice_id, ignoring event:", payload.event, JSON.stringify(payload).slice(0, 200));
      return jsonResponse({ success: true, message: "event ignored" });
    }

    const transactionHash = String(invoiceId);
    const normalizedStatus = mapStatus(rawStatus);
    const paidAmountCentavos = Math.round(amountReais * 100);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, supabaseKey);

    // Resolve funnel_id
    const urlToken = new URL(req.url).searchParams.get("token");
    let funnelId: string | null = null;

    if (urlToken) {
      // Lookup em funnel_platforms (fonte única de verdade pós-migração multi-plataforma)
      const { data: byPlatform } = await supabase
        .from("funnel_platforms")
        .select("funnel_id")
        .eq("webhook_token", urlToken)
        .eq("is_active", true)
        .maybeSingle();
      funnelId = byPlatform?.funnel_id ?? null;
    }

    if (!funnelId && productName) {
      const { data } = await supabase.rpc("resolve_funnel_id", { p_product_name: productName });
      funnelId = data || null;
    }

    // ── FIX CRÍTICO #3: Resolve or create unified customer (como Guru) ──
    let unifiedCustomerId: string | null = null;
    if (clientEmail || clientDoc || clientPhone) {
      const { data: cid } = await supabase.rpc("resolve_or_create_customer", {
        p_org_id: "00000000-0000-0000-0000-000000000001",
        p_email:  clientEmail,
        p_cpf:    clientDoc,
        p_phone:  clientPhone,
        p_name:   clientName,
      });
      unifiedCustomerId = cid || null;
    }

    // ── FIX CRÍTICO #2: Gravar em customer_purchases (como Guru) ──
    // ── Extrair checkout_url e page_url ──
    const checkoutUrl = tracking.checkout_url || data.checkout_url || invoice.checkout_url || queryParams.checkout_url || payload.checkout_url || null;
    const pageUrl = tracking.page_url || queryParams.page || data.page_url || payload.page_url || null;

    const purchaseRecord = {
      organization_id:        "00000000-0000-0000-0000-000000000001",
      unified_customer_id:    unifiedCustomerId,
      platform:               "eduzz",
      platform_transaction_id: transactionHash,
      platform_order_id:      transactionHash,
      product_name:           productName,
      product_id:             productId || null,
      offer_name:             offerName,
      gross_amount:           amountReais,
      net_amount:             null,
      payment_method:         paymentMethod,
      installments:           installments,
      status:                 normalizedStatus,
      purchased_at:           new Date(datePaid).toISOString(),
      utm_source:             utmSource,
      utm_medium:             utmMedium,
      utm_campaign:           utmCampaign,
      utm_content:            utmContent,
      utm_term:               utmTerm,
      meta_campaign_id:       campaignParsed.id,
      meta_adset_id:          adsetParsed.id,
      meta_ad_id:             adParsed.id,
      funnel_id:              funnelId,
      imported_from:          "webhook",
      raw_data:               payload,
      fbc,
      fbp,
      fbclid,
      gclid,
      checkout_url:           checkoutUrl,
      page_url:               pageUrl,
    };

    const { error: cpError } = await supabase
      .from("customer_purchases")
      .upsert(purchaseRecord, { onConflict: "platform,platform_transaction_id" });

    if (cpError) {
      console.error("customer_purchases error:", cpError);
      return jsonResponse({ error: "Failed to save purchase", detail: cpError.message }, 500);
    }

    // ── Manter gravação em ticto_transactions para dashboards legados ──
    const legacyRecord = {
      organization_id:    "00000000-0000-0000-0000-000000000001",
      transaction_hash:   transactionHash,
      order_hash:         transactionHash,
      status:             normalizedStatus,
      payment_method:     paymentMethod,
      paid_amount:        paidAmountCentavos,
      installments:       installments,
      order_date:         new Date(datePaid).toISOString(),
      product_name:       productName,
      product_id:         productId ? parseInt(productId) || null : null,
      offer_name:         offerName,
      customer_name:      clientName,
      customer_email:     clientEmail,
      customer_phone:     clientPhone,
      customer_code:      clientDoc,
      utm_source:         utmSource,
      utm_medium:         utmMedium,
      utm_campaign:       utmCampaign,
      utm_content:        utmContent,
      utm_term:           utmTerm,
      meta_campaign_id:   campaignParsed.id,
      meta_campaign_name: campaignParsed.name,
      meta_adset_id:      adsetParsed.id,
      meta_adset_name:    adsetParsed.name,
      meta_ad_id:         adParsed.id,
      meta_ad_name:       adParsed.name,
      is_paid_traffic:    isPaidTraffic(utmSource),
      funnel_id:          funnelId,
      raw_payload:        payload,
      updated_at:         new Date().toISOString(),
      fbc,
      fbp,
      fbclid,
      gclid,
      checkout_url:       checkoutUrl,
      page_url:           pageUrl,
    };

    const { error: ttError } = await supabase
      .from("ticto_transactions")
      .upsert(legacyRecord, { onConflict: "transaction_hash" });

    if (ttError) {
      console.error("ticto_transactions legacy error (non-fatal):", ttError);
    }

    console.log(
      `Eduzz webhook processed: ${normalizedStatus} | invoice ${invoiceId}` +
      ` | product "${productName}" | funnel_id: ${funnelId} | R$${amountReais}`
    );

    // ── Sincronizar lead para TODOS os eventos processáveis ──
    const eventMap: Record<string, string> = {
      authorized: "purchase",
      pending:    "pix_generated",
      refused:    "refused",
      refunded:   "refunded",
      chargeback: "chargeback",
      canceled:   "canceled",
    };
    const leadEventName = eventMap[normalizedStatus];

    if (leadEventName) {
      try {
        await supabase.rpc("sync_lead_from_sale", {
          p_phone: clientPhone,
          p_email: clientEmail,
          p_name: clientName,
          p_utm_source: utmSource,
          p_utm_medium: utmMedium,
          p_utm_campaign: utmCampaign,
          p_utm_content: utmContent,
          p_utm_term: utmTerm,
          p_event_name: leadEventName,
          p_product_name: productName || null,
          p_purchased_at: new Date(datePaid).toISOString(),
          p_metadata: {
            platform: "eduzz",
            transaction_id: String(invoiceId || ""),
            product_name: productName,
            status: normalizedStatus,
            amount_reais: amountReais,
            invoice_id: invoiceId,
            address_street: payload.client?.street || payload.client?.address_street || null,
            address_number: payload.client?.number || payload.client?.address_number || null,
            address_complement: payload.client?.complement || payload.client?.address_complement || null,
            address_neighborhood: payload.client?.neighborhood || payload.client?.bairro || null,
            address_city: payload.client?.city || payload.client?.cidade || null,
            address_state: payload.client?.state || payload.client?.estado || null,
            address_zipcode: payload.client?.zipcode || payload.client?.zip_code || payload.client?.cep || null,
            address_country: payload.client?.country || null,
          },
        });
      } catch (leadErr) {
        console.error("Lead sync error (non-fatal):", leadErr);
      }

      // ── Meta CAPI: enviar evento de conversão server-side (só purchase) ──
      if (normalizedStatus === "authorized") {
        try {
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
                email: clientEmail,
                phone: clientPhone,
                amount_cents: paidAmountCentavos,
                currency: "BRL",
                order_id: transactionHash,
                product_name: productName,
                event_name: "Purchase",
                funnel_ids: matchedFunnels.map((f: any) => f.id),
              }),
            });
            const capiBody = await capiRes.text();
            console.log(`[eduzz-webhook] meta-capi-sync: ${capiRes.status} ${capiBody.slice(0, 300)}`);
          }
        } catch (capiErr) {
          console.error("[eduzz-webhook] meta-capi-sync error (non-fatal):", capiErr);
        }
      }
    }

    // ── Forward para wz-receiver (automações WhatsApp) ──
    try {
      const wzPayload = {
        platform: "eduzz",
        event_type: payload.event || rawStatus,
        event_id: `eduzz_${invoiceId}_${normalizedStatus}`,
        contact: {
          name: clientName,
          email: clientEmail,
          phone: clientPhone,
        },
        product: {
          id: productId,
          name: productName,
          offer_name: offerName,
        },
        transaction: {
          id: transactionHash,
          status: normalizedStatus,
          payment_method: paymentMethod,
          gross_amount: amountReais,
          installments: installments,
          pix_code: null,
          boleto_code: null,
          boleto_url: null,
        },
      };

      const wzRes = await fetch(`${supabaseUrl}/functions/v1/wz-receiver`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify(wzPayload),
      });

      const wzResult = await wzRes.text();
      console.log(`[eduzz-webhook] wz-receiver: ${wzRes.status} ${wzResult.slice(0, 200)}`);
    } catch (wzErr) {
      console.error("[eduzz-webhook] wz-receiver forward error (non-fatal):", wzErr);
    }

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
            platform: "eduzz",
            order_id: invoiceId || null,
          }),
        });
        const stockBody = await stockRes.text();
        console.log(`[eduzz-webhook] stock-deductor: ${stockRes.status} ${stockBody.slice(0, 200)}`);
      } catch (stockErr) {
        console.error("[eduzz-webhook] stock-deductor error (non-fatal):", stockErr);
      }
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return jsonResponse({ error: "Internal server error", detail: String(err) }, 500);
  }
});
