import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/formatters';
import { BarChart3, Users, ShoppingCart, DollarSign, Award, Info } from 'lucide-react';
import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth, differenceInDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

const COMMISSION_RATE = 0.10;

const PERIOD_PRESETS = [
  { label: 'Hoje', getValue: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  { label: 'Esta semana', getValue: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: endOfDay(new Date()) }) },
  { label: 'Este mês', getValue: () => ({ from: startOfMonth(new Date()), to: endOfDay(new Date()) }) },
  { label: 'Últimos 7 dias', getValue: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }) },
  { label: 'Últimos 30 dias', getValue: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }) },
];

const SELLER_COLORS = [
  'hsl(var(--primary))',
  'hsl(210, 70%, 55%)',
  'hsl(150, 60%, 45%)',
  'hsl(30, 80%, 55%)',
  'hsl(280, 60%, 55%)',
  'hsl(0, 70%, 55%)',
  'hsl(180, 50%, 45%)',
  'hsl(60, 70%, 45%)',
];

export default function CrmAnalytics() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfDay(subDays(new Date(), 29)),
    to: endOfDay(new Date()),
  });
  const [activePreset, setActivePreset] = useState('Últimos 30 dias');
  const [selectedSeller, setSelectedSeller] = useState<string>('all');
  const [tableSortKey, setTableSortKey] = useState<string>('leads');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc');
  const [customDateOpen, setCustomDateOpen] = useState(false);

  const dateFrom = dateRange.from.toISOString();
  const dateTo = dateRange.to.toISOString();
  const daysInPeriod = Math.max(1, differenceInDays(dateRange.to, dateRange.from) + 1);

  // Fetch sellers
  const { data: sellers = [], isLoading: loadingSellers } = useQuery({
    queryKey: ['crm-sellers'],
    queryFn: async () => {
      const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
      if (!orgId) return [];
      const { data, error } = await (supabase as any)
        .from('user_profiles')
        .select('id, full_name, role, status')
        .eq('organization_id', orgId)
        .eq('status', 'active');
      if (error) { console.error('CRM sellers error:', error); return []; }
      const sellerRoles = ['vendedor', 'vendedora', 'suporte'];
      return (data || []).filter((u: any) => sellerRoles.includes((u.role || '').toLowerCase()));
    },
  });

  // Fetch leads in period
  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ['crm-leads', dateFrom, dateTo],
    queryFn: async () => {
      const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
      if (!orgId) return [];
      const { data } = await (supabase as any)
        .from('leads')
        .select('id, assigned_to, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo);
      return (data || []) as Array<{ id: string; assigned_to: string | null; created_at: string }>;
    },
  });

  // Fetch sales from unified view v_all_sales (with affiliate info)
  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['crm-sales', dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('v_all_sales')
        .select('id, revenue, product_name, purchased_at, status, affiliate_name, affiliate_commission')
        .eq('status', 'authorized')
        .gte('purchased_at', dateFrom)
        .lte('purchased_at', dateTo);
      if (error) { console.error('CRM sales error:', error); return []; }
      return (data || []).map((s: any) => ({
        id: s.id,
        revenue: Number(s.revenue) || 0,
        product_name: s.product_name || '',
        date: s.purchased_at || '',
        affiliate_name: s.affiliate_name || null,
        affiliate_commission: Number(s.affiliate_commission) || 0,
      }));
    },
  });

  const isLoading = loadingSellers || loadingLeads || loadingSales;

  // Match sales to sellers by affiliate_name ↔ full_name (fuzzy first-name match)
  function matchesSellerName(sellerName: string, affiliateName: string): boolean {
    const sellerNorm = sellerName.toLowerCase().trim();
    const affiliateNorm = affiliateName.toLowerCase().trim();
    if (sellerNorm === affiliateNorm) return true;
    // Match by first name (e.g. "Gabriela" matches "Gabriela Silva")
    const sellerFirst = sellerNorm.split(' ')[0];
    const affiliateFirst = affiliateNorm.split(' ')[0];
    if (sellerFirst.length >= 3 && sellerFirst === affiliateFirst) return true;
    // Check if one contains the other
    if (sellerNorm.includes(affiliateNorm) || affiliateNorm.includes(sellerNorm)) return true;
    return false;
  }

  // Compute per-seller stats
  const sellerStats = useMemo(() => {
    return sellers.map(seller => {
      const sellerName = seller.full_name || '';
      const sellerLeads = leads.filter(l => l.assigned_to === seller.id);
      const leadsCount = sellerLeads.length;

      // Match sales by affiliate_name
      const sellerSales = sellerName
        ? sales.filter(s => s.affiliate_name && matchesSellerName(sellerName, s.affiliate_name))
        : [];
      const salesCount = sellerSales.length;
      const revenue = sellerSales.reduce((sum, s) => sum + s.revenue, 0);
      const commission = sellerSales.reduce((sum, s) => sum + (s.affiliate_commission || s.revenue * COMMISSION_RATE), 0);
      const ticketMedio = salesCount > 0 ? revenue / salesCount : 0;
      const conversionRate = leadsCount > 0 ? (salesCount / leadsCount) * 100 : 0;

      return {
        id: seller.id,
        name: sellerName || 'Sem nome',
        leads: leadsCount,
        avgDailyLeads: leadsCount / daysInPeriod,
        sales: salesCount,
        revenue,
        commission,
        ticketMedio,
        convTime: null as string | null,
        conversionRate,
      };
    }).sort((a, b) => {
      const aVal = (a as any)[tableSortKey] ?? -Infinity;
      const bVal = (b as any)[tableSortKey] ?? -Infinity;
      return tableSortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [sellers, leads, sales, daysInPeriod, tableSortKey, tableSortDir]);

  // Global KPIs
  const totalLeads = leads.length;
  const totalSales = sales.length;
  const totalRevenue = sales.reduce((s, v) => s + v.revenue, 0);
  const totalCommission = sales.reduce((s, v) => s + (v.affiliate_commission || v.revenue * COMMISSION_RATE), 0);

  // Filter by selected seller for leads
  const filteredLeads = selectedSeller === 'all' ? leads : leads.filter(l => l.assigned_to === selectedSeller);

  // Leads per day chart
  const leadsPerDayData = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    const leadsToChart = selectedSeller === 'all' ? leads : leads.filter(l => l.assigned_to === selectedSeller);
    
    leadsToChart.forEach(l => {
      const day = format(parseISO(l.created_at), 'yyyy-MM-dd');
      const sellerName = sellers.find(s => s.id === l.assigned_to)?.full_name || 'Não atribuído';
      if (!map[day]) map[day] = {};
      map[day][sellerName] = (map[day][sellerName] || 0) + 1;
    });

    const allNames = [...new Set(leadsToChart.map(l => sellers.find(s => s.id === l.assigned_to)?.full_name || 'Não atribuído'))];
    const days = Object.keys(map).sort();
    return { data: days.map(d => ({ date: format(parseISO(d), 'dd/MM', { locale: ptBR }), ...map[d] })), names: allNames };
  }, [leads, sellers, selectedSeller]);

  const leadsAvg = leadsPerDayData.data.length > 0
    ? leadsPerDayData.data.reduce((s, d) => s + Object.values(d).filter(v => typeof v === 'number').reduce((a, b) => (a as number) + (b as number), 0), 0) / leadsPerDayData.data.length
    : 0;

  // Revenue per day chart
  const revenuePerDayData = useMemo(() => {
    const map: Record<string, number> = {};
    sales.forEach(s => {
      if (!s.date) return;
      const day = format(parseISO(s.date), 'dd/MM', { locale: ptBR });
      map[day] = (map[day] || 0) + s.revenue;
    });
    return Object.entries(map).map(([date, revenue]) => ({ date, revenue }));
  }, [sales]);

  const revenueAvg = revenuePerDayData.length > 0
    ? revenuePerDayData.reduce((s, d) => s + d.revenue, 0) / revenuePerDayData.length
    : 0;

  // Top 10 products
  const topProducts = useMemo(() => {
    const map: Record<string, { qty: number; revenue: number }> = {};
    sales.forEach(s => {
      const name = s.product_name || 'Sem nome';
      if (!map[name]) map[name] = { qty: 0, revenue: 0 };
      map[name].qty += 1;
      map[name].revenue += s.revenue;
    });
    const total = sales.reduce((s, v) => s + v.revenue, 0);
    return Object.entries(map)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10)
      .map(([name, { qty, revenue }], i) => ({
        pos: i + 1, name, qty, revenue, pct: total > 0 ? (revenue / total) * 100 : 0,
      }));
  }, [sales]);

  // Ranking by revenue (with fallback to leads)
  const topSellers = useMemo(() => {
    return [...sellerStats].sort((a, b) => (b.revenue || 0) - (a.revenue || 0) || b.leads - a.leads).slice(0, 3);
  }, [sellerStats]);

  function handlePreset(label: string) {
    const preset = PERIOD_PRESETS.find(p => p.label === label);
    if (preset) {
      setDateRange(preset.getValue());
      setActivePreset(label);
    }
  }

  function handleSort(key: string) {
    if (tableSortKey === key) {
      setTableSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setTableSortKey(key);
      setTableSortDir('desc');
    }
  }

  const sortIcon = (key: string) => tableSortKey === key ? (tableSortDir === 'desc' ? ' ↓' : ' ↑') : '';

  const selectedSellerName = selectedSeller === 'all'
    ? 'Média Geral'
    : sellers.find(s => s.id === selectedSeller)?.full_name || '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Análise de CRM</h1>
        <p className="text-sm text-muted-foreground">Performance das vendedoras e análise de leads</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIOD_PRESETS.map(p => (
          <Button
            key={p.label}
            variant={activePreset === p.label ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePreset(p.label)}
          >
            {p.label}
          </Button>
        ))}

        <Popover open={customDateOpen} onOpenChange={setCustomDateOpen}>
          <PopoverTrigger asChild>
            <Button variant={activePreset === 'custom' ? 'default' : 'outline'} size="sm">
              <CalendarIcon className="h-4 w-4 mr-1" />
              {activePreset === 'custom'
                ? `${format(dateRange.from, 'dd/MM')} - ${format(dateRange.to, 'dd/MM')}`
                : 'Personalizado'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range: DateRange | undefined) => {
                if (range?.from && range?.to) {
                  setDateRange({ from: startOfDay(range.from), to: endOfDay(range.to) });
                  setActivePreset('custom');
                  setCustomDateOpen(false);
                }
              }}
              numberOfMonths={2}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        <div className="ml-auto w-56">
          <Select value={selectedSeller} onValueChange={setSelectedSeller}>
            <SelectTrigger>
              <SelectValue placeholder="Todas as vendedoras" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as vendedoras</SelectItem>
              {sellers.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.full_name || 'Sem nome'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Users}
          label="Leads Atendidos"
          value={isLoading ? null : formatNumber(filteredLeads.length)}
          tooltip="Total de leads criados no período filtrado"
        />
        <KpiCard
          icon={ShoppingCart}
          label="Vendas Geradas"
          value={isLoading ? null : formatNumber(totalSales)}
          tooltip="Total de vendas autorizadas no período (todas as plataformas)"
        />
        <KpiCard
          icon={DollarSign}
          label="Receita Total"
          value={isLoading ? null : formatCurrency(totalRevenue)}
          tooltip="Soma da receita bruta das vendas no período"
        />
        <KpiCard
          icon={Award}
          label="Comissão Total"
          value={isLoading ? null : formatCurrency(totalCommission)}
          tooltip={`Estimativa com taxa de ${(COMMISSION_RATE * 100).toFixed(0)}% sobre a receita`}
          sub={`${(COMMISSION_RATE * 100).toFixed(0)}% estimado`}
        />
      </div>

      {/* Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Performance por Vendedora</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : sellerStats.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma vendedora cadastrada com role "vendedora"</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedora</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('leads')}>
                      Leads{sortIcon('leads')}
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('avgDailyLeads')}>
                      Média/Dia{sortIcon('avgDailyLeads')}
                    </TableHead>
                    <TableHead>
                      <span className="flex items-center gap-1">
                        Vendas
                        <Tooltip>
                          <TooltipTrigger><Info className="h-3 w-3 text-muted-foreground/50" /></TooltipTrigger>
                          <TooltipContent><p className="text-xs max-w-[200px]">Atribuição por nome do afiliado no webhook</p></TooltipContent>
                        </Tooltip>
                      </span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('revenue')}>
                      Receita{sortIcon('revenue')}
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('commission')}>
                      Comissão{sortIcon('commission')}
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('ticketMedio')}>
                      Ticket Médio{sortIcon('ticketMedio')}
                    </TableHead>
                    <TableHead>Tempo Conversa</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('conversionRate')}>
                      Conversão{sortIcon('conversionRate')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellerStats.map(s => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedSeller(prev => prev === s.id ? 'all' : s.id)}
                      data-state={selectedSeller === s.id ? 'selected' : undefined}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                            {(s.name[0] || '?').toUpperCase()}
                          </div>
                          {s.name}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{s.leads}</TableCell>
                      <TableCell className="font-mono">{s.avgDailyLeads.toFixed(1)}</TableCell>
                      <TableCell className="font-mono">{s.sales}</TableCell>
                      <TableCell className="font-mono">{formatCurrency(s.revenue)}</TableCell>
                      <TableCell className="font-mono text-primary">{formatCurrency(s.commission)}</TableCell>
                      <TableCell className="font-mono">{s.ticketMedio > 0 ? formatCurrency(s.ticketMedio) : '—'}</TableCell>
                      <TableCell className="text-muted-foreground">—</TableCell>
                      <TableCell className="font-mono">{s.conversionRate > 0 ? `${s.conversionRate.toFixed(1)}%` : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads per Day */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Leads por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : leadsPerDayData.data.length === 0 ? (
              <p className="text-sm text-muted-foreground py-16 text-center">Sem dados no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={leadsPerDayData.data}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend />
                  {leadsPerDayData.names.map((name, i) => (
                    <Bar key={name} dataKey={name} fill={SELLER_COLORS[i % SELLER_COLORS.length]} radius={[4, 4, 0, 0]} stackId="a" />
                  ))}
                  <ReferenceLine y={leadsAvg} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" label={{ value: `Média: ${leadsAvg.toFixed(1)}`, fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Revenue per Day */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Receita por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : revenuePerDayData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-16 text-center">Sem dados no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={revenuePerDayData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [formatCurrency(value), 'Receita']}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <ReferenceLine y={revenueAvg} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" label={{ value: `Média: ${formatCurrency(revenueAvg)}`, fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top 10 Produtos — Geral</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem vendas no período</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Qtd</TableHead>
                    <TableHead>Receita</TableHead>
                    <TableHead>%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map(p => (
                    <TableRow key={p.name}>
                      <TableCell className="font-mono text-muted-foreground">{p.pos}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{p.name}</TableCell>
                      <TableCell className="font-mono">{p.qty}</TableCell>
                      <TableCell className="font-mono">{formatCurrency(p.revenue)}</TableCell>
                      <TableCell className="font-mono">{formatPercent(p.pct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Produtos — {selectedSellerName}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 py-8 justify-center">
              <Info className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Vendas não podem ser filtradas por vendedora — tabelas de vendas não possuem vínculo com seller_id
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ranking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🏆 Ranking de Vendedoras (por Leads Atendidos)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : topSellers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem dados</p>
          ) : (
            <div className="flex items-end justify-center gap-6 py-4">
              {topSellers.map((seller, i) => {
                const medals = ['🥇', '🥈', '🥉'];
                const heights = ['h-32', 'h-24', 'h-20'];
                return (
                  <div key={seller.id} className="flex flex-col items-center gap-2">
                    <span className="text-3xl">{medals[i]}</span>
                    <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                      {(seller.name[0] || '?').toUpperCase()}
                    </div>
                    <p className="font-medium text-sm text-foreground text-center">{seller.name}</p>
                    <p className="text-xs text-muted-foreground">{seller.leads} leads</p>
                    <div className={`w-20 ${heights[i]} rounded-t-lg bg-primary/20`} />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Internal KPI Card
function KpiCard({ icon: Icon, label, value, tooltip, sub }: {
  icon: React.ElementType;
  label: string;
  value: string | null;
  tooltip?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">{label}</span>
            {tooltip && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent><p className="text-xs max-w-[200px]">{tooltip}</p></TooltipContent>
              </Tooltip>
            )}
          </div>
          {value === null ? (
            <Skeleton className="h-7 w-24 mt-1" />
          ) : (
            <p className="text-2xl font-semibold font-mono-value tracking-tight text-foreground">{value}</p>
          )}
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </div>
  );
}
