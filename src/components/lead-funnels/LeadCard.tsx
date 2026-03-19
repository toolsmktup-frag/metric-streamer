import React from 'react';
import { Lead, LeadStagePosition } from '@/types/leadFunnels';
import { Mail, Phone, Clock, DollarSign, GripVertical, MessageCircle, ShoppingBag, CalendarClock, Timer, EyeOff } from 'lucide-react';
import { PurchaseSummary } from '@/hooks/useBulkLeadPurchases';
import { useDraggable } from '@dnd-kit/core';
import { formatLocalDateTime } from '@/lib/localDate';
import { differenceInDays } from 'date-fns';
import type { RecontactInfo } from '@/hooks/useRecontactDeadlines';

interface LeadCardProps {
  position: LeadStagePosition & { lead: Lead };
  onClick?: () => void;
  onWhatsAppClick?: (phone: string) => void;
  isDragging?: boolean;
  isRevenue?: boolean;
  purchaseSummary?: PurchaseSummary;
  recontactInfo?: RecontactInfo;
  hideValues?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  authorized: 'Aprovado', approved: 'Aprovado', paid: 'Aprovado', aprovada: 'Aprovado', Aprovada: 'Aprovado',
  waiting_payment: 'Aguardando', pending: 'Aguardando', pix_created: 'PIX Gerado',
  bank_slip_created: 'Boleto', bank_slip_delayed: 'Boleto', billet_printed: 'Boleto',
  rejected: 'Rejeitado', refused: 'Rejeitado', rejeitada: 'Rejeitado',
  canceled: 'Cancelado', cancelled: 'Cancelado', cancelada: 'Cancelado',
  expired: 'Expirado', expirada: 'Expirado',
  refunded: 'Reembolsado', reembolsada: 'Reembolsado',
  chargeback: 'Chargeback', open: 'Checkout',
};

function friendlyStatus(status: string): string {
  return STATUS_LABELS[status.toLowerCase().trim()] || status;
}

const LeadCard: React.FC<LeadCardProps> = ({ position, onClick, onWhatsAppClick, isDragging, isRevenue = true, purchaseSummary, recontactInfo, hideValues }) => {
  const lead = position.lead;
  // Fallback: try metadata for phone if lead.phone is empty
  const leadPhone = lead.phone || (lead.metadata?.phone as string) || (lead.metadata?.cel as string) || (lead.metadata?.telefone as string) || null;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: position.id,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const initials = (lead.name || lead.email || '?')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('');

  const hasLTV = purchaseSummary && purchaseSummary.totalOrders > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card border border-border rounded-lg p-3 cursor-pointer hover:shadow-md transition-all ${
        isDragging ? 'opacity-30 shadow-none' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2.5">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          onClick={e => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground truncate">
            {lead.name || lead.email || lead.phone || 'Lead sem nome'}
          </p>

          <div className="mt-1 space-y-0.5">
            {lead.email && lead.email.includes('@') && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{lead.email}</span>
              </div>
            )}
            {leadPhone && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="h-3 w-3 shrink-0" />
                <span>{leadPhone}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{formatLocalDateTime(position.entered_at, 'dd/MM HH:mm')}</span>
            </div>
          </div>
        </div>

        {/* WhatsApp shortcut */}
        {leadPhone && onWhatsAppClick && (
          <button
            onClick={e => { e.stopPropagation(); onWhatsAppClick(leadPhone); }}
            className="ml-auto shrink-0 p-1.5 rounded-md bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
            title="Abrir chat no WhatsApp"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* LTV prominente */}
      {hasLTV && (
        <div className="mt-1.5 flex items-center gap-2 flex-wrap ml-[42px]">
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
            <DollarSign className="h-3.5 w-3.5" />
            {purchaseSummary!.totalSpent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            <ShoppingBag className="h-3 w-3" />
            ×{purchaseSummary!.totalOrders}
          </span>
          {purchaseSummary!.firstPurchaseDate && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              <CalendarClock className="h-3 w-3" />
              {differenceInDays(new Date(), new Date(purchaseSummary!.firstPurchaseDate))}d
            </span>
          )}
        </div>
      )}

      {/* Recontact countdown badge */}
      {recontactInfo && (
        <div className="mt-1.5 ml-[42px]">
          <span
            className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md ${
              recontactInfo.daysRemaining < 0
                ? 'bg-destructive/15 text-destructive'
                : recontactInfo.daysRemaining <= 7
                ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            }`}
            title={`Recontato: ${recontactInfo.productName} — ${recontactInfo.recontactDays}d ciclo`}
          >
            <Timer className="h-3.5 w-3.5" />
            {recontactInfo.daysRemaining < 0
              ? `${recontactInfo.daysRemaining}d 🔥`
              : recontactInfo.daysRemaining <= 7
              ? `${recontactInfo.daysRemaining}d ⚠️`
              : `${recontactInfo.daysRemaining}d`}
          </span>
        </div>
      )}

      {/* Context badges (produto/status) */}
      {(lead.metadata?.product_name || lead.metadata?.status) && (
        <div className="mt-1 flex items-center gap-1.5 flex-wrap ml-[42px]">
          {lead.metadata?.product_name && (
            <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-medium truncate max-w-[140px]">
              {lead.metadata.product_name as string}
            </span>
          )}
          {lead.metadata?.status && (
            <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
              {friendlyStatus(lead.metadata.status as string)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default LeadCard;
