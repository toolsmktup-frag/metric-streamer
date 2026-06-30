import React from 'react';
import { Lead, LeadFunnelStage, LeadStagePosition, ValueClassification } from '@/types/leadFunnels';
import { Mail, Phone, Clock, DollarSign, GripVertical, MessageCircle, ShoppingBag, CalendarClock, Timer, EyeOff, AlertTriangle, Hourglass, Check, ArrowRight, Headset } from 'lucide-react';
import { PurchaseSummary } from '@/hooks/useBulkLeadPurchases';
import { useDraggable } from '@dnd-kit/core';
import { formatLocalDateTime } from '@/lib/localDate';
import { differenceInDays } from 'date-fns';
import type { RecontactInfo } from '@/hooks/useRecontactDeadlines';
import LeadAssignSelect from './LeadAssignSelect';
import GuruAccountBadge from '@/components/GuruAccountBadge';
import { extractMetadataAmount, classificationColor, classificationLabel } from '@/lib/valueClassification';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMoveLeadStage } from '@/hooks/useMoveLeadStage';
import { useAssignLead } from '@/hooks/useAssignLead';

interface LeadCardProps {
  position: LeadStagePosition & { lead: Lead };
  onClick?: () => void;
  onWhatsAppClick?: (phone: string) => void;
  isDragging?: boolean;
  isRevenue?: boolean;
  purchaseSummary?: PurchaseSummary;
  recontactInfo?: RecontactInfo;
  hideValues?: boolean;
  stageClassification?: ValueClassification | null;
  userRole?: string;
  currentUserId?: string;
  stages?: LeadFunnelStage[];
  /** Etapas que, em vez de mover direto, abrem o fluxo de resolução de ticket (board de suporte). */
  resolutionStageIds?: Set<string>;
  onResolveRequest?: (stage: LeadFunnelStage) => void;
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

const LeadCard: React.FC<LeadCardProps> = ({ position, onClick, onWhatsAppClick, isDragging, isRevenue = true, purchaseSummary, recontactInfo, hideValues, stageClassification, userRole, currentUserId, stages, resolutionStageIds, onResolveRequest }) => {
  const lead = position.lead;
  // Fallback: try metadata for phone if lead.phone is empty
  const leadPhone = lead.phone || (lead.metadata?.phone as string) || (lead.metadata?.cel as string) || (lead.metadata?.telefone as string) || null;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: position.id,
  });
  const moveStage = useMoveLeadStage();
  const assignLead = useAssignLead();
  const [stageMenuOpen, setStageMenuOpen] = React.useState(false);

  // Board de suporte (Girassol): ações diretas no card em vez de depender do arrastar.
  const isSupportBoard = (resolutionStageIds?.size ?? 0) > 0;
  const inAttendanceStage = React.useMemo(
    () => (stages || []).find(s => /em atend/i.test(s.name)),
    [stages]
  );
  const resolvedStage = React.useMemo(
    () => (stages || []).find(s => resolutionStageIds?.has(s.id)),
    [stages, resolutionStageIds]
  );
  const isInAttendance = !!inAttendanceStage && position.stage_id === inAttendanceStage.id;
  const isResolved = !!resolutionStageIds?.has(position.stage_id);

  const handleAssumir = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!inAttendanceStage || moveStage.isPending) return;
    // Atribui o lead a quem assumiu (se ainda não for) e move para "Em atendimento".
    if (currentUserId && lead.assigned_to !== currentUserId) {
      assignLead.mutate({ leadId: lead.id, assignedTo: currentUserId });
    }
    moveStage.mutate({
      positionId: position.id,
      leadId: position.lead_id,
      funnelId: position.funnel_id,
      fromStageId: position.stage_id,
      toStageId: inAttendanceStage.id,
      toStageName: inAttendanceStage.name,
    });
  };

  const handleResolver = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (resolvedStage && onResolveRequest) onResolveRequest(resolvedStage);
  };

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const initials = (lead.name || lead.email || '?')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('');

  const hasLTV = purchaseSummary && purchaseSummary.totalOrders > 0;

  const sortedStages = React.useMemo(
    () => (stages ? [...stages].sort((a, b) => a.sort_order - b.sort_order) : []),
    [stages]
  );

  const handlePickStage = (stage: LeadFunnelStage) => {
    if (stage.id === position.stage_id) {
      setStageMenuOpen(false);
      return;
    }
    // Etapa de resolução do board de suporte: abre o modal de finalização em vez de mover direto.
    if (resolutionStageIds?.has(stage.id) && onResolveRequest) {
      setStageMenuOpen(false);
      onResolveRequest(stage);
      return;
    }
    moveStage.mutate(
      {
        positionId: position.id,
        leadId: position.lead_id,
        funnelId: position.funnel_id,
        fromStageId: position.stage_id,
        toStageId: stage.id,
        toStageName: stage.name,
      },
      { onSettled: () => setStageMenuOpen(false) }
    );
  };

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
        <Popover open={stageMenuOpen} onOpenChange={setStageMenuOpen}>
          <PopoverTrigger asChild>
            <button
              {...attributes}
              {...listeners}
              className="mt-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
              onClick={e => {
                e.stopPropagation();
                if (sortedStages.length > 0) setStageMenuOpen(true);
              }}
              title="Arraste para mover ou clique para escolher etapa"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          {sortedStages.length > 0 && (
            <PopoverContent
              align="start"
              side="right"
              className="w-56 p-1"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Mover para
              </div>
              <div className="max-h-72 overflow-y-auto">
                {sortedStages.map(stage => {
                  const isCurrent = stage.id === position.stage_id;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => handlePickStage(stage)}
                      disabled={isCurrent || moveStage.isPending}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md text-left transition-colors ${
                        isCurrent
                          ? 'bg-muted text-muted-foreground cursor-default'
                          : 'hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="flex-1 truncate">{stage.name}</span>
                      {isCurrent ? (
                        <Check className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
                      )}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          )}
        </Popover>

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

        {/* Assign seller + WhatsApp shortcut */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <div onClick={e => e.stopPropagation()}>
            <LeadAssignSelect leadId={lead.id} currentAssignedTo={lead.assigned_to} compact userRole={userRole} currentUserId={currentUserId} />
          </div>
          {leadPhone && onWhatsAppClick && (
            <button
              onClick={e => { e.stopPropagation(); onWhatsAppClick(leadPhone); }}
              className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
              title="Abrir chat no WhatsApp"
            >
              <MessageCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* LTV prominente */}
      {hasLTV && !hideValues && (
        <div className="mt-1.5 flex items-center gap-2 flex-wrap ml-[42px]">
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
            <DollarSign className="h-3.5 w-3.5" />
            {purchaseSummary!.totalSpent.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            <ShoppingBag className="h-3 w-3" />
            ×{purchaseSummary!.totalOrders}
          </span>
          {purchaseSummary!.firstPurchaseDate && !recontactInfo && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded" title="Dias desde a primeira compra">
              <CalendarClock className="h-3 w-3" />
              {differenceInDays(new Date(), new Date(purchaseSummary!.firstPurchaseDate))}d
            </span>
          )}
        </div>
      )}
      {hasLTV && hideValues && (
        <div className="mt-1.5 ml-[42px]">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
            <EyeOff className="h-3 w-3" />
            Valores ocultos
          </span>
        </div>
      )}

      {/* Pending / Recovery value badge (when no LTV) */}
      {!hideValues && stageClassification && stageClassification !== 'positive' && (() => {
        const metaAmount = extractMetadataAmount(lead.metadata);
        const colorCls = classificationColor(stageClassification);
        const label = classificationLabel(stageClassification);
        const Icon = stageClassification === 'pending' ? Hourglass : AlertTriangle;
        return (
          <div className="mt-1.5 ml-[42px]">
            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md ${colorCls}`}>
              <Icon className="h-3.5 w-3.5" />
              {metaAmount > 0
                ? metaAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                : null}
              <span className="text-[10px] font-medium ml-0.5">{label}</span>
            </span>
          </div>
        );
      })()}

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


      {/* Context badges (produto/status/conta Guru) */}
      {(lead.metadata?.product_name || lead.metadata?.status || lead.metadata?.guru_account) && (
        <div className="mt-1 flex items-center gap-1.5 flex-wrap ml-[42px]">
          {lead.metadata?.guru_account && (
            <GuruAccountBadge slug={lead.metadata.guru_account as string} />
          )}
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

      {/* Board de suporte: ações diretas (sem precisar arrastar o card) */}
      {isSupportBoard && !isResolved && (
        <div className="mt-2 ml-[42px] flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {!isInAttendance && inAttendanceStage && (
            <button
              type="button"
              onClick={handleAssumir}
              disabled={moveStage.isPending}
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
              title="Atribuir a mim e colocar em atendimento"
            >
              <Headset className="h-3.5 w-3.5" /> Assumir
            </button>
          )}
          {isInAttendance && resolvedStage && (
            <button
              type="button"
              onClick={handleResolver}
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              title="Finalizar atendimento (motivo + devolver pra IA)"
            >
              <Check className="h-3.5 w-3.5" /> Resolver
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default LeadCard;
