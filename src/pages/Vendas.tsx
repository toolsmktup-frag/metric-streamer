import React, { useState, useMemo } from 'react';
import { formatCurrency } from '@/lib/formatters';
import { Search, CheckCircle, Clock, XCircle, RefreshCcw, AlertCircle, CreditCard, QrCode, FileText } from 'lucide-react';
import { useTictoTransactions } from '@/hooks/useTictoData';
import DateRangePicker from '@/components/dashboard/DateRangePicker';

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  authorized: { label: 'Aprovada', icon: CheckCircle, className: 'bg-primary/10 text-kpi-positive' },
  waiting_payment: { label: 'Aguardando', icon: Clock, className: 'bg-accent text-kpi-warning' },
  pix_created: { label: 'Pix Gerado', icon: QrCode, className: 'bg-accent text-kpi-warning' },
  bank_slip_created: { label: 'Boleto Impresso', icon: FileText, className: 'bg-accent text-kpi-warning' },
  refunded: { label: 'Reembolso', icon: XCircle, className: 'bg-destructive/10 text-kpi-negative' },
  chargeback: { label: 'Chargeback', icon: AlertCircle, className: 'bg-destructive/10 text-kpi-negative' },
  refused: { label: 'Recusada', icon: XCircle, className: 'bg-destructive/10 text-kpi-negative' },
  abandoned_cart: { label: 'Carrinho Abandonado', icon: Clock, className: 'bg-muted text-muted-foreground' },
};

const paymentMethods: Record<string, { label: string; icon: any }> = {
  credit_card: { label: 'Cartão', icon: CreditCard },
  pix: { label: 'Pix', icon: QrCode },
  bank_slip: { label: 'Boleto', icon: FileText },
};

export default function Vendas() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { data: transactions = [], isLoading } = useTictoTransactions();

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          t.product_name?.toLowerCase().includes(s) ||
          t.customer_name?.toLowerCase().includes(s) ||
          t.customer_email?.toLowerCase().includes(s) ||
          t.order_hash?.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [transactions, statusFilter, search]);

  const totals = useMemo(() => {
    const approved = filtered.filter(t => t.status === 'authorized');
    return {
      count: approved.length,
      revenue: approved.reduce((s, t) => s + (t.paid_amount / 100), 0),
    };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vendas</h1>
          <p className="text-sm text-muted-foreground">
            {totals.count} vendas aprovadas · {formatCurrency(totals.revenue)} faturado
          </p>
        </div>
        <DateRangePicker />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar produto, cliente, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">Todos Status</option>
          <option value="authorized">Aprovada</option>
          <option value="waiting_payment">Aguardando</option>
          <option value="pix_created">Pix Gerado</option>
          <option value="bank_slip_created">Boleto Impresso</option>
          <option value="refunded">Reembolso</option>
          <option value="chargeback">Chargeback</option>
          <option value="refused">Recusada</option>
        </select>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Carregando vendas...
        </div>
      ) : filtered.length > 0 ? (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-table-header border-b border-border">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Data</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Produto</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Cliente</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Valor</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Pagamento</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Status</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Campanha</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase">Atribuição</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => {
                  const sc = statusConfig[tx.status] || { label: tx.status, icon: Clock, className: 'bg-muted text-muted-foreground' };
                  const StatusIcon = sc.icon;
                  const pm = paymentMethods[tx.payment_method] || { label: tx.payment_method, icon: CreditCard };
                  const PayIcon = pm.icon;
                  
                  return (
                    <tr key={tx.id} className="border-b border-border hover:bg-table-hover transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap font-mono-value text-xs">
                        {tx.order_date ? new Date(tx.order_date).toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="px-3 py-2.5 max-w-[180px] truncate font-medium" title={tx.product_name || ''}>
                        {tx.product_name || tx.offer_name || '-'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="max-w-[160px]">
                          <div className="truncate font-medium text-xs" title={tx.customer_name || ''}>{tx.customer_name || '-'}</div>
                          <div className="truncate text-xs text-muted-foreground" title={tx.customer_email || ''}>{tx.customer_email || ''}</div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono-value font-semibold">{formatCurrency(tx.paid_amount / 100)}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <PayIcon className="h-3 w-3" />{pm.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.className}`}>
                          <StatusIcon className="h-3 w-3" />{sc.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs max-w-[160px] truncate text-muted-foreground" title={tx.meta_campaign_name || tx.utm_campaign || ''}>
                        {tx.meta_campaign_name || tx.utm_campaign || '-'}
                      </td>
                      <td className="px-3 py-2.5">
                        {tx.is_paid_traffic ? (
                          <CheckCircle className="h-4 w-4 text-kpi-positive" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Orgânico</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhuma venda encontrada. Configure o webhook de vendas na página de Integrações.
        </div>
      )}
    </div>
  );
}
