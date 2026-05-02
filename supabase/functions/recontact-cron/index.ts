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
      .select("id, lead_funnel_id, product_name_contains, display_name, recontact_days, auto_move_stage_id, auto_move_from_stage_id")
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

      const leadIds = positions.map((p: any) => p.lead_id);

      // Fetch ALL purchase events from lead_events to get product names per lead
      const purchaseEventNames = ["purchase", "Purchase", "pago", "authorized", "autorizado"];
      const { data: purchaseEvents } = await supabase
        .from("lead_events")
        .select("lead_id, metadata, created_at")
        .eq("funnel_id", funnelId)
        .in("lead_id", leadIds)
        .in("event_name", purchaseEventNames)
        .order("created_at", { ascending: true });

      // Build per-lead: first/last purchase date + all product names
      const leadPurchaseInfo = new Map<string, { firstDate: string; lastDate: string; productNames: string[] }>();
      for (const evt of purchaseEvents || []) {
        const productName = (evt.metadata as any)?.product_name as string || "";
        const existing = leadPurchaseInfo.get(evt.lead_id);
        if (!existing) {
          leadPurchaseInfo.set(evt.lead_id, {
            firstDate: evt.created_at,
            lastDate: evt.created_at,
            productNames: productName ? [productName] : [],
          });
        } else {
          // Update lastDate if this event is more recent
          if (evt.created_at > existing.lastDate) {
            existing.lastDate = evt.created_at;
          }
          if (productName && !existing.productNames.includes(productName)) {
            existing.productNames.push(productName);
          }
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

      // Helper: match product name to funnel product
      const matchProduct = (pName: string) => {
        const mappedId = mappingLookup.get(pName);
        if (mappedId) {
          const found = funnelProducts.find(fp => fp.id === mappedId);
          if (found) return found;
        }
        return funnelProducts.find(fp =>
          pName.toLowerCase().includes(fp.product_name_contains.toLowerCase())
        );
      };

      for (const pos of positions) {
        const lead = (pos as any).leads;
        if (!lead) continue;
        const metadata = lead.metadata || {};

        // Get purchase info from events
        const info = leadPurchaseInfo.get(pos.lead_id);

        // Resolve purchase date: most recent event > metadata > first event
        let purchasedAt = info?.lastDate || "";
        if (!purchasedAt) {
          purchasedAt = (metadata.purchased_at as string) || "";
        }
        if (!purchasedAt && info) {
          purchasedAt = info.firstDate;
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

        // Get all product names for this lead
        const allProductNames = info?.productNames || [];
        const metaProductName = (metadata.product_name as string) || "";
        const productNamesToCheck = allProductNames.length > 0
          ? allProductNames
          : metaProductName ? [metaProductName] : [];

        // Match ALL products and SUM recontact_days
        let totalRecontactDays = 0;
        let lastMatchedProduct: (typeof funnelProducts)[number] | undefined;

        if (productNamesToCheck.length > 0) {
          for (const pName of productNamesToCheck) {
            const matched = matchProduct(pName);
            if (matched) {
              totalRecontactDays += matched.recontact_days!;
              lastMatchedProduct = matched;
            }
          }
        } else if (funnelProducts.length === 1) {
          // Fallback: single product config
          lastMatchedProduct = funnelProducts[0];
          totalRecontactDays = lastMatchedProduct.recontact_days!;
        }

        if (!lastMatchedProduct || totalRecontactDays === 0) continue;

        // Check if overdue using SUMMED days
        const deadlineMs = purchaseDate.getTime() + totalRecontactDays * 86400000;
        if (now.getTime() < deadlineMs) continue;

        // Already in target stage?
        if (pos.stage_id === lastMatchedProduct.auto_move_stage_id) continue;

        // ─── FILTRO DE ETAPA DE ORIGEM ───
        // Se o produto tem auto_move_from_stage_id configurado, só move se o
        // lead estiver naquela etapa. Protege leads em negociação, aguardando
        // resposta etc. de serem atropelados pelo cron.
        if (
          lastMatchedProduct.auto_move_from_stage_id &&
          pos.stage_id !== lastMatchedProduct.auto_move_from_stage_id
        ) {
          continue;
        }

        // Move lead
        const { error: moveErr } = await supabase
          .from("lead_stage_positions")
          .update({ stage_id: lastMatchedProduct.auto_move_stage_id })
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
            to_stage_id: lastMatchedProduct.auto_move_stage_id,
            product_id: lastMatchedProduct.id,
            product_name: lastMatchedProduct.display_name || lastMatchedProduct.product_name_contains,
            total_recontact_days: totalRecontactDays,
            products_matched: productNamesToCheck.length,
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
