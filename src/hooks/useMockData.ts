import { useMemo } from 'react';

export interface Campaign {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'error';
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  cpa: number;
  cpc: number;
  cpm: number;
  impressions: number;
  reach: number;
  clicks: number;
  link_clicks: number;
  ctr: number;
  sales: number;
  initiate_checkout: number;
  landing_page_views: number;
  video_views: number;
  leads: number;
  adsets: Adset[];
}

export interface Adset {
  id: string;
  campaign_id: string;
  name: string;
  status: 'active' | 'paused' | 'error';
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  cpa: number;
  cpc: number;
  cpm: number;
  impressions: number;
  reach: number;
  clicks: number;
  link_clicks: number;
  ctr: number;
  sales: number;
  initiate_checkout: number;
  landing_page_views: number;
  video_views: number;
  leads: number;
  ads: Ad[];
}

export interface Ad {
  id: string;
  adset_id: string;
  campaign_id: string;
  name: string;
  status: 'active' | 'paused' | 'error';
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  cpa: number;
  cpc: number;
  cpm: number;
  impressions: number;
  reach: number;
  clicks: number;
  link_clicks: number;
  ctr: number;
  sales: number;
  initiate_checkout: number;
  landing_page_views: number;
  video_views: number;
  leads: number;
  creative?: {
    id?: string;
    name?: string;
    thumbnail_url?: string;
    image_url?: string;
  } | null;
}

export interface Sale {
  id: string;
  date: string;
  product: string;
  value: number;
  platform: string;
  payment_method: string;
  status: 'approved' | 'pending' | 'refunded';
  campaign_name: string;
  adset_name: string;
  ad_name: string;
  attributed: boolean;
}

export interface DailyMetric {
  date: string;
  revenue: number;
  spend: number;
  sales: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
}

export interface KPISummary {
  revenue: number;
  revenueVar: number;
  spend: number;
  spendVar: number;
  roas: number;
  roasVar: number;
  profit: number;
  profitVar: number;
  sales: number;
  salesVar: number;
  cpa: number;
  cpaVar: number;
  ctr: number;
  ctrVar: number;
  impressions: number;
  impressionsVar: number;
}

function generateAds(adsetId: string, campaignId: string, count: number): Ad[] {
  return Array.from({ length: count }, (_, i) => {
    const spend = Math.random() * 80 + 10;
    const sales = Math.floor(Math.random() * 4);
    const revenue = sales * (Math.random() * 60 + 30);
    const impressions = Math.floor(Math.random() * 8000 + 1000);
    const clicks = Math.floor(impressions * (Math.random() * 0.04 + 0.01));
    const link_clicks = Math.floor(clicks * 0.7);
    return {
      id: `ad-${campaignId}-${adsetId}-${i}`,
      adset_id: adsetId,
      campaign_id: campaignId,
      name: `Anúncio ${i + 1} - Criativo ${['Imagem', 'Vídeo', 'Carrossel'][i % 3]}`,
      status: Math.random() > 0.2 ? 'active' : 'paused',
      spend,
      revenue,
      profit: revenue - spend,
      roas: spend > 0 ? revenue / spend : 0,
      cpa: sales > 0 ? spend / sales : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      impressions,
      reach: Math.floor(impressions * 0.85),
      clicks,
      link_clicks,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      sales,
      initiate_checkout: sales + Math.floor(Math.random() * 3),
      landing_page_views: Math.floor(link_clicks * (Math.random() * 0.2 + 0.75)),
      video_views: Math.floor(impressions * (Math.random() * 0.15 + 0.05)),
      leads: Math.floor(Math.random() * 5),
    };
  });
}

function generateAdsets(campaignId: string, count: number): Adset[] {
  return Array.from({ length: count }, (_, i) => {
    const ads = generateAds(`adset-${campaignId}-${i}`, campaignId, 5);
    const spend = ads.reduce((s, a) => s + a.spend, 0);
    const revenue = ads.reduce((s, a) => s + a.revenue, 0);
    const impressions = ads.reduce((s, a) => s + a.impressions, 0);
    const clicks = ads.reduce((s, a) => s + a.clicks, 0);
    const link_clicks = ads.reduce((s, a) => s + a.link_clicks, 0);
    const sales = ads.reduce((s, a) => s + a.sales, 0);
    return {
      id: `adset-${campaignId}-${i}`,
      campaign_id: campaignId,
      name: `Conjunto ${i + 1} - ${['Interesses', 'Lookalike', 'Remarketing'][i % 3]}`,
      status: Math.random() > 0.15 ? 'active' : 'paused',
      spend,
      revenue,
      profit: revenue - spend,
      roas: spend > 0 ? revenue / spend : 0,
      cpa: sales > 0 ? spend / sales : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      impressions,
      reach: Math.floor(impressions * 0.85),
      clicks,
      link_clicks,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      sales,
      initiate_checkout: sales + Math.floor(Math.random() * 5),
      landing_page_views: ads.reduce((s, a) => s + a.landing_page_views, 0),
      video_views: ads.reduce((s, a) => s + a.video_views, 0),
      leads: Math.floor(Math.random() * 8),
      ads,
    };
  });
}

