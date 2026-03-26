import React, { useState, useEffect, useCallback } from 'react';
import { usePaginatedLeads, useLeadFilterOptions, PaginatedLead } from '@/hooks/usePaginatedLeads';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from '@/components/ui/pagination';
import LeadTimeline from '@/components/lead-funnels/LeadTimeline';
import { Download, Search, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const PAGE_SIZE = 50;

const LeadsList: React.FC = () => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [funnelFilter, setFunnelFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedLead, setSelectedLead] = useState<PaginatedLead | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page on filter change
  const handleFunnelChange = useCallback((v: string) => { setFunnelFilter(v); setPage(1); }, []);
  const handleSourceChange = useCallback((v: string) => { setSourceFilter(v); setPage(1); }, []);

  const { data: filterOptions } = useLeadFilterOptions();
  const { data, isLoading, isFetching } = usePaginatedLeads({
    search: debouncedSearch,
    funnelId: funnelFilter === 'all' ? null : funnelFilter,
    source: sourceFilter === 'all' ? null : sourceFilter,
    page,
    pageSize: PAGE_SIZE,
  });

  const leads = data?.leads || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  // Fetch total spent per email
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
          map[tx.customer_email] = (map[tx.customer_email] || 0) + Math.round((Number(tx.revenue) || 0) * 100);
        }
      });
      return map;
    },
    refetchInterval: 60000,
  });

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  const exportCSV = () => {
    const header = 'Nome,Email,Telefone,Fonte,Meio,Funil,Etapa,Total Gasto,Entrada\n';
    const rows = leads.map(l => {
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

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('ellipsis');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Todos os Leads</h1>
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
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
          <Select value={funnelFilter} onValueChange={handleFunnelChange}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Funil" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os funis</SelectItem>
              {(filterOptions?.funnels || []).map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={handleSourceChange}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Fonte" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as fontes</SelectItem>
              {(filterOptions?.sources || []).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{total.toLocaleString('pt-BR')} leads</span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Carregando...</span>
            </div>
          ) : (
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
                {leads.map(lead => {
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
                {leads.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum lead encontrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => setPage(p => Math.max(1, p - 1))} 
                className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} 
              />
            </PaginationItem>
            {getPageNumbers().map((p, i) => (
              <PaginationItem key={i}>
                {p === 'ellipsis' ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink 
                    isActive={p === page} 
                    onClick={() => setPage(p)} 
                    className="cursor-pointer"
                  >
                    {p}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} 
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <LeadTimeline lead={selectedLead as any} open={timelineOpen} onClose={() => setTimelineOpen(false)} />
    </div>
  );
};

export default LeadsList;
