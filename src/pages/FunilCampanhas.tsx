import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useMetaCampaigns, useMetaAdsets, useMetaAds } from '@/hooks/useMetaData';
import { useAllSalesAggregation } from '@/hooks/useAllSales';
import PerformanceTable from '@/components/dashboard/PerformanceTable';
import { SkeletonTable } from '@/components/dashboard/SkeletonCard';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import { Search, ArrowLeft, Filter, ShoppingCart, CreditCard, QrCode, FileText } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/formatters';
import { useFunnel } from '@/hooks/useFunnels';

type View =
  | { level: 'campaigns' }
  | { level: 'adsets'; campaignId: string; campaignName: string }
  | { level: 'ads'; adsetId?: string; adsetName: string; campaignId: string; campaignName: string };

type StatusFilter = 'all' | 'active' | 'paused';
type Tab = 'ads' | 'organic';

export default function FunilCampanhas() {
  const { id } = useParams<{ id: string }>();
  const { data: funnel } = useFunnel(id!);
  const funnelProducts = funnel?.funnel_products || [];

  const { data: campaigns = [], isLoading: loadingCampaigns } = useMetaCampaigns(id);
  const { data: adsets = [], isLoading: loadingAdsets } = useMetaAdsets(id);
  const { data: ads = [], isLoading: loadingAds } = useMetaAds(id);
  const { byCampaign, byAdset, byAd, organicSales, organicTransactions } = useAllSalesAggregation(id, undefined, funnelProducts, true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>({ level: 'campaigns' });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activeTab, setActiveTab] = useState<Tab>('ads');
  const [selectedCampaign, setSelectedCampaign] = useState<{ id: string; name: string } | null>(null);
  const [selectedAdset, setSelectedAdset] = useState<{ id: string; name: string } | null>(null);
  const [organicSourceFilter, setOrganicSourceFilter] = useState<string | null>(null);

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

  const canGoToAdsets =
    (view.level === 'campaigns' && !!selectedCampaign) ||
    view.level === 'adsets' ||
    view.level === 'ads';

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

  const SEM_UTM = 'Sem UTM';
  const organicSourceOf = (t: { utm_source?: string | null }) => (t.utm_source || '').trim() || SEM_UTM;

  // Contagem por origem (utm_source ou "Sem UTM") para os chips de resumo/filtro
  const organicBySource = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    for (const t of organicTransactions) {
      const src = organicSourceOf(t);
      const agg = map.get(src) || { count: 0, revenue: 0 };
      agg.count++;
      agg.revenue += t.revenue || 0;
      map.set(src, agg);
    }
    return Array.from(map.entries())
      .map(([source, agg]) => ({ source, ...agg }))
      .sort((a, b) => b.count - a.count);
  }, [organicTransactions]);

  const filteredOrganic = useMemo(() => {
    let list = organicTransactions;
    if (organicSourceFilter) {
      list = list.filter(t => organicSourceOf(t) === organicSourceFilter);
    }
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter(t =>
      t.product_name?.toLowerCase().includes(s) ||
      t.customer_name?.toLowerCase().includes(s) ||
      t.customer_email?.toLowerCase().includes(s)
    );
  }, [organicTransactions, search, organicSourceFilter]);

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
          <div className="flex items-center gap-3">
            {funnel?.color && view.level === 'campaigns' && (
              <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: funnel.color }} />
            )}
            <h1 className="text-2xl font-bold text-foreground">
              {view.level === 'campaigns' ? `Campanhas — ${funnel?.name || ''}` : title}
            </h1>
          </div>
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
      ) : (
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
              {(organicSales.front_sales > 0 || organicSales.bump_sales > 0 || organicSales.upsell_sales > 0) && (
                <span className="ml-1">
                  ({[
                    organicSales.front_sales > 0 ? `${organicSales.front_sales} front` : null,
                    organicSales.bump_sales > 0 ? `${organicSales.bump_sales} bump` : null,
                    organicSales.upsell_sales > 0 ? `${organicSales.upsell_sales} upsell` : null,
                    organicSales.downsell_sales > 0 ? `${organicSales.downsell_sales} downsell` : null,
                  ].filter(Boolean).join(' · ')})
                </span>
              )}
            </div>
          </div>

          {/* Chips por origem: clique filtra a lista */}
          {organicBySource.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {organicBySource.map(({ source, count, revenue }) => {
                const active = organicSourceFilter === source;
                return (
                  <button
                    key={source}
                    onClick={() => setOrganicSourceFilter(active ? null : source)}
                    title={`${count} venda${count !== 1 ? 's' : ''} · ${formatCurrency(revenue)}`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : source === 'Sem UTM'
                        ? 'bg-muted text-muted-foreground border-border hover:border-primary/50'
                        : 'bg-accent text-accent-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {source}
                    <span className={`font-semibold ${active ? '' : 'text-foreground'}`}>{count}</span>
                  </button>
                );
              })}
              {organicSourceFilter && (
                <button
                  onClick={() => setOrganicSourceFilter(null)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  limpar filtro
                </button>
              )}
            </div>
          )}

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
                              if (utms.length === 0) {
                                return (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                                    Sem UTM
                                  </span>
                                );
                              }
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
      )}
    </div>
  );
}
