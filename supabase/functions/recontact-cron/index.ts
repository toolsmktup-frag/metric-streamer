import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate: only service_role or matching key
    const token = authHeader.replace("Bearer ", "");
    if (token !== SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. Fetch all lead_funnel_products with recontact config
    const { data: products, error: prodErr } = await supabase
      .from("lead_funnel_products")
      .select("id, lead_funnel_id, product_name_contains, display_name, recontact_days, auto_move_stage_id")
      .not("recontact_days", "is", null)
      .not("auto_move_stage_id", "is", null);

    if (prodErr) throw prodErr;
    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ moved: 0, message: "No products with recontact config" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group products by funnel
    const funnelProductsMap = new Map<string, typeof products>();
    for (const p of products) {
      const arr = funnelProductsMap.get(p.lead_funnel_id) || [];
      arr.push(p);
      funnelProductsMap.set(p.lead_funnel_id, arr);
    }

    let totalMoved = 0;
    const now = new Date();

    for (const [funnelId, funnelProducts] of funnelProductsMap) {
      // 2. Fetch all lead positions in this funnel with lead metadata
      const { data: positions, error: posErr } = await supabase
        .from("lead_stage_positions")
        .select("id, lead_id, stage_id, leads!inner(id, metadata)")
        .eq("funnel_id", funnelId);

      if (posErr) {
        console.error(`Error fetching positions for funnel ${funnelId}:`, posErr);
        continue;
      }
      if (!positions || positions.length === 0) continue;

      // Also fetch customer_purchases for date fallback
      const leadIds = positions.map((p: any) => p.lead_id);
      const { data: purchases } = await supabase
        .from("customer_purchases")
        .select("lead_id, purchased_at")
        .in("lead_id", leadIds)
        .order("purchased_at", { ascending: true });

      // Build first purchase date map
      const firstPurchaseMap = new Map<string, string>();
      for (const cp of purchases || []) {
        if (!firstPurchaseMap.has(cp.lead_id)) {
          firstPurchaseMap.set(cp.lead_id, cp.purchased_at);
        }
      }

      // Also fetch lead_product_mappings for explicit matching
      const { data: mappings } = await supabase
        .from("lead_product_mappings")
        .select("raw_product_name, lead_funnel_product_id")
        .in("lead_funnel_product_id", funnelProducts.map(fp => fp.id));

      const mappingLookup = new Map<string, string>();
      for (const m of mappings || []) {
        mappingLookup.set(m.raw_product_name, m.lead_funnel_product_id);
      }

      for (const pos of positions) {
        const lead = (pos as any).leads;
        if (!lead) continue;
        const metadata = lead.metadata || {};
        const productName = (metadata.product_name as string) || "";

        // Resolve purchase date
        let purchasedAt = (metadata.purchased_at as string) || "";
        if (!purchasedAt) {
          purchasedAt = firstPurchaseMap.get(pos.lead_id) || "";
        }
        if (!purchasedAt) continue;

        // Parse date (support dd/MM/yyyy and ISO)
        let purchaseDate: Date | null = null;
        if (purchasedAt.includes("/")) {
          const parts = purchasedAt.split(/[\s\/]+/);
          if (parts.length >= 3) {
            const [dd, mm, yyyy] = parts;
            purchaseDate = new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00`);
          }
        } else {
          purchaseDate = new Date(purchasedAt);
        }
        if (!purchaseDate || isNaN(purchaseDate.getTime())) continue;

        // Match product: explicit mapping first, then substring
        let matchedProduct: (typeof funnelProducts)[number] | undefined;

        if (productName) {
          const mappedId = mappingLookup.get(productName);
          if (mappedId) {
            matchedProduct = funnelProducts.find(fp => fp.id === mappedId);
          }
          if (!matchedProduct) {
            matchedProduct = funnelProducts.find(fp =>
              productName.toLowerCase().includes(fp.product_name_contains.toLowerCase())
            );
          }
        } else if (funnelProducts.length === 1) {
          // Fallback: single product config
          matchedProduct = funnelProducts[0];
        }

        if (!matchedProduct) continue;

        // Check if overdue
        const deadlineMs = purchaseDate.getTime() + matchedProduct.recontact_days! * 86400000;
        if (now.getTime() < deadlineMs) continue;

        // Already in target stage?
        if (pos.stage_id === matchedProduct.auto_move_stage_id) continue;

        // Move lead
        const { error: moveErr } = await supabase
          .from("lead_stage_positions")
          .update({ stage_id: matchedProduct.auto_move_stage_id })
          .eq("id", pos.id);

        if (moveErr) {
          console.error(`Error moving lead ${pos.lead_id}:`, moveErr);
          continue;
        }

        // Log event
        await supabase.from("lead_events").insert({
          lead_id: pos.lead_id,
          funnel_id: funnelId,
          event_name: "auto_recontact_move",
          metadata: {
            from_stage_id: pos.stage_id,
            to_stage_id: matchedProduct.auto_move_stage_id,
            product_id: matchedProduct.id,
            product_name: matchedProduct.display_name || matchedProduct.product_name_contains,
            recontact_days: matchedProduct.recontact_days,
            triggered_by: "cron",
          },
        });

        totalMoved++;
      }
    }

    console.log(`recontact-cron: moved ${totalMoved} leads`);

    return new Response(
      JSON.stringify({ moved: totalMoved }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("recontact-cron error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
