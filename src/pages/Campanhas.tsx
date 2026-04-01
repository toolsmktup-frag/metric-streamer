import React, { useState, useMemo } from 'react';
import { useMetaCampaigns, useMetaAdsets, useMetaAds } from '@/hooks/useMetaData';
import { useAllSalesAggregation } from '@/hooks/useAllSales';
import PerformanceTable from '@/components/dashboard/PerformanceTable';
import { SkeletonTable } from '@/components/dashboard/SkeletonCard';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import { Search, ArrowLeft, Filter, ShoppingCart, CheckCircle, CreditCard, QrCode, FileText, TrendingDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/formatters';

type View =
  | { level: 'campaigns' }
  | { level: 'adsets'; campaignId: string; campaignName: string }
  | { level: 'ads'; adsetId?: string; adsetName: string; campaignId: string; campaignName: string };

type StatusFilter = 'all' | 'active' | 'paused';
type Tab = 'ads' | 'organic' | 'funil';

function FunnelStageBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-mono-value w-16 text-right">{value.toLocaleString('pt-BR')}</span>
    </div>
  );
}

function detectBottleneck(impressions: number, link_clicks: number, landing_page_views: number, initiate_checkout: number, sales: number): string {
  const drops = [
    { label: 'Clique→LP', drop: link_clicks > 0 ? 1 - landing_page_views / link_clicks : 0 },
    { label: 'LP→Checkout', drop: landing_page_views > 0 ? 1 - initiate_checkout / landing_page_views : 0 },
    { label: 'Checkout→Venda', drop: initiate_checkout > 0 ? 1 - sales / initiate_checkout : 0 },
  ];
  if (drops.every(d => d.drop === 0)) return '—';
  const worst = drops.reduce((a, b) => a.drop > b.drop ? a : b);
  return worst.drop > 0.7 ? `⚠️ ${worst.label}` : worst.label;
}

