import { useState, useMemo, useEffect, useRef } from 'react';
import { User, Tag, StickyNote, Trash2, Send, ShoppingCart, DollarSign, MapPin, Activity, CreditCard, CheckCircle2, XCircle, Clock, RotateCcw, AlertTriangle, UserPlus, Eye, FileText, Lock, Loader2, type LucideIcon } from 'lucide-react';
import { useEnsureLead } from '@/hooks/useEnsureLead';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useContactNotes } from '@/hooks/useContactNotes';
import { useLeadByPhone } from '@/hooks/useLeadByPhone';
import { useLeadPurchases, useLeadFunnelJourney } from '@/hooks/useLeadPurchases';
import { useLeadEvents } from '@/hooks/useLeads';
import { useLeadFunnelStages } from '@/hooks/useLeadFunnelStages';
import { useMoveLeadStage } from '@/hooks/useMoveLeadStage';
import { useMoveLeadFunnel } from '@/hooks/useMoveLeadFunnel';
import { useLeadFunnels } from '@/hooks/useLeadFunnels';
import { useCurrentUserRole } from '@/hooks/useCurrentUserRole';
import FunnelLinker from './FunnelLinker';
import TagsEditor from './TagsEditor';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency } from '@/lib/formatters';
import { parseLocalDateTime } from '@/lib/localDate';

interface ContactPanelProps {
  phone: string | null;
  senderName: string | null;
}

interface EventMapping {
  label: string;
  icon: LucideIcon;
  colorClass: string;
}

const EVENT_MAP: Record<string, EventMapping> = {
  lead_importado: { label: 'Lead Importado', icon: UserPlus, colorClass: 'bg-blue-500/10 text-blue-500' },
  criado: { label: 'Lead Importado', icon: UserPlus, colorClass: 'bg-blue-500/10 text-blue-500' },
  pago: { label: 'Pagamento Aprovado', icon: CheckCircle2, colorClass: 'bg-emerald-500/10 text-emerald-500' },
  authorized: { label: 'Pagamento Aprovado', icon: CheckCircle2, colorClass: 'bg-emerald-500/10 text-emerald-500' },
  pix_gerado: { label: 'PIX Gerado', icon: CreditCard, colorClass: 'bg-amber-500/10 text-amber-500' },
  pix_created: { label: 'PIX Gerado', icon: CreditCard, colorClass: 'bg-amber-500/10 text-amber-500' },
  rejeitado: { label: 'Rejeitado', icon: XCircle, colorClass: 'bg-destructive/10 text-destructive' },
  cancelado: { label: 'Cancelado', icon: XCircle, colorClass: 'bg-destructive/10 text-destructive' },
  expirado: { label: 'Expirado', icon: Clock, colorClass: 'bg-muted text-muted-foreground' },
  reembolsado: { label: 'Reembolsado', icon: RotateCcw, colorClass: 'bg-amber-500/10 text-amber-500' },
  chargeback: { label: 'Chargeback', icon: AlertTriangle, colorClass: 'bg-destructive/10 text-destructive' },
  boleto_gerado: { label: 'Boleto Gerado', icon: FileText, colorClass: 'bg-amber-500/10 text-amber-500' },
  bank_slip_created: { label: 'Boleto Gerado', icon: FileText, colorClass: 'bg-amber-500/10 text-amber-500' },
  open: { label: 'Checkout Aberto', icon: Eye, colorClass: 'bg-muted text-muted-foreground' },
  waiting_payment: { label: 'Aguardando Pagamento', icon: Clock, colorClass: 'bg-amber-500/10 text-amber-500' },
  funnel_change: { label: 'Funil alterado manualmente', icon: MapPin, colorClass: 'bg-blue-500/10 text-blue-500' },
  stage_change: { label: 'Etapa alterada', icon: Activity, colorClass: 'bg-primary/10 text-primary' },
};

const DEFAULT_EVENT: EventMapping = { label: '', icon: Activity, colorClass: 'bg-primary/10 text-primary' };

function getEventMapping(eventName: string): EventMapping {
  return EVENT_MAP[eventName] || { ...DEFAULT_EVENT, label: eventName };
}

function getEventDate(ev: { created_at: string; metadata: Record<string, unknown> }): Date {
  const originalDate = (ev.metadata as any)?.original_date;
  return parseLocalDateTime(originalDate) || parseLocalDateTime(ev.created_at) || new Date();
}

