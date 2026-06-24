import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  useShipments,
  useShipmentCounts,
  useSaveTracking,
  useUpdateShipment,
  useMarkAsSent,
  useRevertToPending,
  buildTrackingUrl,
  type OrderShipment,
  type ShipmentStatusFilter,
} from '@/hooks/useShipments';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import {
  Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext,
} from '@/components/ui/pagination';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import {
  Package, Search, Loader2, FileDown, FileText, Truck, Send, MapPin, ExternalLink, Pencil, HelpCircle,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { format } from 'date-fns';

type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

const TABS: { key: ShipmentStatusFilter; label: string }[] = [
  { key: 'pendentes', label: 'Pendentes' },
  { key: 'na_fila', label: 'Na fila' },
  { key: 'enviado', label: 'Enviados' },
  { key: 'falhou', label: 'Falhas' },
  { key: 'all', label: 'Todos' },
];

function statusBadge(s: OrderShipment['dispatch_status']) {
  const map: Record<string, string> = {
    aguardando_rastreio: 'bg-amber-500/15 text-amber-600',
    na_fila: 'bg-blue-500/15 text-blue-600',
    enviado: 'bg-green-500/15 text-green-600',
    falhou: 'bg-destructive/15 text-destructive',
  };
  const label: Record<string, string> = {
    aguardando_rastreio: 'Aguardando rastreio',
    na_fila: 'Na fila',
    enviado: 'Enviado',
    falhou: 'Falhou',
  };
  return <Badge className={`${map[s]} border-transparent whitespace-nowrap`}>{label[s] || s}</Badge>;
}

function trackingBadge(s: OrderShipment) {
  if (!s.tracking_code) return <span className="text-xs text-muted-foreground">—</span>;
  const st = s.tracking_status || 'aguardando';
  const color: Record<string, string> = {
    aguardando: 'bg-muted text-muted-foreground',
    postado: 'bg-blue-500/15 text-blue-600',
    em_transito: 'bg-blue-500/15 text-blue-600',
    saiu_entrega: 'bg-amber-500/15 text-amber-600',
    aguardando_retirada: 'bg-amber-500/15 text-amber-600',
    entregue: 'bg-green-500/15 text-green-600',
    devolvido: 'bg-destructive/15 text-destructive',
  };
  const label: Record<string, string> = {
    aguardando: 'Aguardando',
    postado: 'Postado',
    em_transito: 'Em trânsito',
    saiu_entrega: 'Saiu p/ entrega',
    aguardando_retirada: 'Aguard. retirada',
    entregue: 'Entregue',
    devolvido: 'Devolvido',
  };
  return (
    <Badge className={`${color[st] || color.aguardando} border-transparent whitespace-nowrap`} title={s.tracking_last_event || ''}>
      {label[st] || st}
    </Badge>
  );
}

function addressSummary(s: OrderShipment): string {
  const parts = [
    [s.ship_street, s.ship_number].filter(Boolean).join(', '),
    s.ship_neighborhood,
    [s.ship_city, s.ship_state].filter(Boolean).join('/'),
    s.ship_zipcode,
  ].filter(Boolean);
  return parts.join(' · ') || '—';
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : format(d, 'dd/MM/yyyy');
}

/* ── Cabeçalho ordenável ── */
function SortHead({ col, label, sortBy, sortDir, onSort, className }: {
  col: string; label: string; sortBy: string; sortDir: SortDir; onSort: (c: string) => void; className?: string;
}) {
  const active = sortBy === col;
  return (
    <TableHead className={className}>
      <button onClick={() => onSort(col)} className="flex items-center gap-1 hover:text-foreground transition-colors">
        {label}
        {active
          ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </button>
    </TableHead>
  );
}

/* ── Célula de valor editável (Frete / Logística) ── */
function MoneyCell({ shipment, field }: { shipment: OrderShipment; field: 'frete_value' | 'logistica_value' }) {
  const update = useUpdateShipment();
  const initial = shipment[field] != null ? String(shipment[field]) : '';
  const [val, setVal] = useState(initial);
  useEffect(() => { setVal(shipment[field] != null ? String(shipment[field]) : ''); }, [shipment[field]]);

  const save = () => {
    const trimmed = val.trim().replace(',', '.');
    const num = trimmed === '' ? null : Number(trimmed);
    if (num !== null && isNaN(num)) { setVal(initial); return; }
    if ((shipment[field] ?? null) === num) return;
    update.mutate({ id: shipment.id, patch: { [field]: num } as Partial<OrderShipment> });
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">R$</span>
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder="0,00"
        inputMode="decimal"
        className="h-8 w-20 text-xs"
      />
    </div>
  );
}

/* ── Linha da tabela ── */
function ShipmentRow({ shipment, onEditAddress }: { shipment: OrderShipment; onEditAddress: (s: OrderShipment) => void }) {
  const [code, setCode] = useState('');
  const saveTracking = useSaveTracking();
  const markSent = useMarkAsSent();
  const revert = useRevertToPending();
  const trackingUrl = buildTrackingUrl(shipment.tracking_code, shipment.carrier);

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(shipment.purchased_at || shipment.planilha_shipped_at)}</TableCell>
      <TableCell className="whitespace-nowrap font-medium text-foreground">
        {shipment.customer_name || '—'}
        {shipment.source === 'planilha' && (
          <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground align-middle" title="Importado da planilha (histórico)">
            planilha
          </span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{shipment.customer_phone || '—'}</TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{shipment.customer_cpf || '—'}</TableCell>
      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground" title={shipment.customer_email || ''}>
        {shipment.customer_email || '—'}
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <span className="text-foreground">{shipment.product_name || '—'}</span>
        <span className="ml-1 text-xs text-muted-foreground">×{shipment.quantity}</span>
      </TableCell>

      <TableCell className="max-w-[240px]">
        <div className="flex items-start gap-1.5">
          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground line-clamp-2">{addressSummary(shipment)}</span>
          <button
            onClick={() => onEditAddress(shipment)}
            className="text-muted-foreground hover:text-foreground shrink-0"
            title="Editar endereço"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      </TableCell>

      <TableCell><MoneyCell shipment={shipment} field="frete_value" /></TableCell>
      <TableCell><MoneyCell shipment={shipment} field="logistica_value" /></TableCell>

      <TableCell className="whitespace-nowrap">
        {shipment.nf_number ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">NF {shipment.nf_number}</span>
            {shipment.nf_pdf_url && (
              <a href={shipment.nf_pdf_url} target="_blank" rel="noreferrer" title="Baixar PDF (DANFE)">
                <Button size="sm" variant="outline" className="h-7 px-2"><FileText className="h-3.5 w-3.5" /></Button>
              </a>
            )}
            {shipment.nf_xml_url && (
              <a href={shipment.nf_xml_url} target="_blank" rel="noreferrer" title="Baixar XML">
                <Button size="sm" variant="outline" className="h-7 px-2"><FileDown className="h-3.5 w-3.5" /></Button>
              </a>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">sem nota</span>
        )}
      </TableCell>

      <TableCell className="min-w-[270px]">
        {shipment.tracking_code ? (
          <div className="flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono text-xs">{shipment.tracking_code}</span>
            {trackingUrl && (
              <a href={trackingUrl} target="_blank" rel="noreferrer" title="Rastrear">
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </a>
            )}
          </div>
        ) : shipment.dispatch_status === 'enviado' ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="italic">enviado manualmente</span>
            <button
              onClick={() => revert.mutate(shipment.id)}
              className="text-primary hover:underline"
              title="Voltar para a fila de pendentes"
            >
              voltar p/ pendente
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Código de rastreio"
              className="h-8 text-xs font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && code.trim()) saveTracking.mutate({ id: shipment.id, trackingCode: code });
              }}
            />
            <Button
              size="sm"
              className="h-8 px-2.5 gap-1"
              disabled={!code.trim() || saveTracking.isPending}
              onClick={() => saveTracking.mutate({ id: shipment.id, trackingCode: code })}
              title="Salvar código e disparar no WhatsApp"
            >
              {saveTracking.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs text-muted-foreground shrink-0"
              disabled={markSent.isPending}
              onClick={() => markSent.mutate(shipment.id)}
              title="Já enviei à mão — marcar como enviado sem disparar"
            >
              Já enviei
            </Button>
          </div>
        )}
      </TableCell>

      <TableCell>{trackingBadge(shipment)}</TableCell>
      <TableCell>{statusBadge(shipment.dispatch_status)}</TableCell>
    </TableRow>
  );
}

/* ── Legenda fixa dos status ── */
function LegendItem({ cls, label, desc }: { cls: string; label: string; desc?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Badge className={`${cls} border-transparent shrink-0`}>{label}</Badge>
      {desc && <span className="text-muted-foreground">{desc}</span>}
    </div>
  );
}

function LegendContent() {
  return (
    <div className="space-y-3 text-xs">
      <div>
        <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Disparo (WhatsApp)</p>
        <div className="space-y-1.5">
          <LegendItem cls="bg-amber-500/15 text-amber-600" label="Aguardando rastreio" desc="pago, falta colar o código" />
          <LegendItem cls="bg-blue-500/15 text-blue-600" label="Na fila" desc="vai disparar no WhatsApp" />
          <LegendItem cls="bg-green-500/15 text-green-600" label="Enviado" desc="rastreio enviado ao cliente" />
          <LegendItem cls="bg-destructive/15 text-destructive" label="Falhou" desc="erro no envio" />
        </div>
      </div>
      <div>
        <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Entrega (Correios)</p>
        <div className="space-y-1.5">
          <LegendItem cls="bg-blue-500/15 text-blue-600" label="Em trânsito" />
          <LegendItem cls="bg-amber-500/15 text-amber-600" label="Saiu p/ entrega" />
          <LegendItem cls="bg-green-500/15 text-green-600" label="Entregue" />
          <LegendItem cls="bg-destructive/15 text-destructive" label="Devolvido" />
        </div>
      </div>
    </div>
  );
}

/* ── Modal de edição de endereço ── */
function AddressDialog({ shipment, onClose }: { shipment: OrderShipment | null; onClose: () => void }) {
  const update = useUpdateShipment();
  const [form, setForm] = useState<Partial<OrderShipment>>({});

  useEffect(() => {
    if (shipment) {
      setForm({
        ship_street: shipment.ship_street, ship_number: shipment.ship_number,
        ship_complement: shipment.ship_complement, ship_neighborhood: shipment.ship_neighborhood,
        ship_city: shipment.ship_city, ship_state: shipment.ship_state, ship_zipcode: shipment.ship_zipcode,
      });
    }
  }, [shipment]);

  const field = (key: keyof OrderShipment, label: string, cls = '') => (
    <div className={cls}>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <Input
        value={(form[key] as string) || ''}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="h-9"
      />
    </div>
  );

  return (
    <Dialog open={!!shipment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Endereço de entrega — {shipment?.customer_name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-6 gap-3">
          {field('ship_street', 'Rua', 'col-span-4')}
          {field('ship_number', 'Número', 'col-span-2')}
          {field('ship_complement', 'Complemento', 'col-span-3')}
          {field('ship_neighborhood', 'Bairro', 'col-span-3')}
          {field('ship_city', 'Cidade', 'col-span-3')}
          {field('ship_state', 'UF', 'col-span-1')}
          {field('ship_zipcode', 'CEP', 'col-span-2')}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={update.isPending}
            onClick={() => shipment && update.mutate({ id: shipment.id, patch: form }, { onSuccess: onClose })}
          >
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Rastreios: React.FC = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ShipmentStatusFilter>('pendentes');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState('2026-06-10');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [editing, setEditing] = useState<OrderShipment | null>(null);

  const onSort = (col: string) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  };

  // Scroll horizontal sincronizado (barra no topo + a nativa embaixo)
  const tableRef = useRef<HTMLTableElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [scrollW, setScrollW] = useState(1600);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const handleTab = (key: ShipmentStatusFilter) => { setStatus(key); setPage(1); };

  const { data, isLoading, isFetching } = useShipments({ search: debounced, status, page, pageSize: PAGE_SIZE, fromDate: fromDate || null, sortBy, sortDir });
  const { data: counts } = useShipmentCounts(fromDate || null);
  const shipments = data?.shipments ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  // Realtime: fila atualiza sozinha quando chega pedido novo ou muda status
  useEffect(() => {
    const channel = supabase
      .channel('order-shipments-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_shipments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['order-shipments'] });
        queryClient.invalidateQueries({ queryKey: ['order-shipments-counts'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Sincroniza a barra de rolagem do topo com o container da tabela
  useEffect(() => {
    const container = tableRef.current?.parentElement; // div.overflow-auto do <Table>
    if (!container) return;
    const measure = () => setScrollW(container.scrollWidth);
    measure();
    const onScroll = () => { if (topScrollRef.current) topScrollRef.current.scrollLeft = container.scrollLeft; };
    container.addEventListener('scroll', onScroll);
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => { container.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, [shipments.length, isLoading]);

  const onTopScroll = () => {
    const container = tableRef.current?.parentElement;
    if (container && topScrollRef.current) container.scrollLeft = topScrollRef.current.scrollLeft;
  };

  const tabCount = useMemo(() => ({
    pendentes: counts?.aguardando_rastreio ?? 0,
    na_fila: counts?.na_fila ?? 0,
    enviado: counts?.enviado ?? 0,
    falhou: counts?.falhou ?? 0,
  }), [counts]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Package className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Rastreios</h1>
          <p className="text-sm text-muted-foreground">
            Cole o código de rastreio dos pedidos pagos — o disparo no WhatsApp é automático e controlado.
          </p>
        </div>
      </div>

      {/* Abas de status */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const count = (tabCount as Record<string, number>)[t.key];
          return (
            <button
              key={t.key}
              onClick={() => handleTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                status === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {t.label}
              {typeof count === 'number' && t.key !== 'all' && (
                <span className="ml-1.5 text-xs opacity-80">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Busca + legenda */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone, e-mail, rastreio ou NF..."
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
          Desde
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <HoverCard openDelay={80} closeDelay={80}>
          <HoverCardTrigger asChild>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors shrink-0">
              <HelpCircle className="h-4 w-4" /> Legenda
            </button>
          </HoverCardTrigger>
          <HoverCardContent align="end" className="w-72">
            <LegendContent />
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Barra de rolagem horizontal no topo (sincronizada com a tabela) */}
      {!isLoading && shipments.length > 0 && (
        <div
          ref={topScrollRef}
          onScroll={onTopScroll}
          className="overflow-x-auto [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent"
        >
          <div style={{ width: scrollW }} className="h-px" />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : shipments.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Nenhum pedido {status === 'pendentes' ? 'pendente de rastreio' : 'encontrado'}.
            </div>
          ) : (
            <Table ref={tableRef} className="min-w-[1600px]">
              <TableHeader>
                <TableRow>
                  <SortHead col="purchased_at" label="Data" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHead col="customer_name" label="Cliente" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHead col="customer_phone" label="Telefone" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHead col="customer_cpf" label="Documento" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHead col="customer_email" label="Email" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHead col="product_name" label="Produto" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHead col="ship_city" label="Endereço" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHead col="frete_value" label="Frete" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHead col="logistica_value" label="Logística" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHead col="nf_number" label="Nota Fiscal" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHead col="tracking_code" label="Rastreio" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHead col="tracking_status" label="Entrega" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHead col="dispatch_status" label="Status" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.map((s) => (
                  <ShipmentRow key={s.id} shipment={s} onEditAddress={setEditing} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Rodapé: contagem + paginação */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          {isFetching && !isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
          {total > 0 ? `${total} pedido${total > 1 ? 's' : ''} · página ${page} de ${totalPages}` : ''}
        </p>
        {totalPages > 1 && (
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => { e.preventDefault(); if (page > 1) setPage((p) => p - 1); }}
                  className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="px-3 text-sm text-muted-foreground">{page} / {totalPages}</span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage((p) => p + 1); }}
                  className={page >= totalPages ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>

      <AddressDialog shipment={editing} onClose={() => setEditing(null)} />
    </div>
  );
};

export default Rastreios;