export default function Campanhas() {
  const { data: campaigns = [], isLoading: loadingCampaigns } = useMetaCampaigns();
  const { data: adsets = [], isLoading: loadingAdsets } = useMetaAdsets();
  const { data: ads = [], isLoading: loadingAds } = useMetaAds();
  const { byCampaign, byAdset, byAd, organicSales, organicTransactions } = useAllSalesAggregation();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>({ level: 'campaigns' });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activeTab, setActiveTab] = useState<Tab>('ads');
  const [selectedCampaign, setSelectedCampaign] = useState<{ id: string; name: string } | null>(null);
  const [selectedAdset, setSelectedAdset] = useState<{ id: string; name: string } | null>(null);

  // Merge Ticto sales data into campaigns/adsets/ads
  const campaignsWithSales = useMemo(() => {
    return campaigns.map(c => {
      const sales = byCampaign[c.id] || { sales_count: 0, revenue: 0, front_sales: 0, front_revenue: 0, bump_sales: 0, bump_revenue: 0, upsell_sales: 0, upsell_revenue: 0, downsell_sales: 0, downsell_revenue: 0 };
      return {
        ...c,
        sales: sales.sales_count,
        revenue: sales.revenue,
        front_sales: sales.front_sales,
        bump_sales: sales.bump_sales,
        upsell_sales: sales.upsell_sales,
        downsell_sales: sales.downsell_sales,
        profit: sales.revenue - c.spend,
        roas: c.spend > 0 ? sales.revenue / c.spend : 0,
        cpa: sales.sales_count > 0 ? c.spend / sales.sales_count : 0,
      };
    });
  }, [campaigns, byCampaign]);

  const adsetsWithSales = useMemo(() => {
    return adsets.map(a => {
      const sales = byAdset[a.id] || { sales_count: 0, revenue: 0, front_sales: 0, front_revenue: 0, bump_sales: 0, bump_revenue: 0, upsell_sales: 0, upsell_revenue: 0, downsell_sales: 0, downsell_revenue: 0 };
      return {
        ...a,
        sales: sales.sales_count,
        revenue: sales.revenue,
        front_sales: sales.front_sales,
        bump_sales: sales.bump_sales,
        upsell_sales: sales.upsell_sales,
        downsell_sales: sales.downsell_sales,
        profit: sales.revenue - a.spend,
        roas: a.spend > 0 ? sales.revenue / a.spend : 0,
        cpa: sales.sales_count > 0 ? a.spend / sales.sales_count : 0,
      };
    });
  }, [adsets, byAdset]);

  const adsWithSales = useMemo(() => {
    return ads.map(a => {
      const sales = byAd[a.id] || { sales_count: 0, revenue: 0, front_sales: 0, front_revenue: 0, bump_sales: 0, bump_revenue: 0, upsell_sales: 0, upsell_revenue: 0, downsell_sales: 0, downsell_revenue: 0 };
      return {
        ...a,
        sales: sales.sales_count,
        revenue: sales.revenue,
        front_sales: sales.front_sales,
        bump_sales: sales.bump_sales,
        upsell_sales: sales.upsell_sales,
        downsell_sales: sales.downsell_sales,
        profit: sales.revenue - a.spend,
        roas: a.spend > 0 ? sales.revenue / a.spend : 0,
        cpa: sales.sales_count > 0 ? a.spend / sales.sales_count : 0,
      };
    });
  }, [ads, byAd]);

  const handleCampaignSelect = (row: any) => {
    setSelectedCampaign({ id: row.id, name: row.name });
    setSelectedAdset(null);
  };

  const handleAdsetSelect = (row: any) => {
    setSelectedAdset({ id: row.id, name: row.name });
  };

  const handleBack = () => {
    if (view.level === 'ads') {
      if (view.adsetId) {
        setView({ level: 'adsets', campaignId: view.campaignId, campaignName: view.campaignName });
      } else {
        // veio direto da campanha, volta para campanhas
        setView({ level: 'campaigns' });
        setSelectedCampaign(null);
        setSelectedAdset(null);
      }
    } else {
      setView({ level: 'campaigns' });
      setSelectedCampaign(null);
      setSelectedAdset(null);
    }
    setSearch('');
  };

  // Aba "Conjuntos" habilitada?
  const canGoToAdsets =
    (view.level === 'campaigns' && !!selectedCampaign) ||
    view.level === 'adsets' ||
    view.level === 'ads';

  // Aba "Anúncios" habilitada?
  const canGoToAds =
    view.level === 'ads' ||
    (view.level === 'adsets' && !!selectedAdset) ||
    (view.level === 'campaigns' && !!selectedCampaign);

  const handleConjuntosClick = () => {
    if (view.level === 'campaigns' && selectedCampaign) {
      setView({ level: 'adsets', campaignId: selectedCampaign.id, campaignName: selectedCampaign.name });
      setSelectedAdset(null);
      setSearch('');
    } else if (view.level === 'ads') {
      setView({ level: 'adsets', campaignId: view.campaignId, campaignName: view.campaignName });
      setSearch('');
    }
  };

  const handleAnunciosClick = () => {
    if (view.level === 'adsets' && selectedAdset) {
      setView({
        level: 'ads',
        adsetId: selectedAdset.id,
        adsetName: selectedAdset.name,
        campaignId: view.campaignId,
        campaignName: view.campaignName,
      });
      setSearch('');
    } else if (view.level === 'campaigns' && selectedCampaign) {
      setView({
        level: 'ads',
        adsetId: undefined,
        adsetName: 'Todos os conjuntos',
        campaignId: selectedCampaign.id,
        campaignName: selectedCampaign.name,
      });
      setSearch('');
    }
  };

  let currentData: any[] = [];
  let currentLevel: 'campaign' | 'adset' | 'ad' = 'campaign';
  let isLoading = false;
  let title = 'Campanhas';
  let subtitle = '';

  if (view.level === 'campaigns') {
    currentData = campaignsWithSales
      .filter(c => statusFilter === 'all' || c.status?.toUpperCase() === statusFilter.toUpperCase())
      .filter(c => c.status === 'active' || c.spend > 0)
      .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));
    currentLevel = 'campaign';
    isLoading = loadingCampaigns;
    title = 'Campanhas';
    const statusLabel = statusFilter === 'all' ? '' : statusFilter === 'active' ? ' ativas' : ' pausadas';
    subtitle = `${currentData.length} campanha${currentData.length !== 1 ? 's' : ''}${statusLabel}`;
  } else if (view.level === 'adsets') {
    currentData = adsetsWithSales
      .filter(a => a.campaign_id === view.campaignId)
      .filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()));
    currentLevel = 'adset';
    isLoading = loadingAdsets;
    title = 'Conjuntos de Anúncios';
    subtitle = view.campaignName;
  } else {
    if (view.adsetId) {
      currentData = adsWithSales.filter(a => a.adset_id === view.adsetId);
    } else {
      const campaignAdsetIds = new Set(adsets.filter(a => a.campaign_id === view.campaignId).map(a => a.id));
      currentData = adsWithSales.filter(a => campaignAdsetIds.has(a.adset_id));
    }
    currentData = currentData.filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()));
    currentLevel = 'ad';
    isLoading = loadingAds;
    title = 'Anúncios';
    subtitle = view.adsetId ? view.adsetName : view.campaignName;
  }

  const breadcrumbs: { label: string; onClick?: () => void }[] = [
    {
      label: 'Campanhas',
      onClick: view.level !== 'campaigns' ? () => { setView({ level: 'campaigns' }); setSelectedCampaign(null); setSelectedAdset(null); setSearch(''); } : undefined,
    },
  ];
  if (view.level === 'adsets' || view.level === 'ads') {
    breadcrumbs.push({
      label: view.campaignName.length > 35 ? view.campaignName.slice(0, 35) + '…' : view.campaignName,
      onClick: view.level === 'ads' && view.adsetId
        ? () => { setView({ level: 'adsets', campaignId: view.campaignId, campaignName: view.campaignName }); setSearch(''); }
        : undefined,
    });
  }
  if (view.level === 'ads' && view.adsetId) {
    breadcrumbs.push({
      label: view.adsetName.length > 35 ? view.adsetName.slice(0, 35) + '…' : view.adsetName,
    });
  }

  // Filter organic transactions for search
  const filteredOrganic = useMemo(() => {
    if (!search) return organicTransactions;
    const s = search.toLowerCase();
    return organicTransactions.filter(t =>
      t.product_name?.toLowerCase().includes(s) ||
      t.customer_name?.toLowerCase().includes(s) ||
      t.customer_email?.toLowerCase().includes(s)
    );
  }, [organicTransactions, search]);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        {view.level !== 'campaigns' && (
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        {breadcrumbs.map((bc, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-muted-foreground">/</span>}
            {bc.onClick ? (
              <button
                onClick={bc.onClick}
                className="text-primary hover:underline font-medium"
              >
                {bc.label}
              </button>
            ) : (
              <span className="text-foreground font-medium">{bc.label}</span>
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <DateRangePicker />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => { setView({ level: 'campaigns' }); setSearch(''); setActiveTab('ads'); setSelectedCampaign(null); setSelectedAdset(null); }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            view.level === 'campaigns' && activeTab === 'ads'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Campanhas
        </button>
        <button
          disabled={!canGoToAdsets}
          onClick={handleConjuntosClick}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            view.level === 'adsets'
              ? 'border-primary text-primary'
              : canGoToAdsets
              ? 'border-transparent text-muted-foreground hover:text-foreground cursor-pointer'
              : 'border-transparent text-muted-foreground/50 cursor-not-allowed'
          }`}
        >
          Conjuntos
        </button>
        <button
          disabled={!canGoToAds || view.level === 'ads'}
          onClick={handleAnunciosClick}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            view.level === 'ads' && activeTab === 'ads'
              ? 'border-primary text-primary'
              : canGoToAds && view.level !== 'ads'
              ? 'border-transparent text-muted-foreground hover:text-foreground cursor-pointer'
              : 'border-transparent text-muted-foreground/50 cursor-not-allowed'
          }`}
        >
          Anúncios
        </button>
        <div className="flex-1" />
        <button
          onClick={() => { setActiveTab('funil'); setView({ level: 'campaigns' }); setSearch(''); }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'funil'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <TrendingDown className="h-4 w-4" />
          Funil
        </button>
        <button
          onClick={() => { setActiveTab('organic'); setView({ level: 'campaigns' }); }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'organic'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          Vendas sem tráfego
          {organicSales.sales_count > 0 && (
            <span className="ml-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-xs font-semibold">
              {organicSales.sales_count}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'ads' ? (
        <>
          {/* Search */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filtrar por nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {view.level === 'campaigns' && (
              <Select defaultValue="all" value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-[160px] bg-card">
                  <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span>{statusFilter === 'all' ? 'Todas' : statusFilter === 'active' ? 'Ativas' : 'Pausadas'}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="active">Ativas</SelectItem>
                  <SelectItem value="paused">Pausadas</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Table with skeleton */}
          {isLoading ? (
            <SkeletonTable />
          ) : currentData.length > 0 ? (
            <PerformanceTable
              data={currentData}
              level={currentLevel}
              onRowSelect={view.level === 'campaigns' ? handleCampaignSelect : view.level === 'adsets' ? handleAdsetSelect : undefined}
              selectedRowId={view.level === 'campaigns' ? selectedCampaign?.id : view.level === 'adsets' ? selectedAdset?.id : undefined}
            />
          ) : (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {view.level === 'campaigns'
                ? 'Nenhuma campanha encontrada.'
                : view.level === 'adsets'
                ? 'Nenhum conjunto encontrado para esta campanha.'
                : 'Nenhum anúncio encontrado para este conjunto.'}
            </div>
          )}
        </>
      ) : activeTab === 'organic' ? (
        // Organic sales tab
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar produto, cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {organicSales.sales_count} venda{organicSales.sales_count !== 1 ? 's' : ''} orgânica{organicSales.sales_count !== 1 ? 's' : ''} · {formatCurrency(organicSales.revenue)}
            </div>
          </div>

          {filteredOrganic.length > 0 ? (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-table-header border-b border-border">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Data</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Produto</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Cliente</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Valor</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Pagamento</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Origem (UTM)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrganic.map((tx) => {
                      const paymentMethods: Record<string, { label: string; icon: any }> = {
                        credit_card: { label: 'Cartão', icon: CreditCard },
                        pix: { label: 'Pix', icon: QrCode },
                        bank_slip: { label: 'Boleto', icon: FileText },
                      };
                      const pm = paymentMethods[tx.payment_method] || { label: tx.payment_method || '-', icon: CreditCard };
                      const PayIcon = pm.icon;

                      return (
                        <tr key={tx.id} className="border-b border-border hover:bg-table-hover transition-colors">
                          <td className="px-3 py-2.5 whitespace-nowrap font-mono-value text-xs">
                            {tx.purchased_at ? new Date(tx.purchased_at).toLocaleDateString('pt-BR') : '-'}
                          </td>
                          <td className="px-3 py-2.5 max-w-[180px] truncate font-medium" title={tx.product_name || ''}>
                            {tx.product_name || tx.offer_name || '-'}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="max-w-[160px]">
                              <div className="truncate font-medium text-xs" title={tx.customer_name || ''}>{tx.customer_name || '-'}</div>
                              <div className="truncate text-xs text-muted-foreground" title={tx.customer_email || ''}>{tx.customer_email || ''}</div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono-value font-semibold">{formatCurrency(tx.revenue)}</td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <PayIcon className="h-3 w-3" />{pm.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs max-w-[220px]">
                            {(() => {
                              const utms = [
                                tx.utm_source,
                                tx.utm_campaign,
                                tx.utm_medium,
                                tx.utm_content,
                              ].filter(Boolean);
                              if (utms.length === 0) return null;
                              return (
                                <div className="flex flex-wrap gap-1">
                                  {tx.utm_source && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium" title={`utm_source: ${tx.utm_source}`}>
                                      {tx.utm_source}
                                    </span>
                                  )}
                                  {tx.utm_campaign && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground" title={`utm_campaign: ${tx.utm_campaign}`}>
                                      {tx.utm_campaign.length > 25 ? tx.utm_campaign.slice(0, 25) + '…' : tx.utm_campaign}
                                    </span>
                                  )}
                                  {tx.utm_medium && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground" title={`utm_medium: ${tx.utm_medium}`}>
                                      {tx.utm_medium.length > 25 ? tx.utm_medium.slice(0, 25) + '…' : tx.utm_medium}
                                    </span>
                                  )}
                                  {tx.utm_content && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground" title={`utm_content: ${tx.utm_content}`}>
                                      {tx.utm_content.length > 20 ? tx.utm_content.slice(0, 20) + '…' : tx.utm_content}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Nenhuma venda orgânica (sem tráfego pago) encontrada no período selecionado.
            </div>
          )}
        </>
      ) : null}

      {activeTab === 'funil' && (
        <>
          {/* Seletor de nível */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Nível:</span>
            {(['campaigns', 'adsets', 'ads'] as const).map((lvl) => {
              const labels = { campaigns: 'Campanhas', adsets: 'Conjuntos', ads: 'Anúncios' };
              const isActive = view.level === lvl;
              return (
                <button
                  key={lvl}
                  onClick={() => {
                    if (lvl === 'campaigns') { setView({ level: 'campaigns' }); setSelectedCampaign(null); setSelectedAdset(null); }
                    else if (lvl === 'adsets' && selectedCampaign) setView({ level: 'adsets', campaignId: selectedCampaign.id, campaignName: selectedCampaign.name });
                    else if (lvl === 'ads' && selectedCampaign) setView({ level: 'ads', adsetId: undefined, adsetName: 'Todos', campaignId: selectedCampaign.id, campaignName: selectedCampaign.name });
                  }}
                  disabled={lvl !== 'campaigns' && !selectedCampaign}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                >
                  {labels[lvl]}
                </button>
              );
            })}
          </div>

          {/* Tabela de funil */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-table-header border-b border-border">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Nome</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase">Impressões</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase min-w-[140px]">
                      Cliques <span className="text-muted-foreground/60 normal-case font-normal">(CTR)</span>
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase min-w-[140px]">
                      LP Views <span className="text-muted-foreground/60 normal-case font-normal">(% cliques)</span>
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase min-w-[140px]">
                      Checkout <span className="text-muted-foreground/60 normal-case font-normal">(% LP)</span>
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase min-w-[140px]">
                      Compras <span className="text-muted-foreground/60 normal-case font-normal">(% CKT)</span>
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Gargalo</th>
                  </tr>
                </thead>
                <tbody>
                  {(currentData.length > 0 ? currentData : []).filter((row: any) => row.impressions > 0).sort((a: any, b: any) => b.impressions - a.impressions).map((row: any) => {
                    const ctr = row.impressions > 0 ? (row.link_clicks / row.impressions) * 100 : 0;
                    const lpPct = row.link_clicks > 0 ? (row.landing_page_views / row.link_clicks) * 100 : 0;
                    const cktPct = row.landing_page_views > 0 ? (row.initiate_checkout / row.landing_page_views) * 100 : 0;
                    const salesPct = row.initiate_checkout > 0 ? (row.sales / row.initiate_checkout) * 100 : 0;
                    const maxVal = row.impressions;
                    const bottleneck = detectBottleneck(row.impressions, row.link_clicks, row.landing_page_views, row.initiate_checkout, row.sales);
                    const isBottleneckBad = bottleneck.startsWith('⚠️');

                    return (
                      <tr key={row.id} className="border-b border-border hover:bg-table-hover transition-colors">
                        <td className="px-3 py-2.5 max-w-[200px]">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${row.status === 'active' ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                            <span className="truncate font-medium text-xs" title={row.name}>{row.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono-value text-xs">
                          {row.impressions.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="space-y-0.5">
                            <FunnelStageBar value={row.link_clicks} max={maxVal} color="hsl(210, 80%, 55%)" />
                            <div className="text-xs text-muted-foreground text-right">{ctr.toFixed(1)}%</div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="space-y-0.5">
                            <FunnelStageBar value={row.landing_page_views} max={maxVal} color="hsl(152, 60%, 42%)" />
                            <div className="text-xs text-muted-foreground text-right">{lpPct.toFixed(1)}%</div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="space-y-0.5">
                            <FunnelStageBar value={row.initiate_checkout} max={maxVal} color="hsl(38, 92%, 50%)" />
                            <div className="text-xs text-muted-foreground text-right">{cktPct.toFixed(1)}%</div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="space-y-0.5">
                            <FunnelStageBar value={row.sales} max={maxVal} color="hsl(280, 60%, 55%)" />
                            <div className="text-xs text-muted-foreground text-right">{salesPct.toFixed(1)}%</div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-medium ${isBottleneckBad ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}`}>
                            {bottleneck}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {currentData.filter((row: any) => row.impressions > 0).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        Sem dados de funil para o período selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-[hsl(210,80%,55%)]" /><span>Cliques</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-[hsl(152,60%,42%)]" /><span>LP Views</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-[hsl(38,92%,50%)]" /><span>Checkout</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-[hsl(280,60%,55%)]" /><span>Compras</span></div>
            <span className="ml-2 text-orange-500">⚠️ = queda &gt;70%</span>
          </div>
        </>
      )}
    </div>
  );
}
