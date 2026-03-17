import React from 'react';
import { Lead, LeadStagePosition } from '@/types/leadFunnels';
import { Mail, Phone, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface LeadCardProps {
  position: LeadStagePosition & { lead: Lead };
  onClick?: () => void;
}

const LeadCard: React.FC<LeadCardProps> = ({ position, onClick }) => {
  const lead = position.lead;

  return (
    <div
      onClick={onClick}
      className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
    >
      <p className="font-medium text-sm text-foreground truncate">
        {lead.name || lead.email || lead.phone || 'Lead sem nome'}
      </p>
      <div className="mt-1.5 space-y-1">
        {lead.email && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3 w-3" />
            <span className="truncate">{lead.email}</span>
          </div>
        )}
        {lead.phone && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            <span>{lead.phone}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{format(new Date(position.entered_at), 'dd/MM HH:mm')}</span>
        </div>
      </div>
      {lead.utm_source && (
        <span className="mt-2 inline-block text-[10px] px-1.5 py-0.5 bg-accent rounded text-accent-foreground">
          {lead.utm_source}
        </span>
      )}
    </div>
  );
};

export default LeadCard;
