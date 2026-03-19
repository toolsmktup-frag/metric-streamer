import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Search, Users, DollarSign, ShoppingCart, TrendingUp, MessageCircle, ChevronUp, ChevronDown, Timer } from 'lucide-react';
import { useBulkLeadPurchases, type PurchaseSummary } from '@/hooks/useBulkLeadPurchases';
import { formatCurrency } from '@/lib/formatters';
import type { Lead, LeadStagePosition } from '@/types/leadFunnels';
import type { RecontactInfo } from '@/hooks/useRecontactDeadlines';

interface BaseLeadsListProps {
  positions: (LeadStagePosition & { lead: Lead })[];
  onLeadClick: (leadId: string) => void;
  onWhatsAppClick: (phone: string) => void;
  recontactMap?: Map<string, RecontactInfo>;
}

type SortKey = 'ltv' | 'name' | 'date' | 'orders';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

const BaseLeadsList: React.FC<BaseLeadsListProps> = ({ positions, onLeadClick, onWhatsAppClick }) => {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('ltv');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const { data: purchaseMap, isLoading: ltvLoading } = useBulkLeadPurchases(positions);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />;
  };

  // Filter + sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = positions.filter(p => {
      if (!q) return true;
      const name = p.lead.name || '';
      return (
        name.toLowerCase().includes(q) ||
        (p.lead.email || '').toLowerCase().includes(q) ||
        (p.lead.phone || '').includes(q)
      );
    });

    list.sort((a, b) => {
      const pA = purchaseMap?.get(a.lead_id);
      const pB = purchaseMap?.get(b.lead_id);
      let cmp = 0;

      switch (sortKey) {
        case 'ltv':
          cmp = (pA?.totalSpent || 0) - (pB?.totalSpent || 0);
          break;
        case 'orders':
          cmp = (pA?.totalOrders || 0) - (pB?.totalOrders || 0);
          break;
        case 'name': {
          const nA = (a.lead.name || '').toLowerCase();
          const nB = (b.lead.name || '').toLowerCase();
          cmp = nA.localeCompare(nB);
          break;
        }
        case 'date':
          cmp = new Date(a.entered_at || 0).getTime() - new Date(b.entered_at || 0).getTime();
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [positions, search, sortKey, sortDir, purchaseMap]);

  // Summary stats
  const stats = useMemo(() => {
    let totalLtv = 0;
    let withPurchase = 0;
    let totalOrders = 0;

    positions.forEach(p => {
      const ps = purchaseMap?.get(p.lead_id);
      if (ps && ps.totalSpent > 0) {
        totalLtv += ps.totalSpent;
        totalOrders += ps.totalOrders;
        withPurchase++;
      }
    });

    return {
      totalLeads: positions.length,
      withPurchase,
      purchasePercent: positions.length > 0 ? (withPurchase / positions.length) * 100 : 0,
      totalLtv,
      avgTicket: totalOrders > 0 ? totalLtv / totalOrders : 0,
    };
  }, [positions, purchaseMap]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('pt-BR');
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Leads</p>
              <p className="text-xl font-bold text-foreground">{stats.totalLeads.toLocaleString('pt-BR')}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <ShoppingCart className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Com compra</p>
              <p className="text-xl font-bold text-foreground">
                {stats.withPurchase.toLocaleString('pt-BR')}
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  ({stats.purchasePercent.toFixed(1)}%)
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">LTV Total</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(stats.totalLtv)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <TrendingUp className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ticket Médio</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(stats.avgTicket)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, email ou telefone..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort('name')}
              >
                <span className="flex items-center gap-1">Nome <SortIcon col="name" /></span>
              </TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => toggleSort('ltv')}
              >
                <span className="flex items-center justify-end gap-1">LTV <SortIcon col="ltv" /></span>
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => toggleSort('orders')}
              >
                <span className="flex items-center justify-end gap-1">Compras <SortIcon col="orders" /></span>
              </TableHead>
              <TableHead>1ª Compra</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort('date')}
              >
                <span className="flex items-center gap-1">Entrada <SortIcon col="date" /></span>
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {ltvLoading && positions.length > 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Calculando LTV...
                </TableCell>
              </TableRow>
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {search ? 'Nenhum lead encontrado' : 'Nenhum lead neste funil'}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map(p => {
                const ps = purchaseMap?.get(p.lead_id);
                const name = p.lead.name || '—';

                return (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => onLeadClick(p.lead_id)}
                  >
                    <TableCell className="font-medium text-foreground">{name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{p.lead.email || '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{p.lead.phone || '—'}</TableCell>
                    <TableCell className="text-right font-mono text-foreground">
                      {ps ? formatCurrency(ps.totalSpent) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {ps ? ps.totalOrders : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {ps?.firstPurchaseDate ? formatDate(ps.firstPurchaseDate) : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(p.entered_at)}
                    </TableCell>
                    <TableCell>
                      {p.lead.phone && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={e => { e.stopPropagation(); onWhatsAppClick(p.lead.phone!); }}
                        >
                          <MessageCircle className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    isActive={pageNum === page}
                    onClick={() => setPage(pageNum)}
                    className="cursor-pointer"
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <p className="text-xs text-muted-foreground text-center">
        {filtered.length.toLocaleString('pt-BR')} leads
        {search ? ' encontrados' : ''}
        {' · Página '}{page} de {totalPages}
      </p>
    </div>
  );
};

export default BaseLeadsList;