const CAMPAIGN_NAMES = [
  'Camp 226.1 - Guia de Tinturas (Página Cúrcuma 2) - CBO',
  'Camp 226 - Guia de Tinturas (Página Cúrcuma 2) - CBO',
  'Camp 235.1 - Campeões Curcuma',
  'Camp 240 - Remarketing Engajamento',
  'Camp 241 - Lookalike Compradores',
  'Camp 242 - Broad Tinturas',
  'Camp 243 - Retargeting Cart Abandon',
  'Camp 244 - Interesses Saúde Natural',
  'Camp 245 - Video Views Curcuma',
];

const PRODUCTS = [
  'COMO PREPARAR TINTURAS DE ERVAS MEDICINAIS',
  'Curso Mestre das Tinturas',
  'Kit Tintura Iniciante',
];

export function useMockData() {
  return useMemo(() => {
    const campaigns: Campaign[] = CAMPAIGN_NAMES.map((name, i) => {
      const adsets = generateAdsets(String(i), 3);
      const spend = adsets.reduce((s, a) => s + a.spend, 0);
      const revenue = adsets.reduce((s, a) => s + a.revenue, 0);
      const impressions = adsets.reduce((s, a) => s + a.impressions, 0);
      const clicks = adsets.reduce((s, a) => s + a.clicks, 0);
      const link_clicks = adsets.reduce((s, a) => s + a.link_clicks, 0);
      const sales = adsets.reduce((s, a) => s + a.sales, 0);
      return {
        id: `campaign-${i}`,
        name,
        status: (i < 3 ? 'active' : i < 7 ? 'paused' : 'active') as Campaign['status'],
        spend,
        revenue,
        profit: revenue - spend,
        roas: spend > 0 ? revenue / spend : 0,
        cpa: sales > 0 ? spend / sales : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
        impressions,
        reach: Math.floor(impressions * 0.85),
        clicks,
        link_clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        sales,
        initiate_checkout: sales + Math.floor(Math.random() * 8),
        landing_page_views: adsets.reduce((s, a) => s + a.landing_page_views, 0),
        video_views: adsets.reduce((s, a) => s + a.video_views, 0),
        leads: Math.floor(Math.random() * 12),
        adsets,
      };
    });

    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0);
    const totalSales = campaigns.reduce((s, c) => s + c.sales, 0);
    const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);

    const kpiSummary: KPISummary = {
      revenue: totalRevenue,
      revenueVar: 12.3,
      spend: totalSpend,
      spendVar: 8.5,
      roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      roasVar: 5.2,
      profit: totalRevenue - totalSpend,
      profitVar: -3.1,
      sales: totalSales,
      salesVar: 15.0,
      cpa: totalSales > 0 ? totalSpend / totalSales : 0,
      cpaVar: -7.2,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      ctrVar: 2.1,
      impressions: totalImpressions,
      impressionsVar: 10.5,
    };

    const dailyMetrics: DailyMetric[] = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      return {
        date: d.toISOString().split('T')[0],
        revenue: Math.random() * 400 + 200,
        spend: Math.random() * 300 + 150,
        sales: Math.floor(Math.random() * 8 + 2),
        impressions: Math.floor(Math.random() * 15000 + 5000),
        clicks: Math.floor(Math.random() * 500 + 100),
        link_clicks: Math.floor(Math.random() * 400 + 80),
      };
    });

    const paymentBreakdown = [
      { name: 'Pix', value: 16, color: 'hsl(210, 80%, 55%)' },
      { name: 'Cartão', value: 4, color: 'hsl(152, 60%, 42%)' },
      { name: 'Boleto', value: 0, color: 'hsl(38, 92%, 50%)' },
      { name: 'Outros', value: 0, color: 'hsl(0, 72%, 51%)' },
    ];

    const sales: Sale[] = Array.from({ length: 50 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - Math.floor(Math.random() * 30));
      const camp = campaigns[Math.floor(Math.random() * 3)];
      return {
        id: `sale-${i}`,
        date: d.toISOString(),
        product: PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)],
        value: Math.random() * 80 + 20,
        platform: ['Hotmart', 'Kiwify', 'Guru'][Math.floor(Math.random() * 3)],
        payment_method: ['pix', 'credit_card', 'boleto'][Math.floor(Math.random() * 3)],
        status: (['approved', 'pending', 'refunded'] as const)[Math.floor(Math.random() * 3)],
        campaign_name: camp.name,
        adset_name: camp.adsets[0]?.name || '',
        ad_name: camp.adsets[0]?.ads[0]?.name || '',
        attributed: Math.random() > 0.2,
      };
    });

    return { campaigns, kpiSummary, dailyMetrics, paymentBreakdown, sales };
  }, []);
}
