import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type DispatchStatus = 'aguardando_rastreio' | 'na_fila' | 'enviado' | 'falhou';

export interface OrderShipment {
  id: string;
  customer_purchase_id: string;
  unified_customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_cpf: string | null;
  product_name: string | null;
  quantity: number;
  purchased_at: string | null;
  planilha_shipped_at: string | null;
  source: string | null;
  frete_value: number | null;
  logistica_value: number | null;
  ship_street: string | null;
  ship_number: string | null;
  ship_complement: string | null;
  ship_neighborhood: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_zipcode: string | null;
  spedy_invoice_id: string | null;
  nf_number: string | null;
  nf_status: string | null;
  nf_xml_url: string | null;
  nf_pdf_url: string | null;
  nf_issued_at: string | null;
  tracking_code: string | null;
  carrier: string | null;
  tracking_status: string | null;
  tracking_last_event: string | null;
  tracking_event_at: string | null;
  tracking_delivered: boolean | null;
  dispatch_status: DispatchStatus;
  dispatch_channel: 'manychat' | 'uazapi' | null;
  dispatched_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ShipmentStatusFilter = DispatchStatus | 'all' | 'pendentes';

interface UseShipmentsParams {
  search: string;
  status: ShipmentStatusFilter;
  page: number;
  pageSize?: number;
  fromDate?: string | null;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/** Filtro por data efetiva: compra (purchased_at) ou, na falta, data da planilha. */
function dateOr(fromDate?: string | null): string | null {
  return fromDate ? `purchased_at.gte.${fromDate},planilha_shipped_at.gte.${fromDate}` : null;
}

export interface ShipmentsPage {
  shipments: OrderShipment[];
  total: number;
  totalPages: number;
}

/** Lista pedidos de envio paginados, com filtro por status de disparo e busca livre. */
export function useShipments({ search, status, page, pageSize = 50, fromDate, sortBy = 'created_at', sortDir = 'desc' }: UseShipmentsParams) {
  return useQuery({
    queryKey: ['order-shipments', search, status, page, pageSize, fromDate, sortBy, sortDir],
    queryFn: async (): Promise<ShipmentsPage> => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = (supabase as any)
        .from('order_shipments')
        .select('*', { count: 'exact' })
        .order(sortBy, { ascending: sortDir === 'asc', nullsFirst: false })
        .range(from, to);

      if (status === 'pendentes') {
        q = q.eq('dispatch_status', 'aguardando_rastreio');
      } else if (status !== 'all') {
        q = q.eq('dispatch_status', status);
      }

      const dOr = dateOr(fromDate);
      if (dOr) q = q.or(dOr);

      const term = search.trim();
      if (term) {
        const like = `%${term}%`;
        q = q.or(
          `customer_name.ilike.${like},customer_phone.ilike.${like},tracking_code.ilike.${like},nf_number.ilike.${like},customer_email.ilike.${like}`,
        );
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return {
        shipments: (data || []) as OrderShipment[],
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
      };
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  });
}

/** Contadores por status (abas) — respeitam o mesmo filtro de data. */
export function useShipmentCounts(fromDate?: string | null) {
  return useQuery({
    queryKey: ['order-shipments-counts', fromDate],
    queryFn: async () => {
      const statuses: DispatchStatus[] = ['aguardando_rastreio', 'na_fila', 'enviado', 'falhou'];
      const dOr = dateOr(fromDate);
      const entries = await Promise.all(
        statuses.map(async (s) => {
          let q = (supabase as any)
            .from('order_shipments')
            .select('id', { count: 'exact', head: true })
            .eq('dispatch_status', s);
          if (dOr) q = q.or(dOr);
          const { count } = await q;
          return [s, count || 0] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<DispatchStatus, number>;
    },
    refetchInterval: 30000,
  });
}

/** Correios usa o padrão AA999999999BR. */
export function inferCarrier(code: string): string | null {
  const c = code.trim().toUpperCase();
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(c)) return 'Correios';
  return null;
}

export function buildTrackingUrl(code: string | null, carrier: string | null): string | null {
  const c = (code || '').trim();
  if (!c) return null;
  if (!carrier || carrier === 'Correios') {
    return `https://rastreamento.correios.com.br/app/index.php?objeto=${encodeURIComponent(c)}`;
  }
  return null;
}

/**
 * Salva o código de rastreio e coloca o pedido na fila de disparo controlado.
 * O disparo é processado de forma escalonada pela edge function
 * `enqueue-tracking-dispatch` (cron), o que dá o ritmo anti-ban automaticamente.
 */
export function useSaveTracking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, trackingCode }: { id: string; trackingCode: string }) => {
      const code = trackingCode.trim();
      if (!code) throw new Error('Informe o código de rastreio');
      const carrier = inferCarrier(code);

      const { error } = await (supabase as any)
        .from('order_shipments')
        .update({ tracking_code: code, carrier, dispatch_status: 'na_fila' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-shipments'] });
      qc.invalidateQueries({ queryKey: ['order-shipments-counts'] });
      toast.success('Rastreio salvo — entrou na fila de disparo');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar rastreio'),
  });
}

/** Corrige/edita o endereço de entrega de um pedido. */
export function useUpdateShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<OrderShipment> }) => {
      const { error } = await (supabase as any).from('order_shipments').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-shipments'] });
      toast.success('Pedido atualizado');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao atualizar pedido'),
  });
}

/** Marca um pedido como "já enviado" manualmente (fora do sistema) — sem disparar. */
export function useMarkAsSent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('order_shipments')
        .update({
          dispatch_status: 'enviado',
          dispatched_at: new Date().toISOString(),
          dispatch_channel: null,
          notes: 'marcado manual: já enviado fora do sistema',
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-shipments'] });
      qc.invalidateQueries({ queryKey: ['order-shipments-counts'] });
      toast.success('Marcado como enviado');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao marcar'),
  });
}

/** Desfaz o "já enviei" — volta o pedido para a fila de pendentes. */
export function useRevertToPending() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('order_shipments')
        .update({
          dispatch_status: 'aguardando_rastreio',
          dispatched_at: null,
          dispatch_channel: null,
          notes: null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-shipments'] });
      qc.invalidateQueries({ queryKey: ['order-shipments-counts'] });
      toast.success('Voltou para pendente');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao reverter'),
  });
}
