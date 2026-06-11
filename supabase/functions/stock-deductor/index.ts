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

/**
 * stock-deductor
 *
 * Recebe { product_name, platform, order_id } de um webhook de venda aprovada.
 * Busca match em product_offer_mappings (case-insensitive) e deduz:
 *   - current_stock  (produto acabado)
 *   - stock_potes    (potes vazios)
 *   - stock_etiquetas
 * Registra em inventory_movements.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 🔒 Função interna: aceita apenas chamadas autenticadas com a service_role key
  // (invocada internamente pelos webhooks de venda). Bloqueia chamadas externas.
  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader !== `Bearer ${supabaseKey}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const { product_name, product_id: externalProductId, platform, order_id } = await req.json();

    if (!product_name && !externalProductId) {
      return jsonResponse({ skipped: true, reason: "no product_name or product_id" });
    }

    const productNameLower = product_name ? product_name.trim().toLowerCase() : "";
    console.log(`[stock-deductor] Looking up: name="${productNameLower}" ext_id="${externalProductId || ""}" platform=${platform || "any"}`);

    // Busca todos os mappings
    const { data: mappings, error: mapErr } = await supabase
      .from("product_offer_mappings")
      .select("id, product_id, offer_name, quantity, platform, external_product_id");
    if (mapErr) {
      console.error("[stock-deductor] Error fetching mappings:", mapErr);
      return jsonResponse({ error: "Failed to fetch mappings" }, 500);
    }

    if (!mappings || mappings.length === 0) {
      console.log("[stock-deductor] No mappings configured, skipping");
      return jsonResponse({ skipped: true, reason: "no mappings configured" });
    }

    // Match: prioriza external_product_id, fallback para offer_name
    const platformFilter = (m: any) => {
      if (m.platform && m.platform !== "both" && platform) {
        return m.platform.toLowerCase() === platform.toLowerCase();
      }
      return true;
    };

    let match = externalProductId
      ? mappings.find((m: any) => m.external_product_id === String(externalProductId) && platformFilter(m))
      : null;

    if (!match && productNameLower) {
      match = mappings.find((m: any) => {
        const nameMatch = m.offer_name.trim().toLowerCase() === productNameLower;
        return nameMatch && platformFilter(m);
      });
    }

    if (!match) {
      console.log(`[stock-deductor] No mapping found for "${product_name}"`);
      return jsonResponse({ skipped: true, reason: "no mapping match" });
    }

    const qty = match.quantity || 1;
    console.log(`[stock-deductor] Match found: product_id=${match.product_id} quantity=${qty}`);

    // Busca produto atual
    const { data: product, error: prodErr } = await supabase
      .from("physical_products")
      .select("id, name, current_stock, stock_potes, stock_etiquetas")
      .eq("id", match.product_id)
      .single();

    if (prodErr || !product) {
      console.error("[stock-deductor] Product not found:", match.product_id);
      return jsonResponse({ error: "Product not found" }, 404);
    }

    // Deduz estoque — apenas produto acabado (potes e etiquetas são consumidos na montagem/produção)
    const newStock = Math.max(0, product.current_stock - qty);

    const { error: updateErr } = await supabase
      .from("physical_products")
      .update({
        current_stock: newStock,
        updated_at: new Date().toISOString(),
      })
      .eq("id", product.id);

    if (updateErr) {
      console.error("[stock-deductor] Update error:", updateErr);
      return jsonResponse({ error: "Failed to update stock" }, 500);
    }

    // Registra movimento
    const { error: mvErr } = await supabase
      .from("inventory_movements")
      .insert({
        product_id: product.id,
        type: "out",
        quantity: qty,
        source: "webhook",
        reference_id: order_id || null,
        notes: `Venda: "${product_name}" (${platform || "unknown"}) → -${qty} un`,
      });

    if (mvErr) {
      console.error("[stock-deductor] Movement insert error (non-fatal):", mvErr);
    }

    console.log(
      `[stock-deductor] ✅ Deducted ${qty} from "${product.name}": ` +
      `stock ${product.current_stock}→${newStock}`
    );

    return jsonResponse({
      success: true,
      product: product.name,
      deducted: qty,
      remaining: { stock: newStock },
    });
  } catch (err) {
    console.error("[stock-deductor] Error:", err);
    return jsonResponse({ error: "Internal error", detail: String(err) }, 500);
  }
});
