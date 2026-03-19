import React, { useMemo } from 'react';
import { useLeadEvents } from '@/hooks/useLeads';
import { useLeadPurchases, useLeadFunnelJourney } from '@/hooks/useLeadPurchases';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Lead } from '@/types/leadFunnels';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Mail, Phone, ShoppingCart, DollarSign, MapPin, Activity, UserPlus, CreditCard, CheckCircle2, XCircle, Clock, RotateCcw, AlertTriangle, Eye, FileText, LucideIcon, User } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { parseLocalDateTime } from '@/lib/localDate';
import LeadAssignSelect from './LeadAssignSelect';

interface LeadTimelineProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
}

interface EventMapping {
  label: string;
  icon: LucideIcon;
  colorClass: string;
}

const EVENT_MAP: Record<string, EventMapping> = {
  lead_importado: { label: 'Lead Importado', icon: UserPlus, colorClass: 'bg-blue-500/10 text-blue-500' },
  criado: { label: 'Lead Importado', icon: UserPlus, colorClass: 'bg-blue-500/10 text-blue-500' },
  lead_created: { label: 'Lead Criado', icon: UserPlus, colorClass: 'bg-blue-500/10 text-blue-500' },
  pago: { label: 'Pagamento Aprovado', icon: CheckCircle2, colorClass: 'bg-emerald-500/10 text-emerald-500' },
  authorized: { label: 'Pagamento Aprovado', icon: CheckCircle2, colorClass: 'bg-emerald-500/10 text-emerald-500' },
  pix_gerado: { label: 'PIX Gerado', icon: CreditCard, colorClass: 'bg-amber-500/10 text-amber-500' },
  pix_created: { label: 'PIX Gerado', icon: CreditCard, colorClass: 'bg-amber-500/10 text-amber-500' },
  rejeitado: { label: 'Pagamento Rejeitado', icon: XCircle, colorClass: 'bg-destructive/10 text-destructive' },
  cancelado: { label: 'Cancelado', icon: XCircle, colorClass: 'bg-destructive/10 text-destructive' },
  expirado: { label: 'Expirado', icon: Clock, colorClass: 'bg-muted text-muted-foreground' },
  reembolsado: { label: 'Reembolsado', icon: RotateCcw, colorClass: 'bg-amber-500/10 text-amber-500' },
  chargeback: { label: 'Chargeback', icon: AlertTriangle, colorClass: 'bg-destructive/10 text-destructive' },
  purchase: { label: 'Compra', icon: ShoppingCart, colorClass: 'bg-emerald-500/10 text-emerald-500' },
  compra: { label: 'Compra', icon: ShoppingCart, colorClass: 'bg-emerald-500/10 text-emerald-500' },
  boleto_gerado: { label: 'Boleto Gerado', icon: FileText, colorClass: 'bg-amber-500/10 text-amber-500' },
  bank_slip_created: { label: 'Boleto Gerado', icon: FileText, colorClass: 'bg-amber-500/10 text-amber-500' },
  bank_slip_delayed: { label: 'Boleto Gerado', icon: FileText, colorClass: 'bg-amber-500/10 text-amber-500' },
  billet_printed: { label: 'Boleto Gerado', icon: FileText, colorClass: 'bg-amber-500/10 text-amber-500' },
  open: { label: 'Checkout Aberto', icon: Eye, colorClass: 'bg-muted text-muted-foreground' },
  waiting_payment: { label: 'Aguardando Pagamento', icon: Clock, colorClass: 'bg-amber-500/10 text-amber-500' },
  import: { label: 'Importado', icon: UserPlus, colorClass: 'bg-muted text-muted-foreground' },
};

const DEFAULT_EVENT: EventMapping = { label: '', icon: Activity, colorClass: 'bg-primary/10 text-primary' };

function formatTimeDelta(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  const remMinutes = minutes % 60;

  if (days > 0) return `+${days}d ${remHours}h ${remMinutes}min`;
  if (hours > 0) return `+${hours}h ${remMinutes}min`;
  return `+${remMinutes}min`;
}

