import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonResponse({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const body = await req.json();
    const { action, messages, observation } = body;

    // Validações de segurança
    if (!["chat", "daily_analysis"].includes(action)) {
      return jsonResponse({ error: "Invalid action" }, 400);
    }
    if (observation && observation.length > 600) {
      return jsonResponse({ error: "Observation too long (max 600 chars)" }, 400);
    }
    if (messages && messages.length > 30) {
      return jsonResponse({ error: "Too many messages in history" }, 400);
    }
    const safeObservation = (observation || "").replace(/[\[\]<>{}\\]/g, "").slice(0, 600);

    // TODO: rate limiting via api_rate_limits table

    // BRT timezone
    const nowUTC = new Date();
    const nowBRT = new Date(nowUTC.getTime() - 3 * 60 * 60 * 1000);
    const dateTo = nowBRT.toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(nowBRT);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 21); // 21 dias: balanço entre contexto e CPU timeout
    const dateFrom = thirtyDaysAgo.toISOString().split("T")[0];

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Pagination helper ──
    const PAGE_SIZE = 500;
    const MAX_ROWS = 1000; // hard cap to avoid CPU time exceeded
    const fetchPaged = async <T = any>(
      queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
    ): Promise<T[]> => {
      const all: T[] = [];
      let from = 0;
      while (true) {
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await queryFactory(from, to);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE_SIZE) break;
        if (all.length >= MAX_ROWS) break;
        from += PAGE_SIZE;
      }
      return all;
    };

    // ── Fetch all data in parallel ──
    const [
      campaignsData,
      adsetsData,
      adsData,
      creativesData,
      campaignInsightsData,
      adsetInsightsData,
      adInsightsData,
      salesData,
      demoData,
      deviceData,
      geoData,
      pastAnalysesData,
      changeLogData,
      rfmSegmentsData,
      cohortData,
      allSalesData,
      refundsData,
    ] = await Promise.all([
      fetchPaged((from, to) =>
        serviceClient.from("meta_campaigns")
          .select("id,name,status,objective,daily_budget")
          .order("id", { ascending: true }).range(from, to)
      ),
      fetchPaged((from, to) =>
        serviceClient.from("meta_adsets")
          .select("id,name,status,campaign_id,targeting")
          .order("id", { ascending: true }).range(from, to)
      ),
      fetchPaged((from, to) =>
        serviceClient.from("meta_ads")
          .select("id,name,status,adset_id,campaign_id,creative")
          .order("id", { ascending: true }).range(from, to)
      ),
      fetchPaged((from, to) =>
        serviceClient.from("ad_creatives")
          .select("ad_id,hook,angle,format,description")
          .order("ad_id", { ascending: true }).range(from, to)
      ),
      fetchPaged((from, to) =>
        serviceClient.from("meta_insights")
          .select("object_id,object_type,spend,impressions,clicks,link_clicks,ctr,cpm,cpc,actions,date_start")
          .eq("object_type", "campaign")
          .gte("date_start", dateFrom).lte("date_start", dateTo)
          .order("date_start", { ascending: false }).range(from, to)
      ),
      fetchPaged((from, to) =>
        serviceClient.from("meta_insights")
          .select("object_id,object_type,spend,impressions,clicks,link_clicks,actions,date_start")
          .eq("object_type", "adset")
          .gte("date_start", dateFrom).lte("date_start", dateTo)
          .order("date_start", { ascending: false }).range(from, to)
      ),
      fetchPaged((from, to) =>
        serviceClient.from("meta_insights")
          .select("object_id,object_type,spend,impressions,clicks,link_clicks,actions,date_start")
          .eq("object_type", "ad")
          .gte("date_start", dateFrom).lte("date_start", dateTo)
          .order("date_start", { ascending: false }).range(from, to)
      ),
      fetchPaged((from, to) =>
        serviceClient.from("ticto_transactions")
          .select("meta_campaign_id,meta_campaign_name,meta_adset_id,meta_adset_name,meta_ad_id,meta_ad_name,paid_amount,status,order_date,product_name,offer_name,payment_method,installments,is_paid_traffic")
          .eq("status", "authorized")
          .gte("order_date", `${dateFrom}T00:00:00`)
          .lte("order_date", `${dateTo}T23:59:59`)
          .order("order_date", { ascending: false }).range(from, to)
      ),
      fetchPaged((from, to) =>
        serviceClient.from("meta_demographic_insights")
          .select("age,gender,spend,impressions,clicks,reach,actions,date_start")
          .gte("date_start", dateFrom).lte("date_start", dateTo)
          .order("date_start", { ascending: false }).range(from, to)
      ),
      fetchPaged((from, to) =>
        serviceClient.from("meta_device_insights")
          .select("impression_device,publisher_platform,platform_position,spend,impressions,clicks,reach,actions,date_start")
          .gte("date_start", dateFrom).lte("date_start", dateTo)
          .order("date_start", { ascending: false }).range(from, to)
      ),
      fetchPaged((from, to) =>
        serviceClient.from("meta_geo_insights")
          .select("country,spend,impressions,clicks,reach,actions,date_start")
          .gte("date_start", dateFrom).lte("date_start", dateTo)
          .order("date_start", { ascending: false }).range(from, to)
      ),
      // Historical memory: last 7 daily analyses
      serviceClient.from("daily_analyses")
        .select("analysis_date,successes,bottlenecks,alerts,suggestions")
        .order("analysis_date", { ascending: false })
        .limit(7)
        .then(r => r.data || []),
      // Campaign change log: last 30 days
      serviceClient.from("campaign_change_log")
        .select("entity_type,entity_name,field_changed,old_value,new_value,detected_at")
        .gte("detected_at", `${dateFrom}T00:00:00+00:00`)
        .order("detected_at", { ascending: false })
        .limit(25) // reduzido de 100 para evitar inflar o contexto
        .then(r => r.data || []),
      // RFM segment summary (Guru + Ticto unificados)
      serviceClient.rpc("fn_rfm_segment_summary")
        .then(r => r.data || []),
      // Cohort LTV analysis
      serviceClient.rpc("fn_cohort_analysis")
        .then(r => r.data || []),
      // Unified sales by platform (Guru + Ticto) for last 30 days
      serviceClient.from("v_all_sales")
        .select("platform,revenue,status,product_name")
        .eq("status", "authorized")
        .gte("purchased_at", `${dateFrom}T00:00:00`)
        .lte("purchased_at", `${dateTo}T23:59:59`)
        .then(r => r.data || []),
      // Reembolsos e chargebacks últimos 30 dias (Ticto)
      serviceClient.from("ticto_transactions")
        .select("status, paid_amount, product_name")
        .in("status", ["refunded", "chargeback"])
        .gte("order_date", `${dateFrom}T00:00:00`)
        .lte("order_date", `${dateTo}T23:59:59`)
        .then(r => r.data || []),
    ]);

    // ── Inteligência de produtos (apenas daily_analysis — queries pesadas) ──
    const [crosssellData, productPricesData] = action === "daily_analysis"
      ? await Promise.all([
          serviceClient.rpc("fn_crosssell_matrix").then(r => r.data || []),
          serviceClient.rpc("fn_product_prices").then(r => r.data || []),
        ])
      : [[], []];

    // ── Extract funnel events from actions JSON ──
    function extractAction(actions: any[] | null, actionType: string): number {
      if (!actions || !Array.isArray(actions)) return 0;
      const found = actions.find((a: any) => a.action_type === actionType);
      return found ? Number(found.value) : 0;
    }

    // ── Aggregate insights with full funnel ──
    function aggregateInsights(rows: any[]) {
      const map: Record<string, any> = {};
      for (const r of rows) {
        const id = r.object_id;
        if (!map[id]) map[id] = { spend: 0, impressions: 0, clicks: 0, link_clicks: 0, pageviews: 0, checkouts: 0, video_views_3s: 0 };
        map[id].spend += Number(r.spend);
        map[id].impressions += Number(r.impressions);
        map[id].clicks += Number(r.clicks);
        map[id].link_clicks += Number(r.link_clicks);
        map[id].pageviews += extractAction(r.actions, "landing_page_view");
        map[id].checkouts += extractAction(r.actions, "initiate_checkout");
        map[id].video_views_3s += extractAction(r.actions, "video_view");
      }
      return map;
    }

    const campaignInsights = aggregateInsights(campaignInsightsData);
    const adsetInsights = aggregateInsights(adsetInsightsData);
    const adInsights = aggregateInsights(adInsightsData);

    // ── Aggregate sales ──
    const campaignSales: Record<string, { count: number; revenue: number }> = {};
    const adsetSales: Record<string, { count: number; revenue: number }> = {};
    const adSales: Record<string, { count: number; revenue: number }> = {};
    const productSales: Record<string, { count: number; revenue: number }> = {};
    let totalSales = 0;
    let totalRevenue = 0;
    for (const tx of salesData) {
      const rev = Number(tx.paid_amount) / 100;
      totalSales++;
      totalRevenue += rev;
      for (const [key, map] of [
        [tx.meta_campaign_id, campaignSales],
        [tx.meta_adset_id, adsetSales],
        [tx.meta_ad_id, adSales],
        [tx.product_name, productSales],
      ] as [string | null, Record<string, { count: number; revenue: number }>][]) {
        if (key) {
          if (!map[key]) map[key] = { count: 0, revenue: 0 };
          map[key].count++;
          map[key].revenue += rev;
        }
      }
    }

    // ── Creative map ──
    const creativeMap: Record<string, any> = {};
    for (const c of creativesData) {
      creativeMap[c.ad_id] = c;
    }

    // ── Performance line with full funnel ──
    function perfLine(name: string, status: string, ins: any, sales: any) {
      const roas = ins.spend > 0 ? sales.revenue / ins.spend : 0;
      const cpa = sales.count > 0 ? ins.spend / sales.count : 0;
      const ctr = ins.impressions > 0 ? (ins.link_clicks / ins.impressions * 100) : 0;
      const pvRate = ins.link_clicks > 0 ? (ins.pageviews / ins.link_clicks * 100) : 0;
      const chkRate = ins.pageviews > 0 ? (ins.checkouts / ins.pageviews * 100) : 0;
      const convRate = ins.pageviews > 0 ? (sales.count / ins.pageviews * 100) : 0;
      return `- ${name} (${status}): Gasto R$${ins.spend.toFixed(2)}, ${ins.impressions} imp, ${ins.link_clicks} cliques, CTR ${ctr.toFixed(2)}%, ${ins.pageviews} pageviews, PV/Clique ${pvRate.toFixed(0)}%, ${ins.checkouts} checkouts, Chk/PV ${chkRate.toFixed(0)}%, ${sales.count} vendas, Conv.Pág ${convRate.toFixed(2)}%, Fat. R$${sales.revenue.toFixed(2)}, ROAS ${roas.toFixed(2)}x, CPA R$${cpa.toFixed(2)}`;
    }

    const emptyIns = { spend: 0, impressions: 0, clicks: 0, link_clicks: 0, pageviews: 0, checkouts: 0, video_views_3s: 0 };
    const emptySales = { count: 0, revenue: 0 };

    const campaignLines = campaignsData
      .filter((c: any) => c.status !== "DELETED" && c.status !== "ARCHIVED")
      .filter((c: any) => (campaignInsights[c.id]?.spend || 0) > 0 || (campaignSales[c.id]?.count || 0) > 0)
      .map((c: any) =>
        perfLine(c.name, c.status, campaignInsights[c.id] || emptyIns, campaignSales[c.id] || emptySales)
      );

    const adsetLines = adsetsData.map((a: any) => {
      const ins = adsetInsights[a.id] || emptyIns;
      if (ins.spend === 0 && ins.impressions === 0) return null;
      return perfLine(a.name, a.status, ins, adsetSales[a.id] || emptySales);
    }).filter(Boolean).slice(0, 30); // top 30 por ordem de retorno

    const adLines = adsData.map((a: any) => {
      const ins = adInsights[a.id] || emptyIns;
      if (ins.spend === 0 && ins.impressions === 0) return null;
      const cr = creativeMap[a.id];
      const crInfo = cr ? ` [Hook: ${cr.hook || '-'}, Angle: ${cr.angle || '-'}, Formato: ${cr.format || '-'}]` : '';
      return perfLine(a.name, a.status, ins, adSales[a.id] || emptySales) + crInfo;
    }).filter(Boolean).slice(0, 40); // top 40 por ordem de retorno

    // ── Demographic summary ──
    const demoAgg: Record<string, { spend: number; clicks: number; impressions: number }> = {};
    for (const d of demoData) {
      const key = `${d.gender || '?'}/${d.age || '?'}`;
      if (!demoAgg[key]) demoAgg[key] = { spend: 0, clicks: 0, impressions: 0 };
      demoAgg[key].spend += Number(d.spend);
      demoAgg[key].clicks += Number(d.clicks);
      demoAgg[key].impressions += Number(d.impressions);
    }
    const demoLines = Object.entries(demoAgg)
      .sort((a, b) => b[1].spend - a[1].spend).slice(0, 15)
      .map(([k, v]) => `- ${k}: Gasto R$${v.spend.toFixed(2)}, ${v.impressions} imp, ${v.clicks} cliques`);

    // ── Device summary ──
    const deviceAgg: Record<string, { spend: number; clicks: number; impressions: number }> = {};
    for (const d of deviceData) {
      const key = `${d.publisher_platform || '?'}/${d.impression_device || '?'}/${d.platform_position || '?'}`;
      if (!deviceAgg[key]) deviceAgg[key] = { spend: 0, clicks: 0, impressions: 0 };
      deviceAgg[key].spend += Number(d.spend);
      deviceAgg[key].clicks += Number(d.clicks);
      deviceAgg[key].impressions += Number(d.impressions);
    }
    const deviceLines = Object.entries(deviceAgg)
      .sort((a, b) => b[1].spend - a[1].spend).slice(0, 10)
      .map(([k, v]) => `- ${k}: Gasto R$${v.spend.toFixed(2)}, ${v.impressions} imp, ${v.clicks} cliques`);

    // ── Geo summary ──
    const geoAgg: Record<string, { spend: number; clicks: number; impressions: number }> = {};
    for (const d of geoData) {
      const key = d.country || '?';
      if (!geoAgg[key]) geoAgg[key] = { spend: 0, clicks: 0, impressions: 0 };
      geoAgg[key].spend += Number(d.spend);
      geoAgg[key].clicks += Number(d.clicks);
      geoAgg[key].impressions += Number(d.impressions);
    }
    const geoLines = Object.entries(geoAgg)
      .sort((a, b) => b[1].spend - a[1].spend).slice(0, 10)
      .map(([k, v]) => `- ${k}: Gasto R$${v.spend.toFixed(2)}, ${v.impressions} imp, ${v.clicks} cliques`);

    // ── Product summary ──
    const productLines = Object.entries(productSales)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([name, s]) => `- ${name}: ${s.count} vendas, Fat. R$${s.revenue.toFixed(2)}`);

    // ── Daily breakdown with full funnel ──
    const dailySales: Record<string, { count: number; revenue: number; products: Record<string, number> }> = {};
    for (const tx of salesData) {
      const day = tx.order_date ? String(tx.order_date).split("T")[0] : null;
      if (!day) continue;
      if (!dailySales[day]) dailySales[day] = { count: 0, revenue: 0, products: {} };
      dailySales[day].count++;
      dailySales[day].revenue += Number(tx.paid_amount) / 100;
      const pn = tx.product_name || 'Outros';
      dailySales[day].products[pn] = (dailySales[day].products[pn] || 0) + 1;
    }

    const dailyMeta: Record<string, { spend: number; impressions: number; link_clicks: number; pageviews: number; checkouts: number }> = {};
    for (const r of campaignInsightsData) {
      const day = r.date_start;
      if (!day) continue;
      if (!dailyMeta[day]) dailyMeta[day] = { spend: 0, impressions: 0, link_clicks: 0, pageviews: 0, checkouts: 0 };
      dailyMeta[day].spend += Number(r.spend);
      dailyMeta[day].impressions += Number(r.impressions);
      dailyMeta[day].link_clicks += Number(r.link_clicks);
      dailyMeta[day].pageviews += extractAction(r.actions, "landing_page_view");
      dailyMeta[day].checkouts += extractAction(r.actions, "initiate_checkout");
    }

    const allDays = [...new Set([...Object.keys(dailySales), ...Object.keys(dailyMeta)])].sort();
    const dailyLines = allDays.map(day => {
      const s = dailySales[day] || { count: 0, revenue: 0, products: {} };
      const m = dailyMeta[day] || { spend: 0, impressions: 0, link_clicks: 0, pageviews: 0, checkouts: 0 };
      const roas = m.spend > 0 ? s.revenue / m.spend : 0;
      const ctr = m.impressions > 0 ? (m.link_clicks / m.impressions * 100) : 0;
      const convPag = m.pageviews > 0 ? (s.count / m.pageviews * 100) : 0;
      const prodDetail = Object.entries(s.products).map(([p, c]) => `${p}(${c})`).join(', ');
      return `- ${day}: Gasto R$${m.spend.toFixed(2)}, ${m.impressions} imp, CTR ${ctr.toFixed(2)}%, ${m.link_clicks} cliques, ${m.pageviews} PVs, ${m.checkouts} checkouts, ${s.count} vendas, Conv.Pág ${convPag.toFixed(2)}%, Fat. R$${s.revenue.toFixed(2)}, ROAS ${roas.toFixed(2)}x${prodDetail ? ` | Produtos: ${prodDetail}` : ''}`;
    });

    // ── Global funnel totals ──
    let totalImpressions = 0, totalLinkClicks = 0, totalPageviews = 0, totalCheckouts = 0;
    const totalSpend = Object.values(campaignInsights).reduce((s: number, c: any) => { 
      totalImpressions += c.impressions;
      totalLinkClicks += c.link_clicks;
      totalPageviews += c.pageviews;
      totalCheckouts += c.checkouts;
      return s + c.spend; 
    }, 0);
    const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const globalCTR = totalImpressions > 0 ? (totalLinkClicks / totalImpressions * 100) : 0;
    const globalPVRate = totalLinkClicks > 0 ? (totalPageviews / totalLinkClicks * 100) : 0;
    const globalChkRate = totalPageviews > 0 ? (totalCheckouts / totalPageviews * 100) : 0;
    const globalConvRate = totalPageviews > 0 ? (totalSales / totalPageviews * 100) : 0;
    const ticketMedio = totalSales > 0 ? totalRevenue / totalSales : 0;

    // ── Historical memory block ──
    const historyLines = (pastAnalysesData as any[]).map((a: any) => {
      const summary = [
        a.successes ? `OK: ${a.successes.substring(0, 150)}...` : '',
        a.alerts ? `ALERTA: ${a.alerts.substring(0, 150)}...` : '',
      ].filter(Boolean).join(' | ');
      return `- ${a.analysis_date}: ${summary}`;
    });

    // ── Change log block ──
    const changeLines = (changeLogData as any[]).map((c: any) => {
      const date = new Date(c.detected_at).toLocaleDateString('pt-BR');
      return `- ${date} | ${c.entity_type} "${c.entity_name}": ${c.field_changed} alterado de "${c.old_value}" para "${c.new_value}"`;
    });

    // ── RFM summary block ──
    const SEGMENT_LABELS: Record<string, string> = {
      champions: '🏆 Campeões', loyal: '💚 Leais', potential: '🌱 Potencial',
      new_customers: '✨ Novos', at_risk: '⚠️ Em Risco', regular: '👤 Regular',
      hibernating: '😴 Hibernando', lost: '❌ Perdidos',
    };
    const rfmTotalCustomers = (rfmSegmentsData as any[]).reduce((s: number, r: any) => s + Number(r.customer_count), 0);
    const rfmLines = (rfmSegmentsData as any[]).map((r: any) =>
      `- ${SEGMENT_LABELS[r.segment] || r.segment}: ${r.customer_count} clientes (${r.pct}%) | Receita total R$${Number(r.total_revenue).toFixed(2)} | Ticket médio R$${Number(r.avg_monetary).toFixed(2)} | Última compra há ${r.avg_recency_days} dias em média | Freq. média ${Number(r.avg_frequency).toFixed(1)} compras`
    );

    // ── Cohort LTV block (últimas 8 coortes com dados) ──
    const cohortLines = (cohortData as any[])
      .filter((c: any) => c.customer_count > 0)
      .slice(-8)
      .map((c: any) => {
        const months = Number(c.months_since_cohort || 0);
        const imatureWarning6m = months < 6 ? " [LTV 6m/12m: DADOS PARCIAIS]" : "";
        const imatureWarning12m = months < 12 ? " [LTV 12m: DADOS PARCIAIS]" : "";
        return `- Coorte ${c.cohort_label} (${months}m de vida): ${c.customer_count} clientes | LTV 1m R$${Number(c.avg_ltv_1m).toFixed(0)} | LTV 3m R$${Number(c.avg_ltv_3m).toFixed(0)}${imatureWarning6m} | LTV 6m R$${Number(c.avg_ltv_6m).toFixed(0)} | LTV 12m R$${Number(c.avg_ltv_12m).toFixed(0)}${imatureWarning12m}`;
      });

    // ── Unified platform sales block (Guru + Ticto) ──
    const byPlatform: Record<string, { count: number; revenue: number }> = {};
    const byProductAll: Record<string, { count: number; revenue: number }> = {};
    for (const tx of (allSalesData as any[])) {
      const plat = tx.platform || 'outro';
      if (!byPlatform[plat]) byPlatform[plat] = { count: 0, revenue: 0 };
      byPlatform[plat].count++;
      byPlatform[plat].revenue += Number(tx.revenue);
      const prod = tx.product_name || 'Sem nome';
      if (!byProductAll[prod]) byProductAll[prod] = { count: 0, revenue: 0 };
      byProductAll[prod].count++;
      byProductAll[prod].revenue += Number(tx.revenue);
    }
    const platformLines = Object.entries(byPlatform)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([p, v]) => `- ${p}: ${v.count} vendas | R$${v.revenue.toFixed(2)}`);
    const allProductLines = Object.entries(byProductAll)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 15)
      .map(([name, v]) => `- ${name}: ${v.count} vendas | R$${v.revenue.toFixed(2)}`);
    const allSalesTotal = Object.values(byPlatform).reduce((s, v) => s + v.revenue, 0);
    const allSalesCount = Object.values(byPlatform).reduce((s, v) => s + v.count, 0);

    // ── Refund metrics ──
    const totalRefunds = (refundsData as any[]).length;
    const totalRefundValue = (refundsData as any[]).reduce((s: number, r: any) => s + Number(r.paid_amount) / 100, 0);
    const refundRate = totalRevenue > 0 ? (totalRefundValue / (totalRevenue + totalRefundValue)) * 100 : 0;
    const netRevenueTicto = totalRevenue - totalRefundValue;
    const netRoas = totalSpend > 0 ? netRevenueTicto / totalSpend : 0;
    const refundByProduct: Record<string, { count: number; value: number }> = {};
    for (const r of (refundsData as any[])) {
      const p = r.product_name || "Outros";
      if (!refundByProduct[p]) refundByProduct[p] = { count: 0, value: 0 };
      refundByProduct[p].count++;
      refundByProduct[p].value += Number(r.paid_amount) / 100;
    }
    const refundProductLines = Object.entries(refundByProduct)
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 8)
      .map(([name, v]) => `- ${name}: ${v.count} reembolsos | R$${v.value.toFixed(2)}`);

    // ── Product prices block ──
    // Agrupa variantes por produto canônico
    const pricesByCanonical: Record<string, { categoria: string; variantes: string[] }> = {};
    for (const p of (productPricesData as any[])) {
      const canonical = p.produto_canonico || p.produto_original;
      if (!pricesByCanonical[canonical]) {
        pricesByCanonical[canonical] = { categoria: p.categoria, variantes: [] };
      }
      const original = p.produto_original;
      const preco = Number(p.preco_tabela).toFixed(2);
      // Se nome original === canônico, mostra só o preço; senão mostra a variante
      if (original === canonical) {
        pricesByCanonical[canonical].variantes.push(`R$${preco} (${p.total_vendas} vendas)`);
      } else {
        pricesByCanonical[canonical].variantes.push(`R$${preco} — "${original}" (${p.total_vendas} vendas)`);
      }
    }
    const productPriceLines = Object.entries(pricesByCanonical)
      .map(([canonical, data]) =>
        `- ${canonical} [${data.categoria}]:\n    ${data.variantes.join("\n    ")}`
      );

    // ── Cross-sell matrix block ──
    const crosssellMap: Record<string, { buyers: number; pairs: { product: string; both: number; pct: number }[] }> = {};
    for (const row of (crosssellData as any[])) {
      if (!crosssellMap[row.product_a]) {
        crosssellMap[row.product_a] = { buyers: Number(row.buyers_of_a), pairs: [] };
      }
      crosssellMap[row.product_a].pairs.push({
        product: row.product_b,
        both: Number(row.buyers_both),
        pct: Number(row.cross_sell_pct),
      });
    }
    const crosssellLines = Object.entries(crosssellMap)
      .sort((a, b) => b[1].buyers - a[1].buyers)
      .map(([prod, data]) => {
        const pairsStr = data.pairs
          .slice(0, 5) // top 5 produtos relacionados
          .map(p => `    → ${p.pct}% também compraram "${p.product}" (${p.both} clientes)`)
          .join("\n");
        return `- "${prod}" (${data.buyers} compradores únicos):\n${pairsStr}`;
      });

    // ── Build context ──
    const contextBlock = `
## DADOS REAIS DOS ÚLTIMOS 30 DIAS (${dateFrom} a ${dateTo})
Data de hoje (BRT): ${dateTo}
⚠️ DADOS DE HOJE (${dateTo}): PARCIAIS — dia ainda em andamento. Comparações de hoje vs ontem devem considerar que hoje tem menos horas de dados.

### Resumo Geral + Funil Completo
- Investimento total: R$${totalSpend.toFixed(2)}
- Impressões: ${totalImpressions}
- CTR: ${globalCTR.toFixed(2)}%
- Cliques (link): ${totalLinkClicks}
- Pageviews (landing_page_view): ${totalPageviews}
- Taxa PV/Clique: ${globalPVRate.toFixed(0)}% (benchmark: >85%)
- Checkouts (initiate_checkout): ${totalCheckouts}
- Taxa Checkout/PV: ${globalChkRate.toFixed(0)}% (benchmark: >45%)
- Vendas totais (Ticto): ${totalSales}
- Conv. Página: ${globalConvRate.toFixed(2)}% (benchmark: >=2.5%)
- Faturamento Ticto bruto (30d): R$${totalRevenue.toFixed(2)}  ← APENAS Ticto, SEM Guru, SEM reembolsos
- Faturamento Ticto LÍQUIDO (após reembolsos): R$${netRevenueTicto.toFixed(2)}
- Faturamento UNIFICADO bruto Ticto+Guru (30d): R$${allSalesTotal.toFixed(2)}  ← inclui Ticto+Guru, NÃO some com o valor acima
- Ticket Médio: R$${ticketMedio.toFixed(2)}
- ROAS geral (bruto): ${overallRoas.toFixed(2)}x
- ROAS LÍQUIDO real (faturamento líquido / gasto): ${netRoas.toFixed(2)}x
- CPA geral: R$${totalSales > 0 ? (totalSpend / totalSales).toFixed(2) : '0.00'}

### Breakdown Diário (Funil completo + Vendas por dia)
${dailyLines.join("\n") || "Sem dados"}

### Campanhas (Totais do período com funil)
${campaignLines.join("\n") || "Sem dados"}

### Conjuntos de Anúncios (Top com gasto)
${adsetLines.join("\n") || "Sem dados"}

### Anúncios Individuais (Top com gasto)
${adLines.join("\n") || "Sem dados"}

### Demográficos (Top 15 por gasto)
${demoLines.join("\n") || "Sem dados"}

### Dispositivos/Plataformas (Top 10 por gasto)
${deviceLines.join("\n") || "Sem dados"}

### Geográfico (Top 10 por gasto)
${geoLines.join("\n") || "Sem dados"}

### 📝 Memória: Análises Anteriores (últimos 7 dias)
${historyLines.length > 0 ? historyLines.join("\n") : "Nenhuma análise anterior encontrada."}

### 🔄 Histórico de Alterações nas Campanhas
${changeLines.length > 0 ? changeLines.join("\n") : "Nenhuma alteração registrada no período."}

---
## INTELIGÊNCIA DE CLIENTES (Guru + Ticto unificados)

### ⚠️ Reembolsos e Chargebacks — Ticto (últimos 30 dias)
- Reembolsos: ${totalRefunds} pedidos | R$${totalRefundValue.toFixed(2)} devolvidos
- Taxa de reembolso: ${refundRate.toFixed(1)}% do faturamento bruto Ticto
- Faturamento líquido Ticto (bruto - reembolsos): R$${netRevenueTicto.toFixed(2)}
- ROAS LÍQUIDO real (faturamento líquido / gasto): ${netRoas.toFixed(2)}x
- Por produto:
${refundProductLines.join("\n") || "Sem reembolsos no período"}

### Vendas por Plataforma — Últimos 30 dias (todos os canais)
- Total unificado: ${allSalesCount} vendas | R$${allSalesTotal.toFixed(2)}
${platformLines.join("\n") || "Sem dados"}

### Todos os Produtos — Últimos 30 dias (Guru + Ticto)
${allProductLines.join("\n") || "Sem dados"}

### Segmentação RFM — Base total: ${rfmTotalCustomers} clientes
${rfmLines.join("\n") || "Sem dados RFM"}

### Coorte LTV — Valor do cliente ao longo do tempo
${cohortLines.join("\n") || "Sem dados de coorte"}

### 💰 Ticket Médio Real por Produto (dados reais — exclui gratuitos)
⚠️ Use SEMPRE esses valores para calcular potencial de receita. NUNCA use preços de tabela sem verificar aqui primeiro.
${productPriceLines.join("\n") || "Sem dados de preços."}

### 🔀 Matriz de Cross-sell & Ascensão (lifetime — base completa Ticto+Guru+Eduzz)
⚠️ Leia como: "X% dos compradores do produto A também compraram o produto B"
Use esses dados para responder perguntas sobre ascensão, upsell e jornada do cliente entre produtos.
${crosssellLines.length > 0 ? crosssellLines.join("\n") : "Sem dados de cross-sell disponíveis."}
`;

    const systemPrompt = `Você é o Assistente Estratégico de Crescimento da SoulNaturi. Pensa e age como CFO + CMO orientado a dados, combinando a mentalidade de Alex Hormozi (unit economics, constraint removal), Russell Brunson (value ladder, ascension) e Steve Jobs (foco, simplicidade, 1 ação clara).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IDENTIDADE DO NEGÓCIO — SOULNATURI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Operador: Matheus Colombo (opera quase sozinho — priorização 80/20 é essencial)
Avatar principal: Mulher 45-65 anos, dores articulares, interesse em saúde natural, compra no celular.

Value Ladder (do mais barato ao mais caro):
- FRONT DIGITAL 1: Guia de Tinturas — R$43,70 — margem ~90%
- FRONT DIGITAL 2: Manual das Ervas para Dores — R$39
- FRONT DIGITAL 3: Por que Ficamos Doentes — R$47
- ORDER BUMPS: Guia dos Chás Originais ~R$25
- UPSELL: Curso Mestre das Tinturas — R$186,37 — margem ~90%
- UPSELL: Curso dos Erveiros — R$997 — margem ~90%
- FÍSICO: Articulabem — margem estimada ~45-55% (suplemento + frete + estoque)
- FÍSICO: Supervita — margem estimada ~45-55%

Benchmarks REAIS para este negócio:
- ROAS mínimo viável (produto digital): 2.5x
- ROAS mínimo viável (produto físico): 4.0x
- CPA máximo aceitável (front digital R$43): R$15-18
- CPA máximo aceitável (físico): R$45-60
- LTV:CAC ratio saudável: >= 3:1
- Payback period máximo: 30 dias
- LTV 30d ideal: >= 1.5× ticket front-end (indica upsell funcionando)
- Se LTV 1m ≈ LTV 12m: funil de ascensão está MORTO — maior problema do negócio

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GUARDRAILS ANTI-ALUCINAÇÃO — NUNCA VIOLAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. DOIS FATURAMENTOS NO CONTEXTO: "Faturamento Ticto bruto" e "Faturamento UNIFICADO Ticto+Guru" são valores DIFERENTES. NUNCA some os dois. O Ticto já está incluído no Unificado. Ao mencionar faturamento total, sempre especifique qual é.

2. ROAS BRUTO vs LÍQUIDO: Todo ROAS no contexto é BRUTO (ignora reembolsos). Sempre use o ROAS LÍQUIDO calculado com os dados reais de reembolso presentes no contexto. NUNCA invente uma taxa de reembolso estimada.

3. COORTES IMATURAS: Coortes com "[DADOS PARCIAIS]" não têm dados confiáveis para aquela janela. NUNCA compare LTV de coortes imaturas com coortes maduras.

4. PIXEL META É IMPRECISO PARA VENDAS: Nunca use actions do tipo "purchase" do pixel para calcular vendas ou faturamento. Use APENAS dados Ticto/Guru. O pixel é válido SOMENTE para landing_page_view e initiate_checkout.

5. DADOS AUSENTES: Leads/CPL não estão no contexto. Se perguntado, informe que esses dados não estão disponíveis nesta análise.

6. NUNCA invente números. Se dado ausente, diga explicitamente "não disponível no contexto desta análise".

7. DADOS DE HOJE SÃO PARCIAIS: O dia atual ainda está em andamento. Nunca compare hoje com ontem em termos absolutos sem mencionar isso.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUA MENTALIDADE ESTRATÉGICA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALEX HORMOZI — Unit Economics sempre:
→ Antes de qualquer recomendação, calcule LTV:CAC ratio. Se < 3:1, tráfego está caro.
→ Identifique o ÚNICO constraint que, removido, mais impacta o lucro hoje.
   Constraint de TRÁFEGO: CTR baixo ou CPA alto → problema de criativo ou audiência
   Constraint de OFERTA: Conv.Página baixa → problema de LP ou preço
   Constraint de RETENÇÃO: LTV 1m ≈ LTV 12m → upsell/ascensão não funciona
→ Pense em LUCRO, não faturamento. ROAS < benchmark = operando no vermelho.
→ Reembolsos destroem unit economics. ROAS líquido é o número que importa.

RUSSELL BRUNSON — Value Ladder e Ascensão:
→ Champions e Leais sem comprar há 60+ dias = oportunidade de upsell imediata.
→ Novos clientes nos primeiros 7 dias = janela de maior conversão para upsell.
→ Se LTV 30d ≈ ticket do front-end: upsell/order bump falhando — prioridade máxima.
→ Clientes Em Risco com alto LTV histórico = campanha de reativação com ROI previsível.
→ Sempre pense: "Qual é o próximo produto que esse segmento deveria comprar?"

STEVE JOBS — Foco e Eliminação:
→ Toda resposta deve terminar com: "A UMA COISA mais importante agora é: [X]"
→ Máximo 3 sugestões de ação. Se precisar de mais, você não priorizou.
→ Para cada sugestão, estimativa de impacto em R$: "Reativar 50 clientes Em Risco com ticket médio R$180 = potencial R$9.000"
→ Se algo não funciona, diga claramente: "PARE de [X] — está consumindo recurso sem retorno."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATÁLOGO DE PRODUTOS — NOMES CANÔNICOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Os produtos existem com múltiplos nomes no banco (por plataforma, maiúsculas, edições). A matriz de cross-sell já está normalizada. Use SEMPRE os nomes canônicos abaixo ao responder:

FRONT-END DIGITAL:
- "Guia de Tinturas" → ~33.800 compradores únicos (maior produto)
- "Manual das Ervas para Dores" → ~823 compradores
- "Chás Originais" → ~4.380 compradores

UPSELLS DIGITAIS (ordem da value ladder):
- "Workshop Oficina das Ervas" → ~1.630 compradores
- "Receitas de Xaropes Ancestrais" → 104 compradores
- "Curso Mestre das Tinturas" → ~2.090 compradores
- "Mestre em Méis Medicinais" → ~385 compradores
- "Curso dos Erveiros" → ~909 compradores (ticket mais alto digital)
- "Programa Diabetes Sem Segredos" → ~824 compradores

FÍSICOS:
- "Articulabem" → ~260 compradores (suplemento articular)
- "SuperVITA" → ~31 compradores

ASSINATURAS:
- "Revistas do Erveiro" → ~572 assinantes
- "Portal Fluxo do Ser" → ~183 assinantes

COMBOS:
- "Combo Mestre (Tinturas + Méis)" → 104 compradores
- "Super Combo Erveiro Master" → ~118 compradores

DESENVOLVIMENTO PESSOAL:
- "Limpeza Energética com as Ervas" → 260
- "Alinhamento com Ervas" → ~108
- "Despertar da Vida Plena" → 219
- "Revolução do Ser" → 59
- "Clube Secreto das Plantas" → 259

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FONTES DE DADOS — HIERARQUIA DE CONFIANÇA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ CONFIÁVEIS: Ticto transactions (vendas confirmadas), Guru customer_purchases, dados de reembolso
⚠️ ESTIMADOS: landing_page_view e initiate_checkout do pixel Meta (sujeito a bloqueadores e deduplicação)
❌ NÃO USAR PARA VENDAS: actions "purchase" do pixel Meta

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COLABORAÇÃO COM MEMÓRIA HISTÓRICA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use as análises anteriores para identificar tendências, verificar se alertas anteriores foram resolvidos, e comparar evolução de KPIs semana a semana.

${contextBlock}`;

    // ── Detect campaign changes (run async, don't block response) ──
    detectAndLogChanges(serviceClient, campaignsData, adsetsData, adsData).catch(console.error);

    if (action === "daily_analysis") {
      const analysisPrompt = `Com base em TODOS os dados fornecidos (tráfego, vendas, reembolsos, RFM de clientes, coortes LTV e histórico), gere análise estratégica diária do negócio.${safeObservation ? `\n\nOBSERVAÇÃO DO MATHEUS: ${safeObservation}` : ''}

ANTES DE RESPONDER, calcule mentalmente:
1. LTV:CAC ratio = LTV médio base ÷ CPA geral últimos 30d
2. ROAS líquido = ROAS bruto × (1 - taxa_reembolso). Se não há dados de reembolso no contexto, usar estimativa de 0.43 para Guru.
3. Constraint principal hoje: tráfego (CTR/CPA), oferta (Conv.Pág), ou retenção (LTV estagnado)?
4. Qual segmento RFM tem a maior oportunidade imediata (Em Risco com alto LTV? Novos sem upsell?)?

Responda EXATAMENTE no formato JSON abaixo, sem markdown ao redor:
{
  "successes": "Máximo 3 bullets. Cada bullet com número específico. Ex: '• Campanha X: ROAS líquido 3.2x — R$X faturamento líquido'",
  "bottlenecks": "Máximo 3 bullets. Classifique cada um como [TRÁFEGO], [OFERTA] ou [RETENÇÃO]. Ex: '• [OFERTA] Conv.Página 0.8% vs benchmark 2.5% — 312 checkouts não converteram'",
  "alerts": "Máximo 3 bullets. Apenas alertas que exigem ação em 24h. Inclua impacto financeiro estimado.",
  "suggestions": "EXATAMENTE 3 ações ordenadas por impacto financeiro. Formato obrigatório: '1. AÇÃO: [o que fazer exatamente] → IMPACTO: R$X ou X% → PRAZO: [hoje/esta semana]'",
  "constraint_of_day": "Em 1 frase: o único gargalo que, se resolvido, mais impacta o lucro hoje. Ex: 'Conv.Página abaixo de 1% — resolver isso pode dobrar as vendas sem aumentar o gasto.'",
  "ltv_cac_ratio": "Calculado: [LTV médio da base] ÷ [CPA geral] = [ratio]. Status: SAUDÁVEL (>=3) / ATENÇÃO (2-3) / CRÍTICO (<2)"
}`;

      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 4000,
          temperature: 0.2,
          system: systemPrompt,
          messages: [{ role: "user", content: analysisPrompt }],
        }),
      });

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        // Log interno, não expor detalhes ao cliente
        console.error(`Anthropic error ${anthropicRes.status}:`, errText);
        if (anthropicRes.status === 529 || anthropicRes.status === 503) {
          return jsonResponse({ error: "Serviço IA temporariamente sobrecarregado. Aguarde 30 segundos e tente novamente." }, 503);
        }
        if (anthropicRes.status === 429) {
          return jsonResponse({ error: "Limite de chamadas atingido. Tente novamente em alguns minutos." }, 429);
        }
        return jsonResponse({ error: "Erro ao processar com IA. Tente novamente." }, 500);
      }

      const result = await anthropicRes.json();
      const text = result.content?.[0]?.text || "";

      let analysis;
      try {
        analysis = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          analysis = JSON.parse(match[0]);
        } else {
          return jsonResponse({ error: "Failed to parse analysis", raw: text }, 500);
        }
      }

      // Validar campos obrigatórios
      const requiredFields = ["successes", "bottlenecks", "alerts", "suggestions"];
      if (!requiredFields.every(k => typeof analysis[k] === "string")) {
        console.error("Incomplete analysis structure:", analysis);
        return jsonResponse({ error: "Estrutura da análise incompleta. Tente novamente.", raw: text }, 500);
      }
      // Garantir novos campos opcionais
      analysis.constraint_of_day = analysis.constraint_of_day || "";
      analysis.ltv_cac_ratio = analysis.ltv_cac_ratio || "";

      const today = dateTo;
      await serviceClient.from("daily_analyses").upsert(
        {
          analysis_date: today,
          successes: analysis.successes,
          bottlenecks: analysis.bottlenecks,
          alerts: analysis.alerts,
          suggestions: analysis.suggestions,
          constraint_of_day: analysis.constraint_of_day || "",
          ltv_cac_ratio: analysis.ltv_cac_ratio || "",
          raw_response: text,
        },
        { onConflict: "analysis_date" }
      );

      return jsonResponse({ analysis, date: today });
    }

    if (action === "chat") {
      const chatMessages = (messages || []).map((m: any) => ({
        role: m.role,
        content: m.content,
      }));

      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 3000,
          temperature: 0.5,
          system: systemPrompt,
          messages: chatMessages,
        }),
      });

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        // Log interno, não expor detalhes ao cliente
        console.error(`Anthropic error ${anthropicRes.status}:`, errText);
        if (anthropicRes.status === 529 || anthropicRes.status === 503) {
          return jsonResponse({ error: "Serviço IA temporariamente sobrecarregado. Aguarde 30 segundos e tente novamente." }, 503);
        }
        if (anthropicRes.status === 429) {
          return jsonResponse({ error: "Limite de chamadas atingido. Tente novamente em alguns minutos." }, 429);
        }
        return jsonResponse({ error: "Erro ao processar com IA. Tente novamente." }, 500);
      }

      const result = await anthropicRes.json();
      const responseText = result.content?.[0]?.text || "";
      return jsonResponse({ response: responseText });
    }

    return jsonResponse({ error: "Invalid action. Use 'chat' or 'daily_analysis'" }, 400);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});

