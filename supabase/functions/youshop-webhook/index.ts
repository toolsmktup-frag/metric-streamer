import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveQuantity } from "../_shared/potQuantity.ts";
import { readJsonBody } from "../_shared/readJsonBody.ts";
import { parseUtmPair } from "../_shared/parseUtmPair.ts";

/**
 * youshop-webhook — recebe os webhooks da YouShop (Ferramentas → Webhooks,
 * formato "YouShop", tipo "Produto").
 *
 * Eventos que a YouShop oferece no painel:
 *   Pedido: Pix Gerado / Pix Pago / Boleto Gerado / Boleto Pago /
 *           Cartão de Crédito Pago / Pago (todos) / Cancelado
 *   Jornada: Carrinho Abandonado
 *   Assinatura: Ativa / Cancelada / Com Falha / Completada / Renovada / Suspensa
 *
 * A YouShop não publica documentação do JSON. Por isso o parser é tolerante:
 * procura cada campo em vários caminhos (raiz, data, order, transaction,
 * purchase, customer/buyer/client, product/item/items[]) e grava o payload
 * bruto em webhook_audit (source = 'youshop') para ajuste fino após o
 * primeiro "Testar Webhook".
 *
 * Grava SOMENTE em customer_purchases (platform = 'youshop'). A v_all_sales
 * inclui qualquer platform <> 'ticto' automaticamente. NÃO espelhar em
 * ticto_transactions (dupla contagem — ver migration 20260612200000).
 */

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const PLATFORM = "youshop";
const BR_TZ_OFFSET = "-03:00";

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

// ─────────────────────────────────────────────────────────────
// Helpers de extração tolerante
// ─────────────────────────────────────────────────────────────

