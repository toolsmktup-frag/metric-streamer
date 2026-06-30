import type { LeadFunnelStage } from '@/types/leadFunnels';

/**
 * Board "Suporte — Atendimento Humano" — kanban dos tickets que a Girassol transfere
 * pro humano. O MESMO id default usado pelo bot (agent-mcp/girassol/src/config.ts →
 * GIRASSOL_SUPPORT_FUNNEL_ID). É só nesse funil que a etapa "Resolvido" abre o fluxo
 * de finalização de ticket (motivo + devolver pra IA + mensagem de encerramento).
 */
export const SUPPORT_FUNNEL_ID = '3e786611-b27a-4e3a-8063-6579d38dd31a';

/** Nome de etapa que conta como "fim do atendimento" (dispara o modal de resolução). */
const RESOLUTION_NAME_RE = /resolv|conclu[ií]|finaliz|encerr/i;

export function isSupportFunnel(funnelId: string): boolean {
  return funnelId === SUPPORT_FUNNEL_ID;
}

/**
 * Ids das etapas que, nesse funil, encerram o ticket. Vazio fora do board de suporte —
 * assim nenhum outro funil ganha o modal só por ter uma coluna chamada "Resolvido".
 */
export function resolutionStageIds(funnelId: string, stages: LeadFunnelStage[]): Set<string> {
  if (!isSupportFunnel(funnelId)) return new Set();
  return new Set(stages.filter(s => RESOLUTION_NAME_RE.test(s.name)).map(s => s.id));
}

/** Motivos prontos pra resolução (o atendente ainda pode detalhar no campo livre). */
export const RESOLUTION_REASONS: { value: string; label: string }[] = [
  { value: 'duvida_resolvida', label: 'Dúvida resolvida' },
  { value: 'acesso_resolvido', label: 'Acesso/login resolvido' },
  { value: 'comprou', label: 'Cliente comprou' },
  { value: 'reembolso_cancelamento', label: 'Reembolso/cancelamento' },
  { value: 'sem_interesse', label: 'Sem interesse / desistiu' },
  { value: 'nao_respondeu', label: 'Não respondeu' },
  { value: 'outro_setor', label: 'Encaminhado a outro setor' },
  { value: 'outro', label: 'Outro' },
];

export function resolutionReasonLabel(value: string): string {
  return RESOLUTION_REASONS.find(r => r.value === value)?.label || value;
}
