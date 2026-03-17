import React from 'react';
import { Lead, LeadStagePosition } from '@/types/leadFunnels';
import { Mail, Phone, Clock, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { useLeadPurchases } from '@/hooks/useLeadPurchases';

interface LeadCardProps {
  position: LeadStagePosition & { lead: Lead };
  onClick?: () => void;
}

const LeadCard: React.FC<LeadCardProps> = ({ position, onClick }) => {
  const lead = position.lead;
  const { data: purchaseData } = useLeadPurchases(lead.email, lead.phone);

  const initials = (lead.name || lead.email || '?')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('');

  return (
    <div
      onClick={onClick}
      className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground truncate">
            {lead.name || lead.email || lead.phone || 'Lead sem nome'}
          </p>

          <div className="mt-1 space-y-0.5">
            {lead.email && (
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
        {lead.utm_source && (
          <span className="text-[10px] px-1.5 py-0.5 bg-accent rounded text-accent-foreground">
            {lead.utm_source}
          </span>
        )}
      </div>
    </div>
  );
};

export default LeadCard;
