// Regras de navegação de etapa a partir da conversa do WhatsApp.
// Separadas da interface para poderem ser testadas sem montar componente.

export interface JourneyEntry {
  id: string;                    // id da posição (lead_stage_positions.id)
  funnel_id: string;
  stage_id: string;
  entered_at?: string | null;
  stage?: { name?: string | null; color?: string | null } | null;
  funnel?: { name?: string | null; color?: string | null } | null;
}

export interface FunnelAccessRecord {
  funnel_id?: string | null;
  campaign_id?: string | null;
}

/**
 * Qual funil mostrar no chip do cabeçalho quando o lead está em vários.
 * Regra: o que a pessoa mexeu por último (entered_at mais recente). Empate ou
 * ausência de data cai na ordem estável do array, que já vem do banco.
 */
export function pickPrimaryJourney(journey: JourneyEntry[]): JourneyEntry | null {
  if (!journey || journey.length === 0) return null;
  let best = journey[0];
  let bestTime = Date.parse(best.entered_at ?? '');
  for (const entry of journey.slice(1)) {
    const t = Date.parse(entry.entered_at ?? '');
    const bestInvalid = !Number.isFinite(bestTime);
    const entryValid = Number.isFinite(t);
    if ((entryValid && bestInvalid) || (entryValid && !bestInvalid && t > bestTime)) {
      best = entry;
      bestTime = t;
    }
  }
  return best;
}

/**
 * Vendedora só move card em funil que ela enxerga. Admin/gestor vê tudo.
 * Acesso pode vir por funil específico ou pela campanha inteira.
 */
export function canAccessFunnel(
  funnelId: string,
  opts: {
    isAdmin: boolean;
    access: FunnelAccessRecord[];
    funnelCampaignId?: string | null;
  },
): boolean {
  if (opts.isAdmin) return true;
  const { access, funnelCampaignId } = opts;
  if (access.some((a) => a.funnel_id === funnelId)) return true;
  if (funnelCampaignId && access.some((a) => a.campaign_id === funnelCampaignId && !a.funnel_id)) return true;
  return false;
}

/** Filtra a jornada para os funis que a pessoa pode mexer. */
export function visibleJourney(
  journey: JourneyEntry[],
  opts: { isAdmin: boolean; access: FunnelAccessRecord[]; campaignByFunnel?: Record<string, string | null> },
): JourneyEntry[] {
  if (opts.isAdmin) return journey;
  return journey.filter((j) =>
    canAccessFunnel(j.funnel_id, {
      isAdmin: false,
      access: opts.access,
      funnelCampaignId: opts.campaignByFunnel?.[j.funnel_id] ?? null,
    }),
  );
}

/**
 * Etapa controlada por campanha de recompra: mover para lá na mão atrapalha a
 * automação (é onde ela guarda quem já recebeu mensagem e aguarda resposta),
 * então a interface confirma antes.
 */
export function isAutomationStage(stageId: string, waitingStageIds: string[]): boolean {
  return waitingStageIds.includes(stageId);
}
