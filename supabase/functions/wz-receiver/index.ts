// v2.0.0 - Ticto v2 payload support + improved logging
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

// ─── Normalização de payload por plataforma ───

interface NormalizedEvent {
  contact_phone: string | null;
  contact_name: string | null;
  contact_email: string | null;
  product_name: string | null;
  product_id: string | null;
  offer_name: string | null;
  gross_amount: number;
  paid_amount: number;
  status: string;
  platform: string;
  payment_method: string | null;
  installments: number;
  pix_code: string | null;
  boleto_code: string | null;
  boleto_url: string | null;
  raw_payload: Record<string, unknown>;
}

function normalizeTicto(body: Record<string, any>): NormalizedEvent {
  // ─── Ticto v2: payload aninhado em data.invoice ───
  const invoice = body.data?.invoice || body.invoice || {};
  const customer = invoice.customer || invoice.buyer || body.customer || body.buyer || {};
  const invoiceProduct = invoice.product || {};
  const invoiceItems = invoice.items || [];
  const firstItem = invoiceItems[0] || {};

  // ─── Ticto v1 / legacy top-level ───
  const item = body.item || {};
  const product = body.product || {};
  const transaction = body.transaction || {};

  // ─── Phone: DDI + DDD + Number (igual ao ticto-webhook) ───
  let phone: string | null = null;
  const ddi = customer.phone_local_code || customer.ddi || "";
  const ddd = customer.phone_prefix || customer.ddd || "";
  const number = customer.phone_number || customer.phone || "";
  if (number) {
    phone = `${ddi}${ddd}${number}`.replace(/\D/g, "") || null;
  }
  // fallback v1
  if (!phone) {
    const buyerV1 = body.buyer || body.customer || {};
    if (buyerV1.phone_local_code || buyerV1.phone_number) {
      phone = `${buyerV1.phone_local_code || ""}${buyerV1.phone_number || ""}`.replace(/\D/g, "") || null;
    } else if (buyerV1.phone) {
      phone = String(buyerV1.phone).replace(/\D/g, "") || null;
    }
  }

  // ─── Name / Email ───
  const name = customer.name || customer.full_name || (body.buyer || body.customer || {}).name || null;
  const email = customer.email || (body.buyer || body.customer || {}).email || null;

  // ─── Product ───
  const productName =
    invoiceProduct.name || firstItem.product_name || firstItem.name ||
    item.product_name || product.name || body.product_name || null;

  const productId = String(
    invoiceProduct.id || invoiceProduct.product_id ||
    firstItem.product_id || firstItem.id ||
    item.product_id || product.id || body.product_id || ""
  );

  // ─── Offer ───
  const offerName =
    firstItem.offer_name || item.offer_name || body.offer_name || body.offer?.name || null;

  // ─── Amount (centavos) ───
  const amount = Number(
    invoice.paid_amount || invoice.amount || invoice.total || invoice.value ||
    firstItem.amount || firstItem.total_value ||
    item.amount || transaction.gross_amount || transaction.amount || 0
  );

  // ─── Status ───
  const rawStatus = invoice.status || body.status || transaction.status || "";

  return {
    contact_phone: phone,
    contact_name: name,
    contact_email: email,
    product_name: productName,
    product_id: productId,
    offer_name: offerName,
    gross_amount: amount,
    paid_amount: amount,
    status: normalizeStatus(rawStatus),
    platform: "ticto",
    payment_method: normalizePaymentMethod(
      invoice.payment_method || body.payment_method || transaction.payment_method
    ),
    installments: Number(invoice.installments || transaction.installments || 1),
    raw_payload: body,
  };
}

