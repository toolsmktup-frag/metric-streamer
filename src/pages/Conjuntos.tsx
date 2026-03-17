import React, { useState, useMemo } from 'react';
import { useMetaAdsets, useMetaCampaigns } from '@/hooks/useMetaData';
import { useAllSalesAggregation } from '@/hooks/useAllSales';
import PerformanceTable from '@/components/dashboard/PerformanceTable';
import { Search } from 'lucide-react';

export default function Conjuntos() {
  const { data: allAdsets = [], isLoading } = useMetaAdsets();
  const { data: campaignList = [] } = useMetaCampaigns();
  const { byAdset } = useAllSalesAggregation();
  const [search, setSearch] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('all');

  const adsetsWithSales = useMemo(() => {
    return allAdsets.map(a => {
      const sales = byAdset[a.id] || { sales_count: 0, revenue: 0, front_sales: 0, bump_sales: 0, upsell_sales: 0 };
      return {
        ...a,
        sales: sales.sales_count,
        revenue: sales.revenue,
        front_sales: sales.front_sales,
        bump_sales: sales.bump_sales,
        upsell_sales: sales.upsell_sales,
        profit: sales.revenue - a.spend,
        roas: a.spend > 0 ? sales.revenue / a.spend : 0,
        cpa: sales.sales_count > 0 ? a.spend / sales.sales_count : 0,
      };
    });
  }, [allAdsets, byAdset]);

  const filtered = adsetsWithSales.filter(a => {
    if (campaignFilter !== 'all' && a.campaign_id !== campaignFilter) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Conjuntos de Anúncios</h1>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Filtrar por nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="all">Todas Campanhas</option>
          {campaignList.map(c => (
            <option key={c.id} value={c.id}>{c.name.slice(0, 40)}</option>
          ))}
        </select>
      </div>
      {filtered.length > 0 ? (
        <PerformanceTable data={filtered as any} level="adset" />
      ) : (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {isLoading ? 'Carregando...' : 'Nenhum conjunto encontrado. Sincronize os dados do Meta Ads.'}
        </div>
      )}
    </div>
  );
}