type Obj = Record<string, any>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Lê um caminho "a.b.c" ou "items.0.name" de um objeto. */
function get(obj: unknown, path: string): unknown {
  let cur: any = obj;
  for (const key of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** Primeiro valor não-vazio entre vários caminhos. */
function pick(obj: unknown, paths: string[]): unknown {
  for (const p of paths) {
    const v = get(obj, p);
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    return v;
  }
  return undefined;
}

function clean(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (isObj(value) || Array.isArray(value)) return null;
  const text = String(value).trim();
  return text && text.toLowerCase() !== "null" && text !== "Não Informado" ? text : null;
}

/** "R$ 1.197,90" | "1197.90" | 1197.9 | "1197,90" → 1197.9 (reais). */
function parseMoney(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return isFinite(value) ? value : null;
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // formato BR: 1.197,90
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // formato EN: 1,197.90
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/**
 * Valor em reais. Chaves com "cents"/"centavos" são tratadas como centavos.
 * Retorna o primeiro caminho com valor > 0.
 */
function pickAmountReais(obj: unknown, paths: string[]): number | null {
  for (const p of paths) {
    const raw = get(obj, p);
    if (raw === undefined || raw === null || raw === "") continue;
    let n = parseMoney(raw);
    if (n === null || n <= 0) continue;
    if (/cent/i.test(p)) n = n / 100;
    return Math.round(n * 100) / 100;
  }
  return null;
}

/**
 * A YouShop envia datas do pedido como `yyyy-mm-dd hh:mm:ss` em UTC e datas
 * da jornada como `dd-mm-yyyy hh:mm:ss` no horário de Brasília.
 */
export function safeISO(raw: unknown): string | null {
  if (!raw) return null;
  try {
    if (typeof raw === "number") {
      // epoch em segundos ou ms
      const ms = raw < 1e12 ? raw * 1000 : raw;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    let s = String(raw).trim();
    if (!s) return null;
    // "dd/mm/yyyy hh:mm:ss" ou "dd-mm-yyyy hh:mm:ss" → Brasília
    const br = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (br) {
      s = `${br[3]}-${br[2]}-${br[1]}T${br[4] || "00"}:${br[5] || "00"}:${br[6] || "00"}${BR_TZ_OFFSET}`;
    }
    const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
    if (!hasTz) {
      s = s.replace(" ", "T");
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00";
      s = `${s}Z`;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

function normalizePaymentMethod(value: unknown): string | null {
  const m = String(value || "").trim().toLowerCase();
  if (!m) return null;
  if (m.includes("pix")) return "pix";
  if (m.includes("boleto") || m.includes("bank_slip") || m.includes("billet") || m.includes("slip")) return "bank_slip";
  if (m.includes("card") || m.includes("cart") || m.includes("credit") || m.includes("crédito") || m.includes("credito")) return "credit_card";
  return m;
}

/**
 * Normaliza status/evento da YouShop para o vocabulário canônico do CRM:
 * authorized | pending | canceled | refused | refunded | chargeback | abandoned_cart
 * Aceita inglês, português, snake/dot/kebab ("order.pix_paid", "Pedido: Pix Pago").
 */
export function mapStatus(...candidates: unknown[]): { normalized: string; raw: string } {
  const raw = candidates.map((c) => clean(c)).filter(Boolean).join(" | ");
  const s = raw
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // tira acentos
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!s) return { normalized: "unknown", raw };

  const has = (re: RegExp) => re.test(s);

  if (has(/abandon|carrinho abandon/)) return { normalized: "abandoned_cart", raw };
  if (has(/cart created|checkout start|iniciou checkout|inicio checkout/)) {
    return { normalized: "checkout_started", raw };
  }
  if (has(/chargeback|charged back|contestac|disputa/)) return { normalized: "chargeback", raw };
  if (has(/refund|estorn|reembols|devolv/)) return { normalized: "refunded", raw };
  if (has(/refus|recus|declin|denied|negad|fail|falh|error|erro/)) return { normalized: "refused", raw };
  if (has(/cancel|expir|vencid|overdue|atrasad|suspens/)) return { normalized: "canceled", raw };
  // "unpaid" / "não pago" antes de "paid"/"pago"
  if (has(/unpaid|nao pago|not paid|waiting|aguard|pending|pendente|generat|gerad|created|criad|emitid|issued|open|aberto|processing|processando|analys|analis/)) {
    return { normalized: "pending", raw };
  }
  if (has(/paid|pago|approved|aprovad|complet|conclu|authorized|autorizad|confirm|success|sucesso|active|ativ|renew|renovad|finished|finalizad/)) {
    return { normalized: "authorized", raw };
  }
  return { normalized: s.replace(/\s+/g, "_"), raw };
}

function isPaidTraffic(utmSource: string | null): boolean {
  if (!utmSource) return false;
  const paid = ["fb", "facebook", "ig", "instagram", "google", "gads", "tiktok", "kwai", "taboola", "outbrain"];
  return paid.some((s) => utmSource.toLowerCase().includes(s));
}

/** Junta DDI+DDD+número quando o telefone vier desmembrado. */
function extractPhone(customer: Obj, payload: Obj): string | null {
  const direct = clean(pick(customer, [
    "phone", "phone_number", "telefone", "celular", "cellphone", "mobile", "whatsapp",
    "phone.full", "phone.number_full", "phone.formatted",
  ])) || clean(pick(payload, ["phone", "phone_number", "telefone", "customer_phone", "phone_number_customer"]));
  if (direct) return direct;
  const ph = customer.phone;
  if (isObj(ph)) {
    const ddi = clean(ph.ddi || ph.country_code || ph.dial_code) || "";
    const ddd = clean(ph.ddd || ph.area_code) || "";
    const num = clean(ph.number || ph.phone) || "";
    const joined = `${ddi}${ddd}${num}`.replace(/\D/g, "");
    return joined || null;
  }
  return null;
}

function extractAddress(customer: Obj, payload: Obj): Obj {
  const addr: Obj = isObj(customer.address) ? customer.address
    : isObj(payload.address) ? payload.address
    : isObj(payload.shipping) ? payload.shipping
    : isObj(payload.shipping_address) ? payload.shipping_address
    : isObj(payload.data?.address) ? payload.data.address
    : isObj(payload.data?.shipping) ? payload.data.shipping
    : {};
  const src = Object.keys(addr).length ? addr : customer;
  return {
    address_street: clean(pick(src, ["street", "address_street", "logradouro", "address", "rua", "line1"])),
    address_number: clean(pick(src, ["number", "address_number", "numero", "street_number"])),
    address_complement: clean(pick(src, ["complement", "address_complement", "complemento", "line2"])),
    address_neighborhood: clean(pick(src, ["neighborhood", "bairro", "district", "address_neighborhood"])),
    address_city: clean(pick(src, ["city", "cidade", "address_city"])),
    address_state: clean(pick(src, ["state", "estado", "uf", "address_state", "province"])),
    address_zipcode: clean(pick(src, ["zipcode", "zip_code", "cep", "postal_code", "zip", "address_zipcode"])),
    address_country: clean(pick(src, ["country", "pais", "address_country"])),
  };
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

export async function handleRequest(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const startMs = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const reqUrl = new URL(req.url);
  const urlToken = reqUrl.searchParams.get("token");

  const audit = async (fields: Obj) => {
    try {
      await supabase.from("webhook_audit").insert({
        source: PLATFORM,
        webhook_token: urlToken,
        processing_ms: Date.now() - startMs,
        ...fields,
      });
    } catch (e) {
      console.error("[youshop-webhook] audit insert error (non-fatal):", e);
    }
  };

  let payload: Obj = {};
  try {
    payload = await readJsonBody(req);
    if (!isObj(payload)) payload = { value: payload };
  } catch (parseErr) {
    await audit({ error_message: `JSON parse error: ${String(parseErr)}`, raw_payload: null });
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  try {
    console.log(`[youshop-webhook] Top-level keys: ${Object.keys(payload).join(", ")}`);

    // ── Containers candidatos ──
    const data: Obj = isObj(payload.data) ? payload.data : payload;
    const cart: Obj =
      (isObj(data.cart) && data.cart) ||
      (Array.isArray(data.carts) && isObj(data.carts[0]) && data.carts[0]) ||
      {};
    const order: Obj =
      (isObj(data.order) && data.order) ||
      (isObj(data.pedido) && data.pedido) ||
      (isObj(data.purchase) && data.purchase) ||
      (isObj(data.transaction) && data.transaction) ||
      (isObj(data.sale) && data.sale) ||
      (isObj(data.invoice) && data.invoice) ||
      data;
    const payment: Obj =
      (isObj(order.payment) && order.payment) ||
      (isObj(data.payment) && data.payment) ||
      (isObj(order.transaction) && order.transaction) ||
      (isObj(data.transaction) && data.transaction) ||
      {};
    const customer: Obj =
      (isObj(data.customer) && data.customer) ||
      (isObj(order.customer) && order.customer) ||
      (isObj(data.buyer) && data.buyer) ||
      (isObj(data.client) && data.client) ||
      (isObj(data.cliente) && data.cliente) ||
      (isObj(data.contact) && data.contact) ||
      (isObj(data.lead) && data.lead) ||
      (isObj(data.user) && data.user) ||
      {};
    const tracking: Obj =
      (isObj(data.tracking) && data.tracking) ||
      (isObj(order.tracking) && order.tracking) ||
      (isObj(data.utm) && data.utm) ||
      (isObj(data.utms) && data.utms) ||
      (isObj(order.utm) && order.utm) ||
      (isObj(data.tracking_parameters) && data.tracking_parameters) ||
      (isObj(data.marketing) && data.marketing) ||
      (isObj(data.access) && data.access) ||
      (Array.isArray(data.visits) && isObj(data.visits[0]) && data.visits[0]) ||
      data;
    const queryParams: Obj =
      (isObj(data.query_params) && data.query_params) ||
      (isObj(order.query_params) && order.query_params) ||
      (isObj(data.url_params) && data.url_params) ||
      tracking;

    // ── Itens (pedido pode ter principal + order bump + upsell) ──
    const itemsRaw: unknown =
      (Array.isArray(order.items) && order.items) ||
      (Array.isArray(order.products) && order.products) ||
      (Array.isArray(data.items) && data.items) ||
      (Array.isArray(data.products) && data.products) ||
      (Array.isArray(data.produtos) && data.produtos) ||
      (isObj(cart.offer) && Array.isArray(cart.offer.items) && cart.offer.items) ||
      null;
    let items: Obj[] = Array.isArray(itemsRaw) ? itemsRaw.filter(isObj) : [];
    if (!items.length) {
      const single =
        (isObj(data.product) && data.product) ||
        (isObj(order.product) && order.product) ||
        (isObj(data.produto) && data.produto) ||
        (isObj(data.item) && data.item) ||
        (isObj(data.offer) && data.offer) ||
        null;
      if (single) items = [single];
    }
    const firstItem: Obj = items[0] || {};

    // ── Identificadores ──
    const orderId = clean(pick(order, [
      "id", "order_id", "code", "order_code", "number", "order_number", "hash", "uuid", "reference", "external_id",
    ])) || clean(pick(data, ["order_id", "order_code", "id", "code", "hash", "uuid", "transaction_id"]));
    const transactionId = clean(pick(payment, ["id", "transaction_id", "code", "hash", "uuid"]))
      || clean(pick(data, ["transaction_id", "transaction_code"]))
      || orderId;

    // ── Status / evento ──
    const eventName = clean(pick(payload, ["event", "event_name", "event_type", "type", "topic", "trigger", "evento", "webhook_event"]))
      || clean(pick(data, ["event", "event_name", "event_type", "evento"]));
    const rawStatusValue = pick(order, ["status", "payment_status", "status_name", "situacao", "situação"])
      ?? pick(payment, ["status", "payment_status"])
      ?? pick(data, ["status", "payment_status", "order_status"]);
    const { normalized: normalizedStatus, raw: rawStatus } = mapStatus(rawStatusValue, eventName);

    // ── Cliente ──
    const customerName = clean(pick(customer, ["name", "full_name", "nome", "first_name"]))
      || clean(pick(data, ["customer_name", "name_customer", "client_name", "buyer_name"]));
    const customerEmail = clean(pick(customer, ["email", "e_mail", "mail"]))
      || clean(pick(data, ["customer_email", "email_customer", "client_email", "buyer_email", "email"]));
    const customerDoc = clean(pick(customer, ["document", "cpf", "cpf_cnpj", "doc", "documento", "tax_id", "document_number"]))
      || clean(pick(data, ["customer_document", "cpf"]));
    const customerPhone = extractPhone(customer, data);
    const address = extractAddress(customer, data);

    // ── Pagamento ──
    const paymentMethod = normalizePaymentMethod(
      pick(payment, ["method", "payment_method", "type", "payment_type", "gateway_method", "forma_pagamento"])
      ?? pick(order, ["payment_method", "method", "payment_type", "forma_pagamento"])
      ?? pick(data, ["payment_method", "method", "forma_pagamento"])
      ?? (eventName || ""),
    );
    const installments = Number(
      pick(payment, ["installments", "installments_count", "parcelas", "installment"])
      ?? pick(order, ["installments", "parcelas"])
      ?? 1,
    ) || 1;

    const orderTotalReais = pickAmountReais(order, [
      "paid_amount", "amount_paid", "total_paid", "total", "total_amount", "amount", "value", "total_value",
      "valor_total", "valor", "price", "gross_amount", "final_amount", "paid_amount_cents", "amount_cents", "total_cents",
    ]) ?? pickAmountReais(payment, ["paid_amount", "amount", "value", "total", "amount_cents"])
      ?? pickAmountReais(data, ["paid_amount", "total", "amount", "value", "valor", "price"])
      ?? pickAmountReais(cart, ["offer.amount", "amount", "total", "value"]);
    const netAmountReais = pickAmountReais(order, ["net_amount", "net_value", "producer_amount", "seller_amount", "valor_liquido", "liquid_amount"])
      ?? pickAmountReais(data, ["net_amount", "net_value", "valor_liquido"]);

    // ── Datas ──
    const paidAt = safeISO(
      pick(payment, ["paid_at", "approved_at", "confirmed_at", "paid_date", "date_paid"])
      ?? pick(order, ["paid_at", "approved_at", "confirmed_at", "paid_date", "date_paid", "status_date", "updated_at"])
      ?? pick(data, ["paid_at", "approved_at", "status_date"]),
    );
    const createdAt = safeISO(
      pick(order, ["created_at", "date", "order_date", "created", "data", "createdAt"])
      ?? pick(data, ["created_at", "date", "order_date", "sent_at", "timestamp", "createdAt"])
      ?? pick(tracking, ["datetime"]),
    );
    // Venda paga conta no dia do pagamento (mesma regra do Ticto, PR #52)
    let purchasedAt = createdAt || paidAt || new Date().toISOString();
    if (normalizedStatus === "authorized" && paidAt &&
        (!createdAt || new Date(paidAt).getTime() >= new Date(createdAt).getTime())) {
      purchasedAt = paidAt;
    }

    // ── UTMs / tracking ──
    const utmSource = clean(pick(tracking, ["utm_source", "utmSource", "source"])) || clean(queryParams.utm_source);
    const utmMedium = clean(pick(tracking, ["utm_medium", "utmMedium", "medium"])) || clean(queryParams.utm_medium);
    const utmCampaign = clean(pick(tracking, ["utm_campaign", "utmCampaign", "campaign"])) || clean(queryParams.utm_campaign);
    const utmContent = clean(pick(tracking, ["utm_content", "utmContent", "content"])) || clean(queryParams.utm_content);
    const utmTerm = clean(pick(tracking, ["utm_term", "utmTerm", "term"])) || clean(queryParams.utm_term);
    const fbc = clean(pick(queryParams, ["fbc", "_fbc"])) || clean(tracking.fbc);
    const fbp = clean(pick(queryParams, ["fbp", "_fbp"])) || clean(tracking.fbp);
    const fbclid = clean(queryParams.fbclid) || clean(tracking.fbclid);
    const gclid = clean(queryParams.gclid) || clean(tracking.gclid);
    const checkoutUrl = clean(pick(tracking, ["checkout_url", "checkout"]))
      || clean(pick(cart, ["checkout_url", "offer.checkout_url"]))
      || clean(pick(data, ["checkout_url", "checkout_link", "url_checkout"]));
    const pageUrl = clean(pick(tracking, ["page_url", "page", "referrer", "referer", "landing_page", "url"])) || clean(pick(data, ["page_url", "referrer"]));

    const campaignParsed = parseUtmPair(utmCampaign);
    const adsetParsed = parseUtmPair(utmMedium);
    const adParsed = parseUtmPair(utmContent);

    // ── Produto principal (para audit / funil) ──
    const productNameOf = (it: Obj) => clean(pick(it, ["name", "product_name", "title", "nome", "product.name", "product.title", "product", "description"]));
    const productIdOf = (it: Obj) => clean(pick(it, ["product_id", "id_product", "product.id", "product_code", "sku", "code", "id", "product.code", "product.sku"]));
    const offerNameOf = (it: Obj) => clean(pick(it, ["offer_name", "offer.name", "offer", "plan_name", "plan.name", "variant", "variant_name", "oferta"]));
    const offerIdOf = (it: Obj) => clean(pick(it, ["offer_id", "offer.id", "offer_code", "offer.code", "plan_id", "variant_id"]));

    const mainProductName = productNameOf(firstItem)
      || clean(pick(data, ["product_name", "name_prod", "produto", "product"]));
    const mainProductId = productIdOf(firstItem)
      || clean(pick(data, ["product_id", "id_prod"]));

    // ── Ping / teste sem dados de venda ──
    const looksLikeSale = !!(orderId || transactionId || mainProductName || customerEmail || customerPhone);
    if (!looksLikeSale) {
      await audit({ normalized_status: "ping", raw_status: rawStatus || null, raw_payload: payload });
      console.log("[youshop-webhook] ping/teste sem dados de venda — só auditado");
      return jsonResponse({ success: true, message: "ping ok" });
    }

    // ── Token opcional: sem token, integra no Resumo Geral (funnel_id = null) ──
    let funnelId: string | null = null;
    if (urlToken) {
      const { data: byPlatform } = await supabase
        .from("funnel_platforms")
        .select("funnel_id")
        .eq("webhook_token", urlToken)
        .eq("platform", PLATFORM)
        .eq("is_active", true)
        .maybeSingle();
      funnelId = byPlatform?.funnel_id ?? null;
      if (!funnelId) {
        console.warn("[youshop-webhook] Rejeitado: webhook_token inválido");
        await audit({
          raw_status: rawStatus || null,
          normalized_status: normalizedStatus,
          product_name: mainProductName,
          error_message: "Invalid webhook token",
          raw_payload: payload,
        });
        return jsonResponse({ error: "Invalid webhook token" }, 401);
      }
    }

    // ── Cliente unificado ──
    let unifiedCustomerId: string | null = null;
    if (customerEmail || customerDoc || customerPhone) {
      try {
        const { data: cid } = await supabase.rpc("resolve_or_create_customer", {
          p_org_id: ORG_ID,
          p_email: customerEmail,
          p_cpf: customerDoc,
          p_phone: customerPhone,
          p_name: customerName,
        });
        unifiedCustomerId = cid || null;
      } catch (custErr) {
        console.error("[youshop-webhook] resolve_or_create_customer error (non-fatal):", custErr);
      }
    }

    // ── Monta as linhas de customer_purchases (uma por item) ──
    const baseTxId = transactionId || orderId
      || `noid:${(customerEmail || customerPhone || "anon").toLowerCase()}:${mainProductId || mainProductName || "?"}:${purchasedAt.slice(0, 10)}`;

    type Row = {
      productName: string | null;
      productId: string | null;
      offerName: string | null;
      offerId: string | null;
      amountReais: number;
      txId: string;
    };

    const rows: Row[] = [];
    if (items.length <= 1) {
      rows.push({
        productName: mainProductName,
        productId: mainProductId,
        offerName: offerNameOf(firstItem) || clean(pick(data, ["offer_name", "name_offer"])),
        offerId: offerIdOf(firstItem) || clean(pick(data, ["offer_id", "id_offer"])),
        amountReais: orderTotalReais ?? pickAmountReais(firstItem, ["price", "amount", "value", "total", "unit_price", "valor"]) ?? 0,
        txId: baseTxId,
      });
    } else {
      // Vários itens: cada um vira uma compra; o primeiro mantém o id "puro"
      // para permanecer idempotente com webhooks anteriores (pix gerado → pago).
      const itemAmounts = items.map((it) => {
        const unit = pickAmountReais(it, ["total", "total_price", "subtotal", "amount", "value", "price", "unit_price", "valor"]) ?? 0;
        const qty = Number(pick(it, ["quantity", "qty", "quantidade"]) ?? 1) || 1;
        const hasTotalKey = get(it, "total") !== undefined || get(it, "total_price") !== undefined || get(it, "subtotal") !== undefined;
        return hasTotalKey ? unit : unit * qty;
      });
      const sumItems = itemAmounts.reduce((a, b) => a + b, 0);
      items.forEach((it, idx) => {
        let amount = itemAmounts[idx];
        // Se os itens não trazem valor, o primeiro leva o total do pedido
        if (sumItems === 0 && idx === 0) amount = orderTotalReais ?? 0;
        const pid = productIdOf(it);
        rows.push({
          productName: productNameOf(it),
          productId: pid,
          offerName: offerNameOf(it),
          offerId: offerIdOf(it),
          amountReais: Math.round(amount * 100) / 100,
          txId: idx === 0 ? baseTxId : `${baseTxId}:${pid || idx}`,
        });
      });
    }

    const totalReais = orderTotalReais ?? rows.reduce((a, r) => a + r.amountReais, 0);

    // ── Audit ANTES do save ──
    await audit({
      funnel_id: funnelId,
      order_id: orderId && /^\d+$/.test(orderId) ? Number(orderId) : null,
      product_id: mainProductId && /^\d+$/.test(mainProductId) ? Number(mainProductId) : null,
      raw_status: rawStatus || null,
      normalized_status: normalizedStatus,
      paid_amount: Math.round(totalReais * 100),
      product_name: mainProductName,
      raw_payload: payload,
    });

    console.log(`[youshop-webhook] status=${normalizedStatus} raw="${rawStatus}" total=R$${totalReais} items=${rows.length} product="${mainProductName}" order=${orderId} tx=${baseTxId} funnel=${funnelId}`);

    // ── Carrinho abandonado: não é compra → só timeline do lead + automações ──
    const isJourneyEvent = normalizedStatus === "abandoned_cart" || normalizedStatus === "checkout_started";

    if (!isJourneyEvent) {
      for (const row of rows) {
        if (!row.productName) {
          console.warn(`[youshop-webhook] item sem nome de produto ignorado (tx=${row.txId})`);
          continue;
        }
        const { quantity: potQty, source: potQtySource } = resolveQuantity({
          offerName: row.offerName,
          productName: row.productName,
        });
        const purchaseRecord = {
          organization_id: ORG_ID,
          unified_customer_id: unifiedCustomerId,
          platform: PLATFORM,
          quantity: potQty,
          quantity_source: potQtySource,
          platform_transaction_id: row.txId,
          platform_order_id: orderId || baseTxId,
          product_name: row.productName,
          product_id: row.productId,
          offer_name: row.offerName,
          offer_id: row.offerId,
          gross_amount: row.amountReais,
          net_amount: rows.length === 1 ? netAmountReais : null,
          payment_method: paymentMethod,
          installments,
          status: normalizedStatus,
          purchased_at: purchasedAt,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          utm_content: utmContent,
          utm_term: utmTerm,
          meta_campaign_id: campaignParsed.id,
          meta_adset_id: adsetParsed.id,
          meta_ad_id: adParsed.id,
          funnel_id: funnelId,
          imported_from: "webhook",
          ingestion_type: "webhook",
          raw_data: payload,
          fbc,
          fbp,
          fbclid,
          gclid,
          checkout_url: checkoutUrl,
          page_url: pageUrl,
        };

        const { error: cpError } = await supabase
          .from("customer_purchases")
          .upsert(purchaseRecord, { onConflict: "platform,platform_transaction_id" });

        if (cpError) {
          console.error("[youshop-webhook] customer_purchases error:", cpError);
          await audit({
            funnel_id: funnelId,
            raw_status: rawStatus || null,
            normalized_status: normalizedStatus,
            product_name: row.productName,
            error_message: `Save error: ${cpError.message}`,
            raw_payload: payload,
          });
          return jsonResponse({ error: "Failed to save purchase", detail: cpError.message }, 500);
        }
        console.log(`[youshop-webhook] saved tx=${row.txId} product="${row.productName}" R$${row.amountReais}`);
      }
    }

    // ── Sync lead (timeline no CRM) ──
    const eventMap: Record<string, string> = {
      authorized: "purchase",
      pending: paymentMethod === "bank_slip" ? "boleto_generated" : "pix_generated",
      refused: "refused",
      refunded: "refunded",
      chargeback: "chargeback",
      canceled: "canceled",
      abandoned_cart: "abandoned_cart",
      checkout_started: "checkout_started",
    };
    const leadEventName = eventMap[normalizedStatus];

    if (leadEventName && (customerPhone || customerEmail)) {
      try {
        await supabase.rpc("sync_lead_from_sale", {
          p_phone: customerPhone,
          p_email: customerEmail,
          p_name: customerName,
          p_utm_source: utmSource,
          p_utm_medium: utmMedium,
          p_utm_campaign: utmCampaign,
          p_utm_content: utmContent,
          p_utm_term: utmTerm,
          p_event_name: leadEventName,
          p_product_name: mainProductName,
          p_purchased_at: purchasedAt,
          p_funnel_id: funnelId,
          p_metadata: {
            platform: PLATFORM,
            transaction_id: baseTxId,
            order_id: orderId,
            product_name: mainProductName,
            status: normalizedStatus,
            amount_reais: totalReais,
            payment_method: paymentMethod,
            ...address,
          },
        });
      } catch (leadErr) {
        console.error("[youshop-webhook] Lead sync error (non-fatal):", leadErr);
      }

      // ── Meta CAPI (só compra aprovada) ──
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
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
              body: JSON.stringify({
                email: customerEmail,
                phone: customerPhone,
                amount_cents: Math.round(totalReais * 100),
                currency: "BRL",
                order_id: orderId || baseTxId,
                product_name: mainProductName,
                event_name: "Purchase",
                funnel_ids: matchedFunnels.map((f: any) => f.id),
              }),
            });
            const capiBody = await capiRes.text();
            console.log(`[youshop-webhook] meta-capi-sync: ${capiRes.status} ${capiBody.slice(0, 300)}`);
          }
        } catch (capiErr) {
          console.error("[youshop-webhook] meta-capi-sync error (non-fatal):", capiErr);
        }
      }
    }

    // ── Forward para wz-receiver (automações WhatsApp) já normalizado ──
    try {
      const wzStatusMap: Record<string, string> = {
        authorized: "purchase_approved",
        pending: paymentMethod === "bank_slip" ? "boleto_generated" : "pix_generated",
        canceled: "cancellation",
        refused: "payment_refused",
        refunded: "refund",
        chargeback: "refund",
        abandoned_cart: "cart_abandoned",
        checkout_started: "checkout_started",
      };
      const pixCode = clean(pick(payment, ["pix.qr_code", "pix.code", "pix.emv", "pix.copy_paste", "pix_code", "pix_qrcode", "qr_code", "qrcode", "emv", "copy_paste"]))
        || clean(pick(order, ["pix.qr_code", "pix.code", "pix_qr_code", "pix_code", "pix_qrcode", "qr_code"]))
        || clean(pick(data, ["pix_qr_code", "pix_code", "pix_qrcode", "qr_code"]));
      const pixUrl = clean(pick(payment, ["pix.url", "pix.qr_code_url", "pix_url", "qr_code_url"]))
        || clean(pick(order, ["pix_qr_code_url", "pix_url", "pix.url"]));
      const boletoCode = clean(pick(payment, ["boleto.digitable_line", "boleto.line", "boleto.barcode", "digitable_line", "boleto_code", "barcode", "linha_digitavel"]))
        || clean(pick(order, ["boleto.digitable_line", "digitable_line", "boleto_code", "linha_digitavel"]));
      const boletoUrl = clean(pick(payment, ["boleto.url", "boleto.pdf", "boleto_url", "bank_slip_url", "billet_url"]))
        || clean(pick(order, ["boleto.url", "boleto_url", "bank_slip_url", "billet_url"]));

      const wzPayload = {
        platform: PLATFORM,
        id: `youshop_${baseTxId}_${normalizedStatus}`,
        event: eventName || rawStatus,
        status: wzStatusMap[normalizedStatus] || normalizedStatus,
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        product_name: mainProductName,
        product_id: mainProductId,
        offer_name: rows[0]?.offerName || null,
        amount: totalReais,
        paid_amount: totalReais,
        payment_method: paymentMethod,
        installments,
        pix_code: pixCode,
        pix_url: pixUrl,
        boleto_code: boletoCode,
        boleto_url: boletoUrl,
        ...address,
        raw: payload,
      };

      const wzRes = await fetch(`${supabaseUrl}/functions/v1/wz-receiver?platform=${PLATFORM}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
        body: JSON.stringify(wzPayload),
      });
      const wzBody = await wzRes.text();
      console.log(`[youshop-webhook] wz-receiver: ${wzRes.status} ${wzBody.slice(0, 200)}`);
    } catch (wzErr) {
      console.error("[youshop-webhook] wz-receiver forward error (non-fatal):", wzErr);
    }

    // ── Baixa de estoque (só aprovadas) ──
    if (normalizedStatus === "authorized") {
      for (const row of rows) {
        if (!row.productName) continue;
        try {
          const stockRes = await fetch(`${supabaseUrl}/functions/v1/stock-deductor`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
            body: JSON.stringify({
              product_name: row.productName,
              product_id: row.productId,
              platform: PLATFORM,
              order_id: orderId || baseTxId,
            }),
          });
          const stockBody = await stockRes.text();
          console.log(`[youshop-webhook] stock-deductor: ${stockRes.status} ${stockBody.slice(0, 200)}`);
        } catch (stockErr) {
          console.error("[youshop-webhook] stock-deductor error (non-fatal):", stockErr);
        }
      }
    }

    return jsonResponse({ success: true, status: normalizedStatus, items: isJourneyEvent ? 0 : rows.length });
  } catch (err) {
    console.error("[youshop-webhook] Webhook error:", err);
    await audit({ error_message: `Unhandled: ${String(err)}`, raw_payload: payload });
    return jsonResponse({ error: "Internal server error", detail: String(err) }, 500);
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
