import React, { useState, useMemo } from 'react';
import { useAllLeads, LeadWithPosition } from '@/hooks/useAllLeads';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LeadTimeline from '@/components/lead-funnels/LeadTimeline';
import { Download, Search } from 'lucide-react';
import { format } from 'date-fns';

const LeadsList: React.FC = () => {
  const { data: leads = [], isLoading } = useAllLeads();
  const [search, setSearch] = useState('');
  const [funnelFilter, setFunnelFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedLead, setSelectedLead] = useState<LeadWithPosition | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);

  // Fetch total spent per email from v_all_sales (unified view)
  const { data: spentMap = {} } = useQuery({
    queryKey: ['leads-total-spent'],
    queryFn: async () => {
      const { data: txs } = await (supabase as any)
        .from('v_all_sales')
        .select('customer_email, revenue')
        .eq('status', 'authorized');
      const map: Record<string, number> = {};
      (txs || []).forEach((tx: any) => {
        if (tx.customer_email) {
          // spentMap stores in centavos for backward compat with formatCurrency
          map[tx.customer_email] = (map[tx.customer_email] || 0) + Math.round((Number(tx.revenue) || 0) * 100);
        }
      });
      return map;
    },
    refetchInterval: 60000,
  });

  const funnelOptions = useMemo(() => {
    const set = new Map<string, string>();
    leads.forEach(l => l.positions.forEach(p => { if (p.funnel_name) set.set(p.funnel_id, p.funnel_name); }));
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [leads]);

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    leads.forEach(l => set.add(l.utm_source || 'Direto'));
    return Array.from(set).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    return leads.filter(l => {
      const q = search.toLowerCase();
      const matchSearch = !q || [l.name, l.email, l.phone].some(v => v?.toLowerCase().includes(q));
      const matchFunnel = funnelFilter === 'all' || l.positions.some(p => p.funnel_id === funnelFilter);
      const matchSource = sourceFilter === 'all' || (l.utm_source || 'Direto') === sourceFilter;
      return matchSearch && matchFunnel && matchSource;
    });
  }, [leads, search, funnelFilter, sourceFilter]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  const exportCSV = () => {
    const header = 'Nome,Email,Telefone,Fonte,Meio,Funil,Etapa,Total Gasto,Entrada\n';
    const rows = filtered.map(l => {
      const pos = l.positions[0];
      const spent = l.email ? (spentMap[l.email] || 0) : 0;
      return [l.name, l.email, l.phone, l.utm_source, l.utm_medium, pos?.funnel_name, pos?.stage_name, formatCurrency(spent), l.created_at].map(v => `"${v || ''}"`).join(',');
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'leads.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Todos os Leads</h1>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="h-4 w-4 mr-2" /> Exportar CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar nome, email ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={funnelFilter} onValueChange={setFunnelFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Funil" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os funis</SelectItem>
              {funnelOptions.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Fonte" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as fontes</SelectItem>
              {sourceOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filtered.length} leads</span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Funil</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead className="text-right">Total Gasto</TableHead>
                <TableHead>Entrada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 200).map(lead => {
                const pos = lead.positions[0];
                const spent = lead.email ? (spentMap[lead.email] || 0) : 0;
                return (
                  <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedLead(lead); setTimelineOpen(true); }}>
                    <TableCell className="font-medium">{lead.name || '—'}</TableCell>
                    <TableCell>{lead.email || '—'}</TableCell>
                    <TableCell>{lead.phone || '—'}</TableCell>
                    <TableCell>
                      {pos ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pos.funnel_color }} />
                          {pos.funnel_name}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      {pos ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: `${pos.stage_color}20`, color: pos.stage_color }}>
                          {pos.stage_name}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{lead.utm_source || 'Direto'}</TableCell>
                    <TableCell className="text-right font-medium text-emerald-600">{spent > 0 ? formatCurrency(spent) : '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(lead.created_at), 'dd/MM/yy')}</TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum lead encontrado.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LeadTimeline lead={selectedLead} open={timelineOpen} onClose={() => setTimelineOpen(false)} />
    </div>
  );
};

export default LeadsList;
