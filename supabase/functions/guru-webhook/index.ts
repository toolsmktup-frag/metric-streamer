import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveQuantity } from "../_shared/potQuantity.ts";

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

/** Normaliza valor monetário: Guru sempre envia em reais (float ou int) */
function parseAmount(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
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
    const queryParams = payload.query_params || {};
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

    // PIX pendente: salvar na tabela de compras e sincronizar lead, mas NÃO gerar erro
    // (removido o return precoce para permitir sync do lead com evento pix_generated)

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

    // ── Tracking IDs do Facebook/Google ──
    let fbc    = queryParams.fbc || tracking.fbc || null;
    let fbp    = queryParams.fbp || tracking.fbp || null;
    let fbclid = queryParams.fbclid || tracking.fbclid || null;
    let gclid  = queryParams.gclid || tracking.gclid || null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, supabaseKey);

    // Resolve funnel_id: primeiro por token na URL, depois por produto (nome/id).
    // Se nenhum funil for resolvido, a venda é aceita mesmo assim (funnel_id = null)
    // para aparecer no Resumo Geral — produtos sem funil dedicado (ex.: RevitaSoul).
    const urlToken = new URL(req.url).searchParams.get("token");
    let funnelId: string | null = null;

    if (urlToken) {
      // 1. Tenta em funnel_platforms (multi-plataforma por funil)
      const { data: byPlatform } = await supabase
        .from("funnel_platforms")
        .select("funnel_id")
        .eq("webhook_token", urlToken)
        .eq("is_active", true)
        .maybeSingle();
      funnelId = byPlatform?.funnel_id ?? null;

      // 2. Fallback: token legado salvo em lead_funnels.webhook_token
      if (!funnelId) {
        const { data: byLegacy } = await supabase
          .from("lead_funnels")
          .select("id")
          .eq("webhook_token", urlToken)
          .maybeSingle();
        funnelId = byLegacy?.id ?? null;
      }

      if (!urlToken || !funnelId) {
        console.warn(`[guru-webhook] token "${urlToken}" não casou com nenhum funil — seguindo sem funnel_id`);
      }
    }

    // 3. Fallback por produto (nome/id) quando não veio token ou token não casou
    if (!funnelId && (productName || product.id || product.product_id || product.marketplace_id)) {
      const earlyProductId = String(product.id || product.product_id || product.marketplace_id || "") || null;
      const { data } = await supabase.rpc("resolve_funnel_id", {
        p_product_name: productName,
        p_product_id:   earlyProductId,
      });
      funnelId = data || null;
    }

    // 🔒 Anti-injeção: exigimos api_token válido (resolvido em guru_accounts logo abaixo)
    // OU funnelId resolvido por token de URL. Sem nenhum dos dois, rejeitamos.
    // A validação final do api_token acontece após o lookup em guru_accounts.

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
          .select("id, utm_source, utm_campaign, utm_medium, utm_content, utm_term, meta_campaign_id, meta_adset_id, meta_ad_id, fbc, fbp, fbclid, gclid")
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
          if (!fbc)    fbc    = donor.fbc;
          if (!fbp)    fbp    = donor.fbp;
          if (!fbclid) fbclid = donor.fbclid;
          if (!gclid)  gclid  = donor.gclid;
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

    // ── Extrair checkout_url e page_url ──
    const checkoutUrl = tracking.checkout_url || sale.checkout_url || payload.checkout_url || queryParams.checkout_url || null;
    const pageUrl = tracking.page_url || queryParams.page || payload.page_url || payload.page || null;

    // ── Resolver conta Guru pelo api_token (Soulnaturi vs Articulabem etc.) ──
    let guruAccountSlug: string | null = null;
    const apiToken = payload.api_token || null;
    if (apiToken) {
      try {
        const { data: acc } = await supabase
          .from("guru_accounts")
          .select("account_slug")
          .eq("api_token", apiToken)
          .maybeSingle();
        guruAccountSlug = acc?.account_slug ?? null;
      } catch (e) {
        console.error("guru_accounts lookup failed (non-fatal):", e);
      }
    }

    // 🔒 Anti-injeção: aceita se (a) token de URL resolveu funil OU (b) api_token bate em guru_accounts.
    if (!funnelId && !guruAccountSlug) {
      console.warn("[guru-webhook] Rejeitado: sem token válido nem api_token reconhecido");
      return new Response(JSON.stringify({ error: "Invalid or missing webhook credentials" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const { quantity: potQty, source: potQtySource } = resolveQuantity({
      offerName: product.offer?.name || product.offer_name || product.plan_name || null,
      productName,
    });

    const record = {
      organization_id:        "00000000-0000-0000-0000-000000000001",
      unified_customer_id:    unifiedCustomerId,
      platform:               "guru",
      quantity:               potQty,
      quantity_source:        potQtySource,
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
      // funnel_id restaurado: FK foi removida em docs/fix-guru-sales-funnel-id.sql
      // (apontava para `funnels` antigo, mas resolvemos via `lead_funnels` novo).
      // Sem funnel_id, a view v_all_sales não associa a venda ao funil → some
      // do Resumo / KPI / Campanhas.
      funnel_id:              funnelId,
      imported_from:          "webhook",
      raw_data:               payload,
      affiliate_name:         affiliateName,
      affiliate_commission:   affiliateCommission,
      fbc,
      fbp,
      fbclid,
      gclid,
      checkout_url:           checkoutUrl,
      page_url:               pageUrl,
      guru_account_slug:      guruAccountSlug,
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
          p_phone: customerPhone,
          p_email: customer.email || null,
          p_name: customer.name || customer.full_name || null,
          p_utm_source: finalUtmSource,
          p_utm_medium: finalUtmMedium,
          p_utm_campaign: finalUtmCampaign,
          p_utm_content: finalUtmContent,
          p_utm_term: finalUtmTerm,
          p_event_name: leadEventName,
          p_product_name: productName || null,
          p_purchased_at: new Date(purchasedAt).toISOString(),
          p_funnel_id: funnelId,
          p_metadata: {
            platform: "guru",
            guru_account: guruAccountSlug,
            transaction_id: String(transactionId || ""),
            product_name: productName,
            status: normalizedStatus,
            amount: record.gross_amount,
            address_street: customer.street || customer.address_street || null,
            address_number: customer.number || customer.address_number || null,
            address_complement: customer.complement || customer.address_complement || null,
            address_neighborhood: customer.neighborhood || customer.bairro || null,
            address_city: customer.city || customer.cidade || null,
            address_state: customer.state || customer.estado || customer.uf || null,
            address_zipcode: customer.zipcode || customer.zip_code || customer.cep || null,
            address_country: customer.country || null,
          },
        });
      } catch (leadErr) {
        console.error("Lead sync error (non-fatal):", leadErr);
      }

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
              email: customer.email || null,
              phone: customerPhone,
              amount_cents: Math.round((record.gross_amount || 0) * 100),
              currency: "BRL",
              order_id: record.platform_transaction_id,
              product_name: productName,
              event_name: "Purchase",
              funnel_ids: matchedFunnels.map((f: any) => f.id),
            }),
          });
          const capiBody = await capiRes.text();
          console.log(`[guru-webhook] meta-capi-sync: ${capiRes.status} ${capiBody.slice(0, 300)}`);
        }
      } catch (capiErr) {
        console.error("[guru-webhook] meta-capi-sync error (non-fatal):", capiErr);
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
