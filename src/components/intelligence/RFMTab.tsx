import React, { useState, useMemo, useCallback } from 'react';
import { Users, ChevronDown, ChevronUp, Info, Download, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatLocalDateTime } from '@/lib/localDate';
import { formatCurrency } from '@/lib/formatters';
import { downloadCsv } from '@/lib/exportCsv';
import { format } from 'date-fns';
import {
  useRFM,
  SEGMENT_CONFIG,
  SEGMENT_ORDER,
  type RFMSegment,
  type RFMCustomer,
} from '@/hooks/useRFM';
import { pct, ScoreDot, LoadingState } from './shared';
import RFMHeatmap from './RFMHeatmap';

function RFMSegmentBadge({ segment }: { segment: RFMSegment }) {
  const cfg = SEGMENT_CONFIG[segment];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badgeClass}`}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

export default function RFMTab() {
  const { data, isLoading } = useRFM();
  const [selectedSegment, setSelectedSegment] = useState<RFMSegment | 'all'>('all');
  const [sortBy, setSortBy] = useState<'monetary' | 'recency' | 'frequency'>('monetary');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedSegment, setExpandedSegment] = useState<RFMSegment | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [exportingDetailed, setExportingDetailed] = useState(false);

  const filteredCustomers = useMemo(() => {
    if (!data) return [];
    const list = selectedSegment === 'all'
      ? data.customers
      : data.customers.filter(c => c.segment === selectedSegment);
    return [...list].sort((a, b) => {
      const va = sortBy === 'monetary' ? a.monetary : sortBy === 'recency' ? a.recencyDays : a.frequency;
      const vb = sortBy === 'monetary' ? b.monetary : sortBy === 'recency' ? b.recencyDays : b.frequency;
      return sortAsc ? va - vb : vb - va;
    });
  }, [data, selectedSegment, sortBy, sortAsc]);

  const handleExport = useCallback(() => {
    if (!filteredCustomers.length) return;
    const columns = [
      { key: 'email', label: 'Email' },
      { key: 'nome', label: 'Nome' },
      { key: 'segmento', label: 'Segmento' },
      { key: 'recencia_dias', label: 'Recência (dias)' },
      { key: 'frequencia', label: 'Frequência' },
      { key: 'monetario', label: 'Monetário (R$)' },
      { key: 'score_r', label: 'Score R' },
      { key: 'score_f', label: 'Score F' },
      { key: 'score_m', label: 'Score M' },
      { key: 'primeira_compra', label: 'Primeira Compra' },
      { key: 'ultima_compra', label: 'Última Compra' },
    ];
    const rows = filteredCustomers.map(c => ({
      email: c.email,
      nome: c.name || '',
      segmento: SEGMENT_CONFIG[c.segment].label,
      recencia_dias: c.recencyDays,
      frequencia: c.frequency,
      monetario: c.monetary,
      score_r: c.rScore,
      score_f: c.fScore,
      score_m: c.mScore,
      primeira_compra: format(c.firstPurchaseAt, 'dd/MM/yyyy'),
      ultima_compra: format(c.lastPurchaseAt, 'dd/MM/yyyy'),
    }));
    const seg = selectedSegment === 'all' ? 'todos' : selectedSegment;
    const date = format(new Date(), 'yyyy-MM-dd');
    downloadCsv(rows, columns, `clientes-rfm-${seg}-${date}.csv`);
  }, [filteredCustomers, selectedSegment]);

  const handleExportDetailed = useCallback(async () => {
    setExportingDetailed(true);
    try {
      const PAGE_SIZE = 1000;
      let allRows: Record<string, string | number>[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error } = await supabase
          .from('customer_purchases')
          .select('product_name, gross_amount, net_amount, status, purchased_at, platform, offer_name, payment_method, installments, product_type, unified_customer_id, unified_customers!inner(primary_email, name)')
          .range(from, from + PAGE_SIZE - 1)
          .order('purchased_at', { ascending: false });

        if (error) throw error;
        if (!batch || batch.length === 0) { hasMore = false; break; }

        for (const row of batch as any[]) {
          const customer = row.unified_customers;
          allRows.push({
            email: customer?.primary_email || '',
            nome: customer?.name || '',
            produto: row.product_name || '',
            oferta: row.offer_name || '',
            valor_bruto: row.gross_amount ?? 0,
            valor_liquido: row.net_amount ?? 0,
            status: row.status || '',
            data_compra: formatLocalDateTime(row.purchased_at, 'dd/MM/yyyy HH:mm'),
            plataforma: row.platform || '',
            metodo_pagamento: row.payment_method || '',
            parcelas: row.installments ?? 0,
            tipo_produto: row.product_type || '',
          });
        }

        if (batch.length < PAGE_SIZE) { hasMore = false; } else { from += PAGE_SIZE; }
      }

      const columns = [
        { key: 'email', label: 'Email' },
        { key: 'nome', label: 'Nome' },
        { key: 'produto', label: 'Produto' },
        { key: 'oferta', label: 'Oferta' },
        { key: 'valor_bruto', label: 'Valor Bruto (R$)' },
        { key: 'valor_liquido', label: 'Valor Líquido (R$)' },
        { key: 'status', label: 'Status' },
        { key: 'data_compra', label: 'Data da Compra' },
        { key: 'plataforma', label: 'Plataforma' },
        { key: 'metodo_pagamento', label: 'Método de Pagamento' },
        { key: 'parcelas', label: 'Parcelas' },
        { key: 'tipo_produto', label: 'Tipo de Produto' },
      ];

      const date = format(new Date(), 'yyyy-MM-dd');
      downloadCsv(allRows, columns, `compras-detalhadas-${date}.csv`);
    } catch (err) {
      console.error('Erro ao exportar compras detalhadas:', err);
    } finally {
      setExportingDetailed(false);
    }
  }, []);

  if (isLoading) return <LoadingState message="Calculando segmentos RFM..." />;

  if (!data || data.totalCustomers === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
        <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Nenhum cliente com e-mail identificado ainda.</p>
        <p className="text-sm mt-1">Vendas com e-mail do cliente aparecerão aqui após os próximos webhooks.</p>
      </div>
    );
  }

  const champions = data.bySegment.champions;
  const atRisk = data.bySegment.at_risk;
  const lost = data.bySegment.lost;

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortAsc(p => !p);
    else { setSortBy(col); setSortAsc(false); }
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Clientes Analisados</p>
          <p className="text-3xl font-bold text-foreground">{data.totalCustomers.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-muted-foreground">Guru + Ticto unificados — base do RFM</p>
        </div>
        <div className="rounded-xl border border-yellow-200 dark:border-yellow-800/50 bg-card p-4 space-y-1">
          <p className="text-xs text-yellow-700 dark:text-yellow-400 uppercase font-semibold">🏆 Campeões</p>
          <p className="text-3xl font-bold text-foreground">{champions.count.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-muted-foreground">{pct(champions.pct)} da base · LTV médio {formatCurrency(champions.avgMonetary)}</p>
        </div>
        <div className="rounded-xl border border-orange-200 dark:border-orange-800/50 bg-card p-4 space-y-1">
          <p className="text-xs text-orange-700 dark:text-orange-400 uppercase font-semibold">⚠️ Em Risco</p>
          <p className="text-3xl font-bold text-foreground">{atRisk.count.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-muted-foreground">{pct(atRisk.pct)} da base · Último contato {atRisk.avgRecencyDays}d atrás</p>
        </div>
        <div className="rounded-xl border border-red-200 dark:border-red-800/50 bg-card p-4 space-y-1">
          <p className="text-xs text-red-700 dark:text-red-400 uppercase font-semibold">❌ Perdidos</p>
          <p className="text-3xl font-bold text-foreground">{lost.count.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-muted-foreground">{pct(lost.pct)} da base · Receita em risco {formatCurrency(lost.totalRevenue)}</p>
        </div>
      </div>

      {/* RFM 5x5 Heatmap */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-table-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Matriz RFM 5×5</span>
            <span className="text-xs text-muted-foreground">Recência × Frequência+Monetário</span>
          </div>
          <button
            onClick={() => setShowHeatmap(v => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border"
          >
            {showHeatmap ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        {showHeatmap && <RFMHeatmap customers={data.customers} />}
      </div>

      {/* Segment grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {SEGMENT_ORDER.map(seg => {
          const cfg = SEGMENT_CONFIG[seg];
          const stats = data.bySegment[seg];
          const isExpanded = expandedSegment === seg;
          return (
            <div
              key={seg}
              className={`rounded-xl border bg-card p-4 space-y-3 cursor-pointer hover:shadow-sm transition-shadow ${cfg.cardClass}`}
              onClick={() => {
                setExpandedSegment(isExpanded ? null : seg);
                setSelectedSegment(seg);
              }}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${cfg.colorClass}`}>
                  {cfg.emoji} {cfg.label}
                </span>
                <span className="text-2xl font-bold text-foreground">{stats.count}</span>
              </div>
              <div className="space-y-0.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>% da base</span>
                  <span className="font-medium text-foreground">{pct(stats.pct)}</span>
                </div>
                <div className="flex justify-between">
                  <span>LTV médio</span>
                  <span className="font-medium text-foreground">{formatCurrency(stats.avgMonetary)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Últ. compra</span>
                  <span className="font-medium text-foreground">{stats.avgRecencyDays}d atrás</span>
                </div>
              </div>
              {isExpanded && (
                <div className={`rounded-lg border p-2.5 text-xs ${cfg.badgeClass} space-y-1`}>
                  <p className="font-semibold">Ação recomendada:</p>
                  <p>{cfg.action}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Customer table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-table-header">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Clientes</span>
            <span className="text-xs text-muted-foreground">({filteredCustomers.length.toLocaleString('pt-BR')})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </button>
          <select
            value={selectedSegment}
            onChange={e => setSelectedSegment(e.target.value as RFMSegment | 'all')}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Todos os segmentos</option>
            {SEGMENT_ORDER.map(seg => (
              <option key={seg} value={seg}>
                {SEGMENT_CONFIG[seg].emoji} {SEGMENT_CONFIG[seg].label} ({data.bySegment[seg].count})
              </option>
            ))}
          </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-table-header border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Cliente</th>
                <th
                  className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase cursor-pointer hover:text-foreground select-none"
                  onClick={() => toggleSort('recency')}
                >
                  <span className="flex items-center justify-center gap-1">
                    Recência
                    {sortBy === 'recency' ? (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                  </span>
                </th>
                <th
                  className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase cursor-pointer hover:text-foreground select-none"
                  onClick={() => toggleSort('frequency')}
                >
                  <span className="flex items-center justify-center gap-1">
                    Compras
                    {sortBy === 'frequency' ? (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                  </span>
                </th>
                <th
                  className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase cursor-pointer hover:text-foreground select-none"
                  onClick={() => toggleSort('monetary')}
                >
                  <span className="flex items-center justify-end gap-1">
                    Total Gasto
                    {sortBy === 'monetary' ? (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
                  </span>
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase">R/F/M</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Segmento</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.slice(0, 200).map((c: RFMCustomer) => (
                <tr key={c.email} className="border-b border-border hover:bg-table-hover">
                  <td className="px-4 py-2.5">
                    <div className="text-sm font-medium text-foreground truncate max-w-[180px]">{c.name || '—'}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[180px]">{c.email}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center text-sm text-muted-foreground">{c.recencyDays}d atrás</td>
                  <td className="px-4 py-2.5 text-center font-medium">{c.frequency}</td>
                  <td className="px-4 py-2.5 text-right font-mono-value font-semibold">{formatCurrency(c.monetary)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <ScoreDot score={c.rScore} />
                      <ScoreDot score={c.fScore} />
                      <ScoreDot score={c.mScore} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <RFMSegmentBadge segment={c.segment} />
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    Nenhum cliente neste segmento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {filteredCustomers.length > 200 && (
            <div className="px-4 py-3 text-center text-xs text-muted-foreground border-t border-border">
              Exibindo 200 de {filteredCustomers.length.toLocaleString('pt-BR')} clientes — use o filtro de segmento para navegar
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 flex gap-3 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground">Como funciona o RFM:</strong> cada cliente recebe pontuação de 1-5 em{' '}
          <strong className="text-foreground">Recência</strong> (quando comprou pela última vez),{' '}
          <strong className="text-foreground">Frequência</strong> (quantas vezes comprou) e{' '}
          <strong className="text-foreground">Monetário</strong> (quanto gastou no total). Os segmentos são definidos pela combinação dessas notas.
          {' '}Os dados unificam Guru e Ticto via identidade de cliente — todos os compradores são incluídos.
        </div>
      </div>
    </div>
  );
}
