import { useMemo, useState, useEffect, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Check, ChevronDown } from 'lucide-react';
import { useLeadByPhone } from '@/hooks/useLeadByPhone';
import { useLeadFunnelJourney } from '@/hooks/useLeadPurchases';
import { useLeadFunnelStages } from '@/hooks/useLeadFunnelStages';
import { useLeadFunnels } from '@/hooks/useLeadFunnels';
import { useMyFunnelAccess } from '@/hooks/useLeadFunnelAccess';
import { useCurrentUserRole } from '@/hooks/useCurrentUserRole';
import { useMoveLeadStage } from '@/hooks/useMoveLeadStage';
import { useRecompraWaitingStages } from '@/hooks/useRecompraWaitingStages';
import { pickPrimaryJourney, visibleJourney, isAutomationStage, type JourneyEntry } from '@/lib/leadStageNavigation';
import type { LeadFunnel, LeadFunnelStage } from '@/types/leadFunnels';

interface Props {
  phone: string | null;
  /** 'chip' = cabeçalho do chat; 'inline' = dentro do painel lateral */
  variant?: 'chip' | 'inline';
  /** Atalho de teclado (tecla M). Só faz sentido no chip do cabeçalho. */
  enableShortcut?: boolean;
}

export default function StageQuickMove({ phone, variant = 'chip', enableShortcut = false }: Props) {
  const [open, setOpen] = useState(false);
  const [pendente, setPendente] = useState<{ posicao: JourneyEntry; stageId: string; stageName: string } | null>(null);

  const { data: lead } = useLeadByPhone(phone);
  const { data: journey = [] } = useLeadFunnelJourney(lead?.id ?? null);
  const { data: allFunnels = [] } = useLeadFunnels();
  const { data: access = [] } = useMyFunnelAccess();
  const { data: role = 'vendedor' } = useCurrentUserRole();
  const { data: waitingStageIds = [] } = useRecompraWaitingStages();
  const isAdmin = role === 'admin' || role === 'gestor';

  const campaignByFunnel = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const f of allFunnels as LeadFunnel[]) m[f.id] = f.campaign_id ?? null;
    return m;
  }, [allFunnels]);

  const visiveis = useMemo(
    () => visibleJourney(journey as JourneyEntry[], { isAdmin, access, campaignByFunnel }),
    [journey, isAdmin, access, campaignByFunnel],
  );

  const funnelIds = useMemo(() => Array.from(new Set(visiveis.map((j) => j.funnel_id))), [visiveis]);
  const { data: stagesByFunnel = {} } = useLeadFunnelStages(funnelIds);
  const moveLeadStage = useMoveLeadStage();

  const principal = useMemo(() => pickPrimaryJourney(visiveis), [visiveis]);

  useEffect(() => {
    if (!enableShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'm' && e.key !== 'M') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      // não sequestra a tecla enquanto a pessoa digita a mensagem
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;
      if (!principal) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enableShortcut, principal]);

  const mover = useCallback((posicao: JourneyEntry, stageId: string, stageName: string) => {
    moveLeadStage.mutate({
      positionId: posicao.id,
      leadId: lead!.id,
      funnelId: posicao.funnel_id,
      fromStageId: posicao.stage_id,
      toStageId: stageId,
      toStageName: stageName,
      via: 'chat_quick_move',
    });
    setOpen(false);
  }, [lead, moveLeadStage]);

  const escolher = (posicao: JourneyEntry, stageId: string, stageName: string) => {
    if (stageId === posicao.stage_id) { setOpen(false); return; }
    if (isAutomationStage(stageId, waitingStageIds)) {
      setPendente({ posicao, stageId, stageName });
      setOpen(false);
      return;
    }
    mover(posicao, stageId, stageName);
  };

  if (!phone || !lead?.id || !principal) return null;

  const corAtual = principal.stage?.color || '#888';
  const nomeAtual = principal.stage?.name || 'Sem etapa';
  const outros = visiveis.length - 1;

  const gatilho = variant === 'chip' ? (
    <button
      type="button"
      title="Mover de etapa (M)"
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:brightness-110 max-w-[260px]"
      style={{ backgroundColor: `${corAtual}20`, color: corAtual, borderColor: `${corAtual}55` }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: corAtual }} />
      <span className="truncate">{nomeAtual}</span>
      {outros > 0 && <span className="opacity-70 shrink-0">+{outros}</span>}
      <ChevronDown className="h-3 w-3 opacity-70 shrink-0" />
    </button>
  ) : (
    <button
      type="button"
      className="w-full flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px] hover:bg-muted transition-colors"
    >
      <span className="inline-flex items-center gap-1.5 truncate">
        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: corAtual }} />
        <span className="truncate">{nomeAtual}</span>
      </span>
      <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
    </button>
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{gatilho}</PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar etapa…" className="h-9" />
            <CommandList className="max-h-[320px]">
              <CommandEmpty>Nenhuma etapa encontrada.</CommandEmpty>
              {visiveis.map((pos) => {
                const stages = stagesByFunnel[pos.funnel_id] || [];
                if (stages.length === 0) return null;
                const nomeFunil = pos.funnel?.name || 'Funil';
                return (
                  <CommandGroup key={pos.id} heading={nomeFunil}>
                    {stages.map((s: LeadFunnelStage) => {
                      const atual = s.id === pos.stage_id;
                      return (
                        <CommandItem
                          key={s.id}
                          value={`${nomeFunil} ${s.name}`}
                          onSelect={() => escolher(pos, s.id, s.name)}
                          className="gap-2"
                        >
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color || '#888' }} />
                          <span className="flex-1 truncate">{s.name}</span>
                          {atual && <Check className="h-3.5 w-3.5 opacity-70" />}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <AlertDialog open={!!pendente} onOpenChange={(v) => !v && setPendente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Essa etapa é controlada pela automação</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendente?.stageName}" é onde a campanha de recompra guarda quem já recebeu mensagem
              e está aguardando resposta. Mover o card para lá na mão pode confundir a automação.
              Quer mover mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendente) mover(pendente.posicao, pendente.stageId, pendente.stageName);
                setPendente(null);
              }}
            >
              Mover assim mesmo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
