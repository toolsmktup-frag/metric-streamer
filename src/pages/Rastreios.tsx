import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  useShipments,
  useShipmentCounts,
  useSaveTracking,
  useUpdateShipment,
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Package, Search, Loader2, FileDown, FileText, Truck, Send, MapPin, ExternalLink, Pencil,
} from 'lucide-react';

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
  return <Badge className={`${map[s]} border-transparent`}>{label[s] || s}</Badge>;
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
    <Badge className={`${color[st] || color.aguardando} border-transparent`} title={s.tracking_last_event || ''}>
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

/* ── Linha da tabela ── */
function ShipmentRow({ shipment, onEditAddress }: { shipment: OrderShipment; onEditAddress: (s: OrderShipment) => void }) {
  const [code, setCode] = useState('');
  const saveTracking = useSaveTracking();
  const trackingUrl = buildTrackingUrl(shipment.tracking_code, shipment.carrier);

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium text-foreground">{shipment.customer_name || '—'}</div>
        <div className="text-xs text-muted-foreground">{shipment.customer_phone || 'sem telefone'}</div>
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <span className="text-foreground">{shipment.product_name || '—'}</span>
        <span className="ml-1 text-xs text-muted-foreground">×{shipment.quantity}</span>
      </TableCell>

      <TableCell className="max-w-[260px]">
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

      <TableCell className="min-w-[230px]">
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
            >
              {saveTracking.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}
      </TableCell>

      <TableCell>{trackingBadge(shipment)}</TableCell>

      <TableCell>{statusBadge(shipment.dispatch_status)}</TableCell>
    </TableRow>
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
  const [editing, setEditing] = useState<OrderShipment | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: shipments = [], isLoading, isFetching } = useShipments({ search: debounced, status });
  const { data: counts } = useShipmentCounts();

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
              onClick={() => setStatus(t.key)}
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

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, telefone, rastreio ou NF..."
          className="pl-9"
        />
      </div>

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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Endereço</TableHead>
                  <TableHead>Nota Fiscal</TableHead>
                  <TableHead>Rastreio</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead>Status</TableHead>
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

      {isFetching && !isLoading && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> atualizando…
        </p>
      )}

      <AddressDialog shipment={editing} onClose={() => setEditing(null)} />
    </div>
  );
};

export default Rastreios;