export default function ContactPanel({ phone, senderName }: ContactPanelProps) {
  const { data: role = 'vendedor' } = useCurrentUserRole();
  const isAdmin = role === 'admin' || role === 'gestor';

  const { data: lead, refetch: refetchLead, isFetching: isFetchingLead } = useLeadByPhone(phone);

  const { data: currentUserId } = useQuery({
    queryKey: ['auth-user-id'],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data?.user?.id || null;
    },
    staleTime: 5 * 60 * 1000,
  });
  const canSeeCrm = isAdmin || (lead?.assigned_to && lead.assigned_to === currentUserId);

  // Auto-cria lead pro chat do WhatsApp quando ainda não existe.
  // Vendedor recebe assigned_to = ele mesmo (libera canSeeCrm na mesma hora).
  const ensureLead = useEnsureLead();
  const ensuredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!phone) return;
    if (lead?.id) { ensuredFor.current = phone; return; }
    if (isFetchingLead || ensureLead.isPending) return;
    if (ensuredFor.current === phone) return;
    ensuredFor.current = phone;
    ensureLead.mutate(
      { phone, name: senderName },
      { onSuccess: () => { refetchLead(); } }
    );
  }, [phone, lead?.id, isFetchingLead, senderName, ensureLead, refetchLead]);

  const { notes, loading: notesLoading, addNote, deleteNote } = useContactNotes(canSeeCrm ? phone : null);
  const [noteText, setNoteText] = useState('');

  const { data: purchaseData } = useLeadPurchases(canSeeCrm ? (lead?.email ?? null) : null, canSeeCrm ? phone : null);
  const { data: journey = [] } = useLeadFunnelJourney(canSeeCrm ? (lead?.id ?? null) : null);
  const { data: events = [] } = useLeadEvents(canSeeCrm ? (lead?.id ?? null) : null);

  const funnelIds = useMemo(() => Array.from(new Set<string>(journey.map((j: any) => j.funnel_id))), [journey]);
  const { data: stagesByFunnel = {} } = useLeadFunnelStages(funnelIds);
  const { data: allFunnels = [] } = useLeadFunnels();
  const moveLeadStage = useMoveLeadStage();
  const moveLeadFunnel = useMoveLeadFunnel();

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => getEventDate(b).getTime() - getEventDate(a).getTime()),
    [events],
  );

  if (!phone) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Selecione um contato
      </div>
    );
  }

  const formatPhone = (p: string) => {
    if (p.length === 13 && p.startsWith('55')) {
      return `(${p.slice(2, 4)}) ${p.slice(4, 9)}-${p.slice(9)}`;
    }
    return p;
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addNote(noteText);
    setNoteText('');
  };

  if (!canSeeCrm) {
    return (
      <div className="p-4 space-y-4 overflow-y-auto h-full">
        <div className="flex flex-col items-center gap-2 pb-4 border-b border-border">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-8 w-8 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground text-sm">
            {senderName || formatPhone(phone)}
          </h3>
          <span className="text-xs text-muted-foreground">{formatPhone(phone)}</span>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4 flex flex-col items-center text-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs font-medium text-foreground">Lead não atribuído a você</p>
          <p className="text-[11px] text-muted-foreground">
            Notas, vendas, funis e timeline ficam visíveis apenas para o vendedor responsável ou para gestores.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* Contact header */}
      <div className="flex flex-col items-center gap-2 pb-4 border-b border-border">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-8 w-8 text-primary" />
        </div>
        <h3 className="font-semibold text-foreground text-sm">
          {senderName || lead?.name || formatPhone(phone)}
        </h3>
        <span className="text-xs text-muted-foreground">{formatPhone(phone)}</span>
        {lead?.email && (
          <span className="text-xs text-muted-foreground">{lead.email}</span>
        )}
      </div>

      {/* Notes */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <StickyNote className="h-3 w-3" /> Notas internas
        </h4>
        <div className="flex gap-1.5 mb-2">
          <Textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Adicionar nota..."
            className="text-xs min-h-[50px] flex-1 resize-none"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAddNote();
              }
            }}
          />
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 self-end" onClick={handleAddNote} disabled={!noteText.trim()}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        {notesLoading ? (
          <p className="text-xs text-muted-foreground italic">Carregando...</p>
        ) : notes.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhuma nota adicionada</p>
        ) : (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {notes.map(note => (
              <div key={note.id} className="bg-muted/50 rounded-lg p-2 group relative">
                <p className="text-xs text-foreground whitespace-pre-wrap">{note.content}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(note.created_at), 'dd/MM/yy HH:mm')}
                  </span>
                  <button onClick={() => deleteNote(note.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Purchases */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <ShoppingCart className="h-3 w-3" /> Vendas
          {purchaseData && purchaseData.totalOrders > 0 && (
            <Badge variant="secondary" className="text-[9px] ml-auto px-1.5 py-0 h-4">
              {purchaseData.totalOrders}
            </Badge>
          )}
        </h4>
        {!purchaseData || purchaseData.purchases.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhuma venda encontrada</p>
        ) : (
          <>
            <div className="bg-muted/50 rounded-lg p-2.5 mb-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Receita líquida</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <span className="text-base font-bold text-foreground">{formatCurrency(purchaseData.totalSpent)}</span>
              </div>
            </div>
            <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
              {purchaseData.purchases.map(p => {
                const isPaid = p.status === 'authorized';
                return (
                  <div key={p.id} className="flex items-start gap-1.5 text-[11px]">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${isPaid ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{p.product_name}</p>
                      <span className="text-muted-foreground">{format(new Date(p.purchased_at), 'dd/MM/yy')}</span>
                    </div>
                    <span className={`shrink-0 font-semibold ${isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                      {formatCurrency(p.net_amount ?? p.gross_amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Tags */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Tag className="h-3 w-3" /> Tags
        </h4>
        {lead?.id ? (
          <TagsEditor leadId={lead.id} />
        ) : ensureLead.isPending || isFetchingLead ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
            <Loader2 className="h-3 w-3 animate-spin" /> Preparando lead…
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Lead indisponível</p>
        )}
      </div>

      {/* Funnels */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <MapPin className="h-3 w-3" /> Funis
          {journey.length > 0 && (
            <Badge variant="secondary" className="text-[9px] ml-auto px-1.5 py-0 h-4">
              {journey.length}
            </Badge>
          )}
        </h4>
        {journey.length === 0 ? (
          lead?.id ? (
            <FunnelLinker leadId={lead.id} />
          ) : ensureLead.isPending || isFetchingLead ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
              <Loader2 className="h-3 w-3 animate-spin" /> Preparando lead…
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Não foi possível preparar o lead deste contato</p>
          )
        ) : (
          <div className="space-y-1.5">
            {journey.map((j: any) => {
              const stages = stagesByFunnel[j.funnel_id] || [];
              return (
                <div key={j.id} className="rounded-lg border border-border p-2 space-y-1.5">
                  {/* Funnel selector */}
                  <Select
                    value={j.funnel_id}
                    onValueChange={(newFunnelId) => {
                      if (newFunnelId === j.funnel_id) return;
                      const targetFunnel = allFunnels.find((f: any) => f.id === newFunnelId);
                      moveLeadFunnel.mutate({
                        positionId: j.id,
                        leadId: j.lead_id,
                        fromFunnelId: j.funnel_id,
                        toFunnelId: newFunnelId,
                        toFunnelName: targetFunnel?.name,
                      });
                    }}
                  >
                    <SelectTrigger className="h-7 text-[10px] px-2 border-none bg-muted/50">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: j.funnel?.color || 'hsl(var(--primary))' }} />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {allFunnels.map((f: any) => (
                        <SelectItem key={f.id} value={f.id} className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color || 'hsl(var(--primary))' }} />
                            {f.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Stage selector */}
                  {stages.length > 1 ? (
                    <Select
                      value={j.stage_id}
                      onValueChange={(newStageId) => {
                        if (newStageId === j.stage_id) return;
                        const targetStage = stages.find((s: any) => s.id === newStageId);
                        moveLeadStage.mutate({
                          positionId: j.id,
                          leadId: j.lead_id,
                          funnelId: j.funnel_id,
                          fromStageId: j.stage_id,
                          toStageId: newStageId,
                          toStageName: targetStage?.name,
                        });
                      }}
                    >
                      <SelectTrigger className="h-7 text-[10px] px-2 border-none bg-muted/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((s: any) => (
                          <SelectItem key={s.id} value={s.id} className="text-xs">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color || '#888' }} />
                              {s.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{
                        backgroundColor: `${j.stage?.color || '#888'}20`,
                        color: j.stage?.color || '#888',
                      }}>
                        {j.stage?.name || 'Etapa'}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {formatDistanceToNow(new Date(j.entered_at), { locale: ptBR, addSuffix: true })}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Activity className="h-3 w-3" /> Timeline
          {sortedEvents.length > 0 && (
            <Badge variant="secondary" className="text-[9px] ml-auto px-1.5 py-0 h-4">
              {sortedEvents.length}
            </Badge>
          )}
        </h4>
        {sortedEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhum evento registrado</p>
        ) : (
          <div className="relative max-h-[250px] overflow-y-auto">
            <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-2.5">
              {sortedEvents.map(ev => {
                const mapping = getEventMapping(ev.event_name);
                const Icon = mapping.icon;
                const eventDate = getEventDate(ev);
                return (
                  <div key={ev.id} className="flex gap-2.5 relative">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 z-10 ${mapping.colorClass}`}>
                      <Icon className="h-2.5 w-2.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-medium text-foreground">{mapping.label}</span>
                      <p className="text-[9px] text-muted-foreground">{format(eventDate, 'dd/MM/yy HH:mm')}</p>
                      {(ev.metadata as any)?.product_name && (
                        <p className="text-[9px] text-muted-foreground truncate mt-0.5">
                          {(ev.metadata as any).product_name}
                          {(ev.metadata as any).amount && ` · ${formatCurrency(Number((ev.metadata as any).amount))}`}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tags */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Tag className="h-3 w-3" /> Tags
        </h4>
        {lead?.id ? (
          <TagsEditor leadId={lead.id} />
        ) : (
          <p className="text-xs text-muted-foreground italic">Lead não encontrado</p>
        )}
      </div>
    </div>
  );
}