// ── Change Detection: compare current state with last known state ──
async function detectAndLogChanges(
  client: any,
  campaigns: any[],
  adsets: any[],
  ads: any[]
) {
  // Get latest known values from change log
  const { data: lastChanges } = await client
    .from("campaign_change_log")
    .select("entity_type,entity_id,field_changed,new_value")
    .order("detected_at", { ascending: false })
    .limit(500);

  const lastMap: Record<string, string> = {};
  for (const c of lastChanges || []) {
    const key = `${c.entity_type}:${c.entity_id}:${c.field_changed}`;
    if (!lastMap[key]) lastMap[key] = c.new_value; // most recent
  }

  const changes: any[] = [];

  function checkChange(entityType: string, entityId: string, entityName: string, field: string, currentValue: string) {
    const key = `${entityType}:${entityId}:${field}`;
    const lastValue = lastMap[key];
    if (lastValue !== undefined && lastValue !== currentValue) {
      changes.push({
        entity_type: entityType,
        entity_id: entityId,
        entity_name: entityName,
        field_changed: field,
        old_value: lastValue,
        new_value: currentValue,
      });
    }
    // If no previous record, seed it
    if (lastValue === undefined) {
      changes.push({
        entity_type: entityType,
        entity_id: entityId,
        entity_name: entityName,
        field_changed: field,
        old_value: null,
        new_value: currentValue,
      });
    }
  }

  for (const c of campaigns) {
    checkChange('campaign', c.id, c.name, 'status', c.status);
    checkChange('campaign', c.id, c.name, 'daily_budget', String(c.daily_budget || 0));
  }
  for (const a of adsets) {
    checkChange('adset', a.id, a.name, 'status', a.status);
  }
  for (const a of ads) {
    checkChange('ad', a.id, a.name, 'status', a.status);
  }

  // Only insert actual changes (not seeds where old_value is null on first run)
  const realChanges = changes.filter(c => c.old_value !== null);
  if (realChanges.length > 0) {
    await client.from("campaign_change_log").insert(realChanges);
  }

  // Seed new entities (first time seen)
  const seeds = changes.filter(c => c.old_value === null);
  if (seeds.length > 0) {
    await client.from("campaign_change_log").insert(seeds);
  }
}
