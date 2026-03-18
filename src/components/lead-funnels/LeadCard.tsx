import React from 'react';
import { Lead, LeadStagePosition } from '@/types/leadFunnels';
import { Mail, Phone, Clock, DollarSign, GripVertical } from 'lucide-react';
import { format } from 'date-fns';
import { useLeadPurchases } from '@/hooks/useLeadPurchases';
import { useDraggable } from '@dnd-kit/core';

interface LeadCardProps {
  position: LeadStagePosition & { lead: Lead };
  onClick?: () => void;
  isDragging?: boolean;
  isRevenue?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  authorized: 'Aprovado', approved: 'Aprovado', paid: 'Aprovado', aprovada: 'Aprovado',
  waiting_payment: 'Aguardando', pending: 'Aguardando', pix_created: 'PIX Gerado',
  bank_slip_created: 'Boleto', billet_printed: 'Boleto',
  rejected: 'Rejeitado', refused: 'Rejeitado', rejeitada: 'Rejeitado',
  canceled: 'Cancelado', cancelled: 'Cancelado', cancelada: 'Cancelado',
  expired: 'Expirado', expirada: 'Expirado',
  refunded: 'Reembolsado', reembolsada: 'Reembolsado',
  chargeback: 'Chargeback', open: 'Checkout',
};

function friendlyStatus(status: string): string {
  return STATUS_LABELS[status.toLowerCase().trim()] || status;
}

const LeadCard: React.FC<LeadCardProps> = ({ position, onClick, isDragging, isRevenue = true }) => {
  const lead = position.lead;
  const { data: purchaseData } = useLeadPurchases(lead.email, lead.phone);
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
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          onClick={e => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Avatar */}
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
            {lead.phone && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="h-3 w-3 shrink-0" />
                <span>{lead.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{format(new Date(position.entered_at), 'dd/MM HH:mm')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Purchase summary row */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {purchaseData && purchaseData.totalOrders > 0 && (
          <>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              <DollarSign className="h-3 w-3" />
              {purchaseData.totalSpent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              ×{purchaseData.totalOrders}
            </span>
          </>
        )}
        {/* Metadata from import: product & amount */}
        {!purchaseData?.totalOrders && lead.metadata?.product_name && (
          <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-medium truncate max-w-[140px]">
            {lead.metadata.product_name as string}
          </span>
        )}
        {!purchaseData?.totalOrders && lead.metadata?.amount && (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded ${
            isRevenue
              ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
              : 'text-destructive bg-destructive/10'
          }`}>
            <DollarSign className="h-3 w-3" />
            {isRevenue ? '' : '-'}{Number(lead.metadata.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        )}
        {!purchaseData?.totalOrders && lead.metadata?.status && (
          <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
            {friendlyStatus(lead.metadata.status as string)}
          </span>
        )}
      </div>
    </div>
  );
};

export default LeadCard;