function normalizeGuru(body: Record<string, any>): NormalizedEvent {
  const contact = body.contact || body.buyer || {};
  const product = body.product || {};
  const subscription = body.subscription || {};

  let phone = contact.phone_number || contact.phone || null;
  if (!phone && contact.ddi && contact.phone_number) {
    phone = `${contact.ddi}${contact.phone_number}`;
  }

  const grossRaw = body.payment?.total || body.total || body.amount || 0;
  const gross = Number(grossRaw) > 1000 && Number.isInteger(Number(grossRaw))
    ? Number(grossRaw) / 100
    : Number(grossRaw);

  return {
    contact_phone: phone,
    contact_name: contact.name || contact.first_name || null,
    contact_email: contact.email || null,
    product_name: product.name || body.product_name || null,
    product_id: String(product.id || product.product_id || product.marketplace_id || ""),
    offer_name: body.offer?.name || null,
    gross_amount: gross,
    paid_amount: gross,
    status: normalizeStatus(body.status || subscription.status || ""),
    platform: "guru",
    payment_method: normalizePaymentMethod(body.payment?.method || body.payment_method),
    installments: Number(body.payment?.installments || body.installments || 1),
    raw_payload: body,
  };
}

function normalizeGeneric(body: Record<string, any>): NormalizedEvent {
  return {
    contact_phone: body.phone || body.contact_phone || null,
    contact_name: body.name || body.contact_name || null,
    contact_email: body.email || body.contact_email || null,
    product_name: body.product_name || body.product || null,
    product_id: String(body.product_id || ""),
    offer_name: body.offer_name || body.offer || null,
    gross_amount: Number(body.amount || body.gross_amount || 0),
    paid_amount: Number(body.paid_amount || body.amount || 0),
    status: normalizeStatus(body.status || body.event || ""),
    platform: body.platform || "unknown",
    payment_method: normalizePaymentMethod(body.payment_method),
    installments: Number(body.installments || 1),
    raw_payload: body,
  };
}

function normalizeStatus(raw: string): string {
  const s = String(raw).toLowerCase().trim();
  const map: Record<string, string> = {
    approved: "purchase_approved",
    paid: "purchase_approved",
    completed: "purchase_approved",
    authorized: "purchase_approved",
    sale_approved: "purchase_approved",
    purchase_approved: "purchase_approved",
    waiting_payment: "pix_generated",
    pix_generated: "pix_generated",
    pix_created: "pix_generated",
    boleto_generated: "boleto_generated",
    pending: "pix_generated",
    expired: "pix_expired",
    pix_expired: "pix_expired",
    refused: "payment_refused",
    declined: "payment_refused",
    payment_refused: "payment_refused",
    refunded: "refund",
    refund: "refund",
    chargedback: "refund",
    canceled: "cancellation",
    cancelled: "cancellation",
    cancellation: "cancellation",
    abandoned: "cart_abandoned",
    cart_abandoned: "cart_abandoned",
  };
  return map[s] || s;
}

function normalizePaymentMethod(value: unknown): string | null {
  const m = String(value || "").toLowerCase().trim();
  if (!m) return null;
  if (m.includes("pix")) return "pix";
  if (m.includes("boleto") || m.includes("bank_slip")) return "bank_slip";
  if (m.includes("card") || m.includes("cart")) return "credit_card";
  return m;
}

// ─── Detect platform from payload ───

function detectPlatform(body: Record<string, any>, url: URL): string {
  const p = url.searchParams.get("platform");
  if (p) return p.toLowerCase();
  // Ticto v2 has data.invoice
  if (body.data?.invoice) return "ticto";
  if (body.producer || body.transaction?.id?.toString().match(/^\d{6,}$/)) return "ticto";
  if (body.item?.product_id) return "ticto";
  if (body.subscription || body.marketplace_id) return "guru";
  return "unknown";
}

// ─── Match trigger nodes ───

function matchesTrigger(triggerData: Record<string, any>, event: NormalizedEvent): boolean {
  const triggerType = triggerData.triggerType;

  // "any_event" matches everything
  if (triggerType === "any_event") { /* pass */ }
  else if (triggerType !== event.status) return false;

  // Platform filter
  if (triggerData.platform && triggerData.platform !== "any" && triggerData.platform !== event.platform) return false;

  // Product ID filter (exact match)
  if (triggerData.productIdFilter) {
    if (!event.product_id || String(event.product_id) !== String(triggerData.productIdFilter)) return false;
  }

  // Offer filter
  if (triggerData.offerFilter && event.offer_name) {
    if (!event.offer_name.toLowerCase().includes(triggerData.offerFilter.toLowerCase())) return false;
  } else if (triggerData.offerFilter && !event.offer_name) {
    return false;
  }

  return true;
}