function getEventMapping(eventName: string): EventMapping {
  const mapping = EVENT_MAP[eventName];
  if (mapping) return mapping;
  return { ...DEFAULT_EVENT, label: eventName };
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function getEventDate(ev: { created_at: string; metadata: Record<string, unknown> }): Date {
  const originalDate = (ev.metadata as any)?.original_date;
  return parseLocalDateTime(originalDate) || parseLocalDateTime(ev.created_at) || new Date();
}

const LeadTimeline: React.FC<LeadTimelineProps> = ({ lead, open, onClose }) => {
  const { data: events = [] } = useLeadEvents(lead?.id ?? null);
  const { data: purchaseData } = useLeadPurchases(lead?.email ?? null, lead?.phone ?? null);
  const { data: journey = [] } = useLeadFunnelJourney(lead?.id ?? null);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => getEventDate(a).getTime() - getEventDate(b).getTime()).reverse(),
    [events],
  );

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[440px] sm:w-[500px] overflow-y-auto p-0">
        {lead && (
          <div className="flex flex-col">
            <div className="p-5 border-b border-border">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                    {getInitials(lead.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-foreground truncate">{lead.name || lead.email || lead.phone || 'Lead sem nome'}</h3>
                  <div className="flex flex-col gap-0.5 mt-1">
                    {lead.email && lead.name && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Mail className="h-3 w-3" /> {lead.email}
                      </span>
                    )}
                    {lead.phone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Phone className="h-3 w-3" /> {lead.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>

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

            {purchaseData && purchaseData.totalOrders > 0 && (
              <div className="p-5 border-b border-border">
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingCart className="h-4 w-4 text-foreground" />
                  <span className="text-sm font-semibold text-foreground">Compras</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {purchaseData.totalOrders} {purchaseData.totalOrders === 1 ? 'compra' : 'compras'}
                  </Badge>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 mb-3">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Receita líquida total</span>
                  <div className="flex items-center gap-2 mt-1">
                    <DollarSign className="h-5 w-5 text-emerald-500" />
                    <span className="text-xl font-bold text-foreground">
                      {formatCurrency(purchaseData.totalSpent)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {purchaseData.purchases.slice(0, 10).map(p => {
                    const isPaid = p.status === 'authorized';
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

            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4 text-foreground" />
                <span className="text-sm font-semibold text-foreground">Timeline</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">
                  {sortedEvents.length} {sortedEvents.length === 1 ? 'evento' : 'eventos'}
                </Badge>
              </div>

              {sortedEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum evento registrado</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

                  <div className="space-y-3">
                    {sortedEvents.map((ev, index) => {
                      const mapping = getEventMapping(ev.event_name);
                      const Icon = mapping.icon;
                      const eventDate = getEventDate(ev);
                      const meta = ev.metadata as any;

                      // Label with product name for purchase events
                      const productName = meta?.product_name;
                      const isPurchaseEvent = ['purchase', 'compra', 'pago', 'authorized'].includes(ev.event_name);
                      const displayLabel = isPurchaseEvent && productName
                        ? `${mapping.label}: ${productName}`
                        : mapping.label;

                      // Time delta from the chronologically previous event (next in array since sorted desc)
                      let timeDelta: string | null = null;
                      if (index < sortedEvents.length - 1) {
                        const prevEvent = sortedEvents[index + 1];
                        const prevDate = getEventDate(prevEvent);
                        const diffMs = eventDate.getTime() - prevDate.getTime();
                        if (diffMs >= 0) {
                          timeDelta = formatTimeDelta(diffMs);
                        }
                      }

                      return (
                        <div key={ev.id} className="flex gap-3 relative">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ${mapping.colorClass}`}>
                            <Icon className="h-3 w-3" />
                          </div>
                          <div className="flex-1 min-w-0 pb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-foreground truncate">{displayLabel}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {format(eventDate, 'dd/MM/yyyy HH:mm:ss')}
                            </p>
                            {timeDelta && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" /> {timeDelta}
                              </p>
                            )}
                            {meta && Object.keys(meta).length > 0 && (
                              <div className="flex items-center gap-2 mt-1 text-[10px] flex-wrap">
                                {!isPurchaseEvent && productName && (
                                  <span className="text-muted-foreground">{productName}</span>
                                )}
                                {meta.offer_name && (
                                  <span className="text-muted-foreground/80">({meta.offer_name})</span>
                                )}
                                {meta.amount && (
                                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                    {formatCurrency(Number(meta.amount))}
                                  </span>
                                )}
                                {meta.payment_method && (
                                  <span className="text-muted-foreground flex items-center gap-0.5">
                                    <CreditCard className="h-2.5 w-2.5" /> {meta.payment_method}
                                  </span>
                                )}
                                {meta.platform && (
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                                    {meta.platform}
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
