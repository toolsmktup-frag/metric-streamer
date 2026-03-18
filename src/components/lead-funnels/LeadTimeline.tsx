import React from 'react';
import { useLeadEvents } from '@/hooks/useLeads';
import { useLeadPurchases, useLeadFunnelJourney } from '@/hooks/useLeadPurchases';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet';
import { Lead } from '@/types/leadFunnels';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Mail, Phone, ShoppingCart, DollarSign, MapPin, Activity, UserPlus, CreditCard } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

interface LeadTimelineProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function getEventIcon(eventName: string) {
  if (eventName === 'purchase' || eventName === 'compra') return ShoppingCart;
  if (eventName === 'registration' || eventName === 'cadastro' || eventName === 'lead_created') return UserPlus;
  return Activity;
}

const LeadTimeline: React.FC<LeadTimelineProps> = ({ lead, open, onClose }) => {
  const { data: events = [] } = useLeadEvents(lead?.id ?? null);
  const { data: purchaseData } = useLeadPurchases(lead?.email ?? null, lead?.phone ?? null);
  const { data: journey = [] } = useLeadFunnelJourney(lead?.id ?? null);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[440px] sm:w-[500px] overflow-y-auto p-0">
        {lead && (
          <div className="flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-border">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                    {getInitials(lead.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-foreground truncate">{lead.name || 'Lead sem nome'}</h3>
                  <div className="flex flex-col gap-0.5 mt-1">
                    {lead.phone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Phone className="h-3 w-3" /> {lead.phone}
                      </span>
                    )}
                    {lead.email && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Mail className="h-3 w-3" /> {lead.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {journey.length > 0 && (
                  <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                    {(journey[0] as any)?.funnel?.name || 'Funil'}
                  </Badge>
                )}
                {journey.length > 0 && (
                  <Badge className="text-[10px] px-2 py-0.5" style={{
                    backgroundColor: `${(journey[0] as any)?.stage?.color || 'hsl(var(--primary))'}20`,
                    color: (journey[0] as any)?.stage?.color || 'hsl(var(--primary))',
                    border: 'none',
                  }}>
                    {(journey[0] as any)?.stage?.name || 'Etapa'}
                  </Badge>
                )}
                {lead.utm_source && (
                  <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                    {lead.utm_source}{lead.utm_medium ? `/${lead.utm_medium}` : ''}
                  </Badge>
                )}
              </div>
            </div>

            {/* Compras */}
            {purchaseData && purchaseData.totalOrders > 0 && (
              <div className="p-5 border-b border-border">
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingCart className="h-4 w-4 text-foreground" />
                  <span className="text-sm font-semibold text-foreground">Compras</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {purchaseData.totalOrders} {purchaseData.totalOrders === 1 ? 'compra' : 'compras'}
                  </Badge>
                </div>

                {/* Revenue card */}
                <div className="bg-muted/50 rounded-lg p-3 mb-3">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Receita líquida total</span>
                  <div className="flex items-center gap-2 mt-1">
                    <DollarSign className="h-5 w-5 text-emerald-500" />
                    <span className="text-xl font-bold text-foreground">
                      {formatCurrency(purchaseData.totalSpent)}
                    </span>
                  </div>
                </div>

                {/* Product list */}
                <div className="space-y-2">
                  {purchaseData.purchases.slice(0, 10).map(p => {
                    const isPaid = p.status === 'approved' || p.status === 'Aprovada';
                    return (
                      <div key={p.id} className="flex items-start gap-2 text-xs">
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${isPaid ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{p.product_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-muted-foreground">
                              {format(new Date(p.purchased_at), 'dd/MM/yy')}
                            </span>
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-medium">
                              {p.platform}
                            </Badge>
                            {p.product_type && (
                              <span className="text-muted-foreground flex items-center gap-0.5">
                                <CreditCard className="h-2.5 w-2.5" /> {p.product_type}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className={`shrink-0 font-semibold ml-1 ${isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                          {formatCurrency(p.net_amount ?? p.gross_amount)}
                        </span>
                      </div>
                    );
                  })}
                  {purchaseData.purchases.length > 10 && (
                    <p className="text-[10px] text-muted-foreground text-center pt-1">
                      +{purchaseData.purchases.length - 10} compras
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Jornada nos Funis */}
            {journey.length > 0 && (
              <div className="p-5 border-b border-border">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-foreground" />
                  <span className="text-sm font-semibold text-foreground">Jornada nos Funis</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {journey.length} {journey.length === 1 ? 'funil' : 'funis'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {journey.map((j: any) => (
                    <div key={j.id} className="rounded-lg border border-border p-2.5 flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: j.funnel?.color || 'hsl(var(--primary))' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{j.funnel?.name || 'Funil'}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{
                            backgroundColor: `${j.stage?.color || '#888'}20`,
                            color: j.stage?.color || '#888',
                          }}>
                            {j.stage?.name || 'Etapa'}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(j.entered_at), { locale: ptBR, addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline de Eventos */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4 text-foreground" />
                <span className="text-sm font-semibold text-foreground">Timeline</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">
                  {events.length} {events.length === 1 ? 'evento' : 'eventos'}
                </Badge>
              </div>

              {events.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum evento registrado</p>
              ) : (
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

                  <div className="space-y-3">
                    {events.map((ev, idx) => {
                      const isPurchase = ev.event_name === 'purchase' || ev.event_name === 'compra';
                      const Icon = getEventIcon(ev.event_name);
                      const prevEvent = events[idx - 1];
                      const timeDiff = prevEvent
                        ? `+${formatDistanceToNow(new Date(ev.created_at), { locale: ptBR })}`
                        : null;

                      return (
                        <div key={ev.id} className="flex gap-3 relative">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ${
                            isPurchase
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : 'bg-primary/10 text-primary'
                          }`}>
                            <Icon className="h-3 w-3" />
                          </div>
                          <div className="flex-1 min-w-0 pb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-foreground">{ev.event_name}</span>
                              {timeDiff && (
                                <span className="text-[10px] text-muted-foreground/60">{timeDiff}</span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {format(new Date(ev.created_at), 'dd/MM/yyyy HH:mm:ss')}
                            </p>
                            {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                              <div className="flex items-center gap-2 mt-1 text-[10px]">
                                {(ev.metadata as any).product_name && (
                                  <span className="text-muted-foreground">{(ev.metadata as any).product_name}</span>
                                )}
                                {(ev.metadata as any).amount && (
                                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                    {formatCurrency(Number((ev.metadata as any).amount))}
                                  </span>
                                )}
                                {(ev.metadata as any).platform && (
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                                    {(ev.metadata as any).platform}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default LeadTimeline;