// ─── Main handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[wz-receiver] Missing env vars", { hasUrl: !!supabaseUrl, hasKey: !!serviceRoleKey });
    return jsonResponse({ error: "Server configuration error" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();
    const url = new URL(req.url);
    const platform = detectPlatform(body, url);

    // Normalize
    let event: NormalizedEvent;
    if (platform === "ticto") event = normalizeTicto(body);
    else if (platform === "guru") event = normalizeGuru(body);
    else event = normalizeGeneric(body);

    console.log(`[wz-receiver] Platform=${event.platform} Status=${event.status} Phone=${event.contact_phone} ProductID=${event.product_id} ProductName=${event.product_name}`);

    // Fetch all active flows
    const { data: flows, error: flowsErr } = await supabase
      .from("wz_flows")
      .select("id, nodes, edges")
      .eq("is_active", true);

    if (flowsErr) {
      console.error("Error fetching flows:", flowsErr);
      return jsonResponse({ error: "DB error" }, 500);
    }

    if (!flows || flows.length === 0) {
      console.log("[wz-receiver] No active flows found");
      return jsonResponse({ message: "No active flows", matched: 0 });
    }

    // Check each flow for matching triggers
    let matched = 0;
    const executionIds: string[] = [];

    for (const flow of flows) {
      const nodes = (flow.nodes || []) as Record<string, any>[];
      const triggerNode = nodes.find((n) => n.type === "trigger");
      if (!triggerNode) continue;

      const triggerData = triggerNode.data || {};
      const isMatch = matchesTrigger(triggerData, event);

      if (!isMatch) {
        console.log(`[wz-receiver] Flow ${flow.id} NO MATCH: triggerType=${triggerData.triggerType} vs status=${event.status}, productFilter=${triggerData.productIdFilter} vs productId=${event.product_id}`);
        continue;
      }

      console.log(`[wz-receiver] Flow ${flow.id} MATCHED! Creating execution...`);
      matched++;

      // Create execution
      const variables = {
        product_name: event.product_name,
        product_id: event.product_id,
        offer_name: event.offer_name,
        gross_amount: event.gross_amount,
        paid_amount: event.paid_amount,
        payment_method: event.payment_method,
        installments: event.installments,
        platform: event.platform,
      };

      const { data: execution, error: execErr } = await supabase
        .from("wz_executions")
        .insert({
          flow_id: flow.id,
          contact_phone: event.contact_phone,
          contact_name: event.contact_name,
          contact_email: event.contact_email,
          trigger_event: event.status,
          trigger_payload: event.raw_payload,
          variables,
          status: "running",
          current_node_id: triggerNode.id,
        })
        .select("id")
        .single();

      if (execErr) {
        console.error(`Error creating execution for flow ${flow.id}:`, execErr);
        continue;
      }

      executionIds.push(execution.id);

      // Find first node after trigger
      const edges = (flow.edges || []) as Record<string, any>[];
      const nextEdge = edges.find((e) => e.source === triggerNode.id);
      if (nextEdge) {
        // Awaited call to wz-executor to prevent premature termination
        const execUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/wz-executor`;
        try {
          const execRes = await fetch(execUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              execution_id: execution.id,
              flow_id: flow.id,
              current_node_id: nextEdge.target,
            }),
          });
          const execBody = await execRes.text();
          console.log(`[wz-receiver] wz-executor response for exec ${execution.id}: ${execRes.status} ${execBody.slice(0, 300)}`);
        } catch (err) {
          console.error("Error calling wz-executor:", err);
        }
      } else {
        // No edge from trigger — mark completed
        await supabase
          .from("wz_executions")
          .update({ status: "completed", finished_at: new Date().toISOString() })
          .eq("id", execution.id);
      }
    }

    return jsonResponse({ message: "OK", matched, execution_ids: executionIds });
  } catch (err) {
    console.error("[wz-receiver] Error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
