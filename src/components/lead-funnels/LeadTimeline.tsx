import React from 'react';
import { useLeadEvents } from '@/hooks/useLeads';
import { format } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Lead } from '@/types/leadFunnels';
import { Activity, Mail, Phone, Tag } from 'lucide-react';

interface LeadTimelineProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
}

const LeadTimeline: React.FC<LeadTimelineProps> = ({ lead, open, onClose }) => {
  const { data: events = [] } = useLeadEvents(lead?.id ?? null);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[400px] sm:w-[450px]">
        <SheetHeader>
          <SheetTitle className="text-foreground">
            {lead?.name || 'Lead'}
          </SheetTitle>
        </SheetHeader>

        {lead && (
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            {lead.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" /> {lead.email}
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" /> {lead.phone}
              </div>
            )}
            {lead.utm_source && (
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4" /> {lead.utm_source}/{lead.utm_medium}
              </div>
            )}
          </div>
        )}

        <div className="mt-6">
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4" /> Timeline de Eventos
          </h4>
          <div className="space-y-3">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum evento registrado</p>
            ) : (
              events.map(ev => (
                <div key={ev.id} className="flex gap-3">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{ev.event_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(ev.created_at), 'dd/MM/yyyy HH:mm:ss')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default LeadTimeline;
