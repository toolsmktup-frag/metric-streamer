import React from 'react';
import { useLeadEvents } from '@/hooks/useLeads';
import { useLeadPurchases, useLeadFunnelJourney } from '@/hooks/useLeadPurchases';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Lead } from '@/types/leadFunnels';
import { Activity, Mail, Phone, Tag, ShoppingCart, DollarSign, Award, MapPin } from 'lucide-react';

interface LeadTimelineProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
}

const LeadTimeline: React.FC<LeadTimelineProps> = ({ lead, open, onClose }) => {
  const { data: events = [] } = useLeadEvents(lead?.id ?? null);
  const { data: purchaseData } = useLeadPurchases(lead?.email ?? null, lead?.phone ?? null);
  const { data: journey = [] } = useLeadFunnelJourney(lead?.id ?? null);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
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

        {/* Purchase Summary */}
        {purchaseData && purchaseData.totalOrders > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> Compras
            </h4>
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-emerald-500" />
                  <span className="text-lg font-bold text-foreground">
                    {purchaseData.totalSpent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    {purchaseData.totalOrders} {purchaseData.totalOrders === 1 ? 'compra' : 'compras'}
                  </span>
                  {purchaseData.products.length > 1 && (
                    <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <Award className="h-3 w-3" /> Multi-comprador
                    </span>
                  )}
                </div>
              </div>

              {/* Product list */}
              <div className="space-y-2 pt-2 border-t border-border">
                {purchaseData.purchases.slice(0, 10).map(p => (
                  <div key={p.id} className="flex items-start justify-between text-xs">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{p.product_name}</p>
                      <p className="text-muted-foreground">
                        {format(new Date(p.purchased_at), 'dd/MM/yyyy')} · {p.platform}
                        {p.product_type && ` · ${p.product_type}`}
                      </p>
                    </div>
                    <span className={`shrink-0 font-medium ml-2 ${
                      p.status === 'approved' || p.status === 'Aprovada'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-muted-foreground'
                    }`}>
                      {(p.net_amount ?? p.gross_amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                ))}
                {purchaseData.purchases.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{purchaseData.purchases.length - 10} compras
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Funnel Journey */}
        {journey.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Jornada nos Funis
            </h4>
            <div className="space-y-2">
              {journey.map((j: any) => (
                <div key={j.id} className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg p-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: j.funnel?.color || '#888' }} />
                  <span className="font-medium text-foreground">{j.funnel?.name || 'Funil'}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{
                    backgroundColor: `${j.stage?.color || '#888'}20`,
                    color: j.stage?.color || '#888',
                  }}>
                    {j.stage?.name || 'Etapa'}
                  </span>
                  <span className="text-muted-foreground ml-auto">
                    {formatDistanceToNow(new Date(j.entered_at), { locale: ptBR, addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Events Timeline */}
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4" /> Timeline de Eventos
          </h4>
          <div className="space-y-3">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum evento registrado</p>
            ) : (
              events.map((ev, idx) => {
                const isPurchase = ev.event_name === 'purchase' || ev.event_name === 'compra';
                const prevEvent = events[idx + 1];
                const timeDiff = prevEvent
                  ? formatDistanceToNow(new Date(ev.created_at), { locale: ptBR })
                  : null;

                return (
                  <div key={ev.id} className="flex gap-3">
                    <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${
                      isPurchase ? 'bg-emerald-500' : 'bg-primary'
                    }`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {isPurchase && <ShoppingCart className="h-3 w-3 text-emerald-500" />}
                        <p className="text-sm font-medium text-foreground">{ev.event_name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(ev.created_at), 'dd/MM/yyyy HH:mm:ss')}
                        {timeDiff && (
                          <span className="ml-2 text-[10px] text-muted-foreground/70">
                            +{timeDiff}
                          </span>
                        )}
                      </p>
                      {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {(ev.metadata as any).product_name && (
                            <span className="mr-2">{(ev.metadata as any).product_name}</span>
                          )}
                          {(ev.metadata as any).amount && (
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              {Number((ev.metadata as any).amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default LeadTimeline;
