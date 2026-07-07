// Parser do padrão "sequência drip" dos wz_flows (webinário pós-compra):
// trigger → N× [smart_delay → manychat → move_stage] → move_stage final.
// Funções puras (sem Supabase) para a aba Webinário do funil ler/editar o flow
// sem abrir o editor de canvas.

export interface WzNodeLike {
  id: string;
  type?: string;
  data?: Record<string, any>;
  [key: string]: any;
}

export interface WzEdgeLike {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  [key: string]: any;
}

export interface WebinarDay {
  dayNumber: number;
  delayNodeId: string;
  targetTimeUtc: string;
  manychatNodeId: string | null;
  tagName: string;
  webinarUrl: string | null;
  moveStageNodeId: string | null;
  stageName: string | null;
}

export interface WebinarFlowParse {
  days: WebinarDay[];
  finalStage: { nodeId: string; stageName: string } | null;
  smartDelayNodeIds: string[];
  commonTimeUtc: string | null;
  warnings: string[];
}

/** Um flow é "drip" (sequência de dias) se tem pelo menos um delay inteligente e um nó ManyChat. */
export function isDripFlow(nodes: WzNodeLike[], _edges: WzEdgeLike[]): boolean {
  const hasDelay = nodes.some(n => n.type === 'smart_delay');
  const hasManychat = nodes.some(n => n.type === 'manychat');
  return hasDelay && hasManychat;
}

// O executor das edge functions roda em UTC; o Brasil não tem horário de verão,
// então a conversão é um offset fixo de 3 horas.
const BRT_OFFSET_HOURS = 3;

function shiftHhmm(hhmm: string, deltaHours: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return hhmm;
  const hours = (((parseInt(match[1], 10) + deltaHours) % 24) + 24) % 24;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

export function brtToUtc(hhmm: string): string {
  return shiftHhmm(hhmm, BRT_OFFSET_HOURS);
}

export function utcToBrt(hhmm: string): string {
  return shiftHhmm(hhmm, -BRT_OFFSET_HOURS);
}

export function parseWebinarFlow(nodes: WzNodeLike[], edges: WzEdgeLike[]): WebinarFlowParse {
  const warnings: string[] = [];
  const days: WebinarDay[] = [];
  let finalStage: WebinarFlowParse['finalStage'] = null;

  const byId = new Map(nodes.map(n => [n.id, n]));

  // Ponto de partida: nó trigger, ou raiz sem edge de entrada (mesma heurística do wz-bulk-enroll)
  let start = nodes.find(n => n.type === 'trigger');
  if (!start) {
    const targets = new Set(edges.map(e => e.target));
    start = nodes.find(n => n.type !== 'note' && !targets.has(n.id));
  }
  if (!start) {
    return { days, finalStage, smartDelayNodeIds: [], commonTimeUtc: null, warnings: ['Fluxo sem nó inicial'] };
  }

  const visited = new Set<string>();
  let currentId: string | undefined = edges.find(e => e.source === start!.id)?.target;
  let openDay: WebinarDay | null = null;

  while (currentId && !visited.has(currentId) && visited.size <= nodes.length) {
    visited.add(currentId);
    const node = byId.get(currentId);
    if (!node) break;
    const data = node.data || {};

    if (data.disabled === true || node.type === 'note' || node.type === 'stop' || node.type === 'condition') {
      // ignora e segue (condition: a caminhada continua pelo ramo "no" — ver abaixo)
    } else if (node.type === 'smart_delay') {
      if (openDay) days.push(openDay);
      openDay = {
        dayNumber: days.length + 1,
        delayNodeId: node.id,
        targetTimeUtc: data.targetTime || '09:00',
        manychatNodeId: null,
        tagName: '',
        webinarUrl: null,
        moveStageNodeId: null,
        stageName: null,
      };
    } else if (node.type === 'manychat') {
      if (openDay && !openDay.manychatNodeId) {
        openDay.manychatNodeId = node.id;
        openDay.tagName = data.tagName || '';
        openDay.webinarUrl = data.webinarUrl || null;
        if (!data.tagName) warnings.push(`Dia ${openDay.dayNumber} sem tag ManyChat configurada`);
      } else {
        warnings.push(`Nó ManyChat "${data.label || node.id}" fora do padrão dia-a-dia`);
      }
    } else if (node.type === 'move_stage') {
      if (openDay && !openDay.moveStageNodeId) {
        openDay.moveStageNodeId = node.id;
        openDay.stageName = data.stageName || null;
        days.push(openDay);
        openDay = null;
      } else {
        finalStage = { nodeId: node.id, stageName: data.stageName || 'Etapa final' };
      }
    } else if (node.type !== 'trigger') {
      warnings.push(`Nó "${data.label || node.type || node.id}" não faz parte do padrão da sequência`);
    }

    // Nós condition têm duas saídas (yes/no); a sequência continua pelo "no"
    // (o "yes" é o desvio de saída — ex.: lead já comprou o curso → Encerrado).
    const outgoing = edges.filter(e => e.source === currentId);
    currentId = node.type === 'condition'
      ? (outgoing.find(e => e.sourceHandle === 'no') || outgoing[0])?.target
      : outgoing[0]?.target;
  }
  if (openDay) {
    days.push(openDay);
    warnings.push(`Dia ${openDay.dayNumber} incompleto (sem mover de coluna)`);
  }

  const smartDelayNodeIds = nodes.filter(n => n.type === 'smart_delay').map(n => n.id);
  if (smartDelayNodeIds.length !== days.length) {
    warnings.push('Há delays fora da sequência principal');
  }

  const times = new Set(days.map(d => d.targetTimeUtc));
  const commonTimeUtc = times.size === 1 ? days[0].targetTimeUtc : null;
  if (times.size > 1) warnings.push('Os dias têm horários de disparo diferentes');

  return { days, finalStage, smartDelayNodeIds, commonTimeUtc, warnings };
}

/** Reescreve o targetTime (UTC) de TODOS os smart_delay, preservando o resto dos nós. */
export function applyDailyTimeUtc(nodes: WzNodeLike[], timeUtc: string): WzNodeLike[] {
  return nodes.map(n =>
    n.type === 'smart_delay'
      ? { ...n, data: { ...n.data, targetTime: timeUtc } }
      : n
  );
}

/**
 * Reescreve o webinarUrl (link da live que vira o custom field {{link_webinario}}
 * no ManyChat, via link rastreável assinado) de TODOS os nós manychat.
 * String vazia remove o campo (desliga o rastreio).
 */
export function applyWebinarUrl(nodes: WzNodeLike[], url: string): WzNodeLike[] {
  const trimmed = url.trim();
  return nodes.map(n => {
    if (n.type !== 'manychat') return n;
    const data = { ...n.data };
    if (trimmed) data.webinarUrl = trimmed;
    else delete data.webinarUrl;
    return { ...n, data };
  });
}

/** Reescreve a tagName dos nós manychat indicados, preservando o resto. */
export function applyDayTags(
  nodes: WzNodeLike[],
  updates: Array<{ nodeId: string; tagName: string }>
): WzNodeLike[] {
  const byNode = new Map(updates.map(u => [u.nodeId, u.tagName]));
  return nodes.map(n =>
    byNode.has(n.id)
      ? { ...n, data: { ...n.data, tagName: byNode.get(n.id) } }
      : n
  );
}
