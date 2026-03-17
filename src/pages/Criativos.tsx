import { useState, useMemo } from 'react';
import { useMetaAds, useMetaCampaigns, useMetaAdsets } from '@/hooks/useMetaData';
import { useAllSalesAggregation } from '@/hooks/useAllSales';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import KPICard from '@/components/dashboard/KPICard';
import { SkeletonTable, SkeletonCard } from '@/components/dashboard/SkeletonCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import {
  Palette, Trophy, DollarSign, MousePointerClick,
  Search, Filter, Pencil, ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, flexRender,
  type ColumnDef, type SortingState,
} from '@tanstack/react-table';
import {
  formatCurrency, formatNumber, formatPercent, formatRoas, getRoasColor, getProfitColor,
} from '@/lib/formatters';

interface AdCreative {
  id: string;
  ad_id: string;
  hook: string | null;
  angle: string | null;
  format: string | null;
  description: string | null;
}

function useAdCreatives() {
  return useQuery({
    queryKey: ['ad-creatives'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ad_creatives')
        .select('*');
      if (error) throw error;
      return (data || []) as AdCreative[];
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

function useUpsertAdCreative() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (creative: { ad_id: string; hook: string; angle: string; format: string; description: string }) => {
      const { error } = await supabase
        .from('ad_creatives')
        .upsert(
          { ...creative, updated_at: new Date().toISOString() },
          { onConflict: 'ad_id' }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ad-creatives'] }),
  });
}

interface EnrichedAd {
  id: string;
  name: string;
  status: string;
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  sales: number;
  clicks: number;
  link_clicks: number;
  ctr: number;
  impressions: number;
  video_views: number;
  landing_page_views: number;
  initiate_checkout: number;
  campaign_id: string;
  adset_id: string;
  hook_label: string;
  angle_label: string;
  creative?: AdCreative;
  thumbnail_url?: string;
}

export default function Criativos() {
  const { data: ads = [], isLoading: loadingAds } = useMetaAds();
  const { data: campaigns = [] } = useMetaCampaigns();
  const { data: adsets = [] } = useMetaAdsets();
  const { byAd } = useAllSalesAggregation();
  const { data: creatives = [] } = useAdCreatives();
  const upsertCreative = useUpsertAdCreative();

  const [search, setSearch] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [adsetFilter, setAdsetFilter] = useState('all');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'roas', desc: true }]);

  // Edit modal state
  const [editAd, setEditAd] = useState<EnrichedAd | null>(null);
  const [editHook, setEditHook] = useState('');
  const [editAngle, setEditAngle] = useState('');
  const [editFormat, setEditFormat] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const creativesMap = useMemo(() => {
    const map: Record<string, AdCreative> = {};
    for (const c of creatives) map[c.ad_id] = c;
    return map;
  }, [creatives]);

  const enrichedAds = useMemo<EnrichedAd[]>(() => {
    return ads
      .filter(a => a.spend > 0 || a.status === 'active')
      .map(a => {
        const sales = byAd[a.id] || { sales_count: 0, revenue: 0 };
        const creative = creativesMap[a.id];
        const adAny = a as any;
        const thumbUrl = adAny.creative?.thumbnail_url || adAny.creative?.image_url;
        return {
          id: a.id,
          name: a.name,
          status: a.status,
          spend: a.spend,
          revenue: sales.revenue,
          profit: sales.revenue - a.spend,
          roas: a.spend > 0 ? sales.revenue / a.spend : 0,
          sales: sales.sales_count,
          clicks: a.clicks,
          link_clicks: a.link_clicks,
          ctr: a.ctr,
          impressions: a.impressions,
          video_views: a.video_views,
          landing_page_views: a.landing_page_views,
          initiate_checkout: a.initiate_checkout,
          campaign_id: (a as any).campaign_id || '',
          adset_id: (a as any).adset_id || '',
          hook_label: creative?.hook || '',
          angle_label: creative?.angle || '',
          creative,
          thumbnail_url: thumbUrl,
        };
      });
  }, [ads, byAd, creativesMap]);

  // Apply filters
  const filtered = useMemo(() => {
    return enrichedAds
      .filter(a => campaignFilter === 'all' || a.campaign_id === campaignFilter)
      .filter(a => adsetFilter === 'all' || a.adset_id === adsetFilter)
      .filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()));
  }, [enrichedAds, campaignFilter, adsetFilter, search]);

  // Top 3 ROAS for badge
  const top3RoasIds = useMemo(() => {
    const sorted = [...filtered].filter(a => a.roas > 0).sort((a, b) => b.roas - a.roas);
    return new Set(sorted.slice(0, 3).map(a => a.id));
  }, [filtered]);

  // KPI summary
  const kpi = useMemo(() => {
    const activeCount = enrichedAds.filter(a => a.status === 'active').length;
    const withRevenue = filtered.filter(a => a.roas > 0);
    const bestRoas = withRevenue.length > 0 ? Math.max(...withRevenue.map(a => a.roas)) : 0;
    const bestRoasName = withRevenue.find(a => a.roas === bestRoas)?.name || '—';
    const bestRevenue = filtered.length > 0 ? Math.max(...filtered.map(a => a.revenue)) : 0;
    const bestRevName = filtered.find(a => a.revenue === bestRevenue)?.name || '—';
    const bestClicks = filtered.length > 0 ? Math.max(...filtered.map(a => a.link_clicks)) : 0;
    const bestClicksName = filtered.find(a => a.link_clicks === bestClicks)?.name || '—';
    return {
      activeCount,
      bestRoas, bestRoasName,
      bestRevenue, bestRevName,
      bestClicks, bestClicksName,
    };
  }, [enrichedAds, filtered]);

  // Campaign and adset options
  const campaignOptions = useMemo(() => {
    const ids = new Set(enrichedAds.map(a => a.campaign_id));
    return campaigns.filter(c => ids.has(c.id));
  }, [enrichedAds, campaigns]);

  const adsetOptions = useMemo(() => {
    const ids = new Set(enrichedAds.filter(a => campaignFilter === 'all' || a.campaign_id === campaignFilter).map(a => a.adset_id));
    return adsets.filter(a => ids.has(a.id));
  }, [enrichedAds, adsets, campaignFilter]);

  const openEdit = (ad: EnrichedAd) => {
    setEditAd(ad);
    setEditHook(ad.creative?.hook || '');
    setEditAngle(ad.creative?.angle || '');
    setEditFormat(ad.creative?.format || '');
    setEditDesc(ad.creative?.description || '');
  };

  const handleSave = async () => {
    if (!editAd) return;
    await upsertCreative.mutateAsync({
      ad_id: editAd.id,
      hook: editHook,
      angle: editAngle,
      format: editFormat,
      description: editDesc,
    });
    setEditAd(null);
  };

  // Table columns
  const columns = useMemo<ColumnDef<EnrichedAd>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Criativo',
      cell: ({ row, getValue }) => (
        <div className="flex items-center gap-2">
          {row.original.thumbnail_url && (
            <img
              src={row.original.thumbnail_url}
              alt=""
              className="h-9 w-9 rounded border border-border object-cover shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground truncate block max-w-[240px]" title={getValue() as string}>
                {getValue() as string}
              </span>
              {top3RoasIds.has(row.original.id) && (
                <Badge className="bg-kpi-positive/15 text-kpi-positive border-0 text-[10px] px-1.5 py-0">🏆 Top</Badge>
              )}
            </div>
            {(row.original.hook_label || row.original.angle_label) && (
              <div className="flex items-center gap-1 mt-0.5">
                {row.original.hook_label && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{row.original.hook_label}</span>
                )}
                {row.original.angle_label && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{row.original.angle_label}</span>
                )}
              </div>
            )}
          </div>
        </div>
      ),
      size: 300,
    },
    {
      id: 'hook_rate',
      header: 'Hook %',
      accessorFn: (row) => row.impressions > 0 && row.video_views > 0 ? (row.video_views / row.impressions) * 100 : 0,
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return <span className="font-mono-value">{v > 0 ? `${v.toFixed(2)}%` : '—'}</span>;
      },
      size: 80,
    },
    {
      id: 'angle',
      header: 'Ângulo',
      accessorFn: (row) => row.angle_label || '—',
      cell: ({ getValue }) => <span className="text-xs">{getValue() as string}</span>,
      size: 100,
    },
    {
      accessorKey: 'spend',
      header: 'Gasto',
      cell: ({ getValue }) => <span className="font-mono-value">{formatCurrency(getValue() as number)}</span>,
      size: 110,
    },
    {
      accessorKey: 'link_clicks',
      header: 'Cliques',
      cell: ({ getValue }) => <span className="font-mono-value">{formatNumber(getValue() as number)}</span>,
      size: 80,
    },
    {
      accessorKey: 'ctr',
      header: 'CTR',
      cell: ({ getValue }) => <span className="font-mono-value">{formatPercent(getValue() as number)}</span>,
      size: 70,
    },
    {
      accessorKey: 'sales',
      header: 'Vendas',
      cell: ({ getValue }) => <span className="font-mono-value">{getValue() as number}</span>,
      size: 70,
    },
    {
      accessorKey: 'revenue',
      header: 'Faturamento',
      cell: ({ getValue }) => <span className="font-mono-value">{formatCurrency(getValue() as number)}</span>,
      size: 120,
    },
    {
      accessorKey: 'roas',
      header: 'ROAS',
      cell: ({ row, getValue }) => {
        const v = getValue() as number;
        return (
          <span className={`font-mono-value font-semibold ${getRoasColor(v)}`}>
            {formatRoas(v)}
          </span>
        );
      },
      size: 80,
    },
    {
      accessorKey: 'profit',
      header: 'Lucro',
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return <span className={`font-mono-value font-semibold ${getProfitColor(v)}`}>{formatCurrency(v)}</span>;
      },
      size: 110,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          onClick={(e) => { e.stopPropagation(); openEdit(row.original); }}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
          title="Editar criativo"
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      ),
      size: 50,
      enableSorting: false,
    },
  ], [top3RoasIds]);

  // Totals
  const totals = useMemo(() => {
    const spend = filtered.reduce((s, c) => s + c.spend, 0);
    const revenue = filtered.reduce((s, c) => s + c.revenue, 0);
    const sales = filtered.reduce((s, c) => s + c.sales, 0);
    const clicks = filtered.reduce((s, c) => s + c.link_clicks, 0);
    const impressions = filtered.reduce((s, c) => s + c.impressions, 0);
    const video_views = filtered.reduce((s, c) => s + c.video_views, 0);
    return {
      spend, revenue, sales, clicks, impressions,
      profit: revenue - spend,
      roas: spend > 0 ? revenue / spend : 0,
      ctr: impressions > 0 ? (filtered.reduce((s, c) => s + c.clicks, 0) / impressions) * 100 : 0,
      hook: impressions > 0 && video_views > 0 ? (video_views / impressions) * 100 : 0,
    };
  }, [filtered]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Criativos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} anúncio{filtered.length !== 1 ? 's' : ''} com dados</p>
        </div>
        <DateRangePicker />
      </div>

      {/* KPI Cards */}
      {loadingAds ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Criativos Ativos"
            value={String(kpi.activeCount)}
            icon={Palette}
            tooltip="Total de anúncios com status ativo"
          />
          <KPICard
            label="Melhor ROAS"
            value={formatRoas(kpi.bestRoas)}
            icon={Trophy}
            colorClass={getRoasColor(kpi.bestRoas)}
            tooltip={kpi.bestRoasName}
          />
          <KPICard
            label="Maior Receita"
            value={formatCurrency(kpi.bestRevenue)}
            icon={DollarSign}
            tooltip={kpi.bestRevName}
          />
          <KPICard
            label="Mais Cliques"
            value={formatNumber(kpi.bestClicks)}
            icon={MousePointerClick}
            tooltip={kpi.bestClicksName}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filtrar por nome do anúncio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Select value={campaignFilter} onValueChange={(v) => { setCampaignFilter(v); setAdsetFilter('all'); }}>
          <SelectTrigger className="w-[200px] bg-card">
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Campanha" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas campanhas</SelectItem>
            {campaignOptions.map(c => (
              <SelectItem key={c.id} value={c.id}>
                {c.name.length > 30 ? c.name.slice(0, 30) + '…' : c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={adsetFilter} onValueChange={setAdsetFilter}>
          <SelectTrigger className="w-[200px] bg-card">
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Conjunto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos conjuntos</SelectItem>
            {adsetOptions.map(a => (
              <SelectItem key={a.id} value={a.id}>
                {a.name.length > 30 ? a.name.slice(0, 30) + '…' : a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loadingAds ? (
        <SkeletonTable />
      ) : filtered.length > 0 ? (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id} className="bg-table-header border-b border-border">
                    {headerGroup.headers.map(header => (
                      <th
                        key={header.id}
                        className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-muted/50"
                        style={{ width: header.getSize() }}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            header.column.getIsSorted() === 'asc' ? <ArrowUp className="h-3 w-3" /> :
                            header.column.getIsSorted() === 'desc' ? <ArrowDown className="h-3 w-3" /> :
                            <ArrowUpDown className="h-3 w-3 opacity-30" />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="border-b border-border transition-colors hover:bg-table-hover">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-3 py-2.5 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-table-header border-t-2 border-border font-semibold">
                  <td className="px-3 py-2.5 text-xs">{filtered.length} CRIATIVOS</td>
                  <td className="px-3 py-2.5 font-mono-value">{totals.hook > 0 ? `${totals.hook.toFixed(2)}%` : '—'}</td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 font-mono-value">{formatCurrency(totals.spend)}</td>
                  <td className="px-3 py-2.5 font-mono-value">{formatNumber(totals.clicks)}</td>
                  <td className="px-3 py-2.5 font-mono-value">{formatPercent(totals.ctr)}</td>
                  <td className="px-3 py-2.5 font-mono-value">{totals.sales}</td>
                  <td className="px-3 py-2.5 font-mono-value">{formatCurrency(totals.revenue)}</td>
                  <td className={`px-3 py-2.5 font-mono-value font-semibold ${getRoasColor(totals.roas)}`}>{formatRoas(totals.roas)}</td>
                  <td className={`px-3 py-2.5 font-mono-value font-semibold ${getProfitColor(totals.profit)}`}>{formatCurrency(totals.profit)}</td>
                  <td className="px-3 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum anúncio encontrado com os filtros selecionados.
        </div>
      )}

      {/* Edit Modal */}
      <Dialog open={!!editAd} onOpenChange={(open) => { if (!open) setEditAd(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Criativo</DialogTitle>
            <DialogDescription className="truncate">{editAd?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="hook">Hook (primeiros 3 segundos)</Label>
              <Input id="hook" value={editHook} onChange={(e) => setEditHook(e.target.value)} placeholder="Ex: Pergunta chocante, estatística..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="angle">Ângulo</Label>
              <Select value={editAngle} onValueChange={setEditAngle}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o ângulo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prova_social">Prova Social</SelectItem>
                  <SelectItem value="dor">Dor</SelectItem>
                  <SelectItem value="transformacao">Transformação</SelectItem>
                  <SelectItem value="oferta">Oferta</SelectItem>
                  <SelectItem value="autoridade">Autoridade</SelectItem>
                  <SelectItem value="curiosidade">Curiosidade</SelectItem>
                  <SelectItem value="urgencia">Urgência</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="format">Formato</Label>
              <Select value={editFormat} onValueChange={setEditFormat}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o formato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video_curto">Vídeo Curto</SelectItem>
                  <SelectItem value="video_longo">Vídeo Longo</SelectItem>
                  <SelectItem value="carrossel">Carrossel</SelectItem>
                  <SelectItem value="imagem">Imagem Estática</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Descrição do criativo</Label>
              <Textarea id="desc" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Detalhes sobre o criativo, copy, etc." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAd(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={upsertCreative.isPending}>
              {upsertCreative.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
