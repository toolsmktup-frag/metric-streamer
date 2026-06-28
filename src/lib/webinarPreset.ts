import { supabase } from '@/integrations/supabase/client';

// Gera, com 1 clique, o "Funil de Webinário": funil + etapas + regra de transição +
// dois flows (Não assistiu / Assistiu) já no canal API Oficial.

export interface WebinarPresetParams {
  funnelName: string;
  officialInstanceId: string;
  conviteTemplate: string;   // template do convite diário (com {{link_webinario}})
  checkoutTemplate: string;  // template do checkout (pós-assistiu)
  webinarUrl: string;        // destino real do webinário (a sala/replay)
  checkoutUrl: string;       // link de checkout
  followUps: number;         // ex.: 7
  sendTime: string;          // HH:MM, ex.: "18:00"
}

async function fetchOrgId(): Promise<string> {
  const { data, error } = await (supabase as any).rpc('get_user_org_id');
  if (error) throw new Error(`Falha ao obter organização: ${error.message}`);
  if (!data) throw new Error('Seu perfil não está vinculado a uma organização.');
  return data as string;
}

let _id = 0;
const nid = (p: string) => `wz_${p}_${Date.now()}_${++_id}`;

// Flow A — "Não assistiu": sequência diária de convite, com checagem de "assistiu" (tag local).
function buildFlowA(p: WebinarPresetParams, funnelId: string, encerradoStageId: string) {
  const nodes: any[] = [];
  const edges: any[] = [];
  const edge = (source: string, target: string, sourceHandle?: string) =>
    edges.push({ id: `e_${source}_${target}_${sourceHandle || 'd'}`, source, target, ...(sourceHandle ? { sourceHandle } : {}) });

  const tId = nid('trigger');
  nodes.push({ id: tId, type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Entrou no webinário', triggerType: 'signup' } });

  const stopYes = nid('stop');
  nodes.push({ id: stopYes, type: 'stop', position: { x: 380, y: 0 }, data: { label: 'Assistiu — parar', stopType: 'stop' } });

  let prev = tId;
  let y = 0;
  for (let i = 1; i <= p.followUps; i++) {
    y += 140;
    const c = nid('cond'); const w = nid('wa'); const d = nid('delay');
    nodes.push({ id: c, type: 'condition', position: { x: 0, y }, data: { label: `Já assistiu? (dia ${i})`, variable: 'tag', operator: 'contains', compareValue: 'assistiu' } });
    nodes.push({ id: w, type: 'whatsapp', position: { x: 0, y: y + 60 }, data: {
      label: `Follow up ${i}`, channel: 'official',
      officialInstanceId: p.officialInstanceId, templateName: p.conviteTemplate,
      webinarUrl: p.webinarUrl, templateVariables: { '1': '{{nome}}', '2': '{{link_webinario}}' },
    } });
    nodes.push({ id: d, type: 'smart_delay', position: { x: 0, y: y + 120 }, data: { label: 'Próximo dia', targetTime: p.sendTime, targetDay: 'any' } });
    edge(prev, c);
    edge(c, stopYes, 'yes');
    edge(c, w, 'no');
    edge(w, d);
    prev = d;
  }

  y += 170;
  const move = nid('move');
  nodes.push({ id: move, type: 'move_stage', position: { x: 0, y }, data: { label: 'Encerrado', funnelId, stageId: encerradoStageId, stageName: 'Encerrado', registerEvent: true } });
  const sEnd = nid('stop');
  nodes.push({ id: sEnd, type: 'stop', position: { x: 0, y: y + 60 }, data: { label: 'Fim', stopType: 'stop' } });
  edge(prev, move);
  edge(move, sEnd);

  return { nodes, edges };
}

// Flow B — "Assistiu": marca tag, move etapa e manda o checkout.
function buildFlowB(p: WebinarPresetParams, funnelId: string, assistiuStageId: string) {
  const nodes: any[] = [];
  const edges: any[] = [];
  const edge = (s: string, t: string) => edges.push({ id: `e_${s}_${t}`, source: s, target: t });

  const t = nid('trigger'); const tag = nid('tag'); const mv = nid('move'); const w = nid('wa');
  nodes.push({ id: t, type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Assistiu o webinário', triggerType: 'webinar_attended' } });
  nodes.push({ id: tag, type: 'tag', position: { x: 0, y: 130 }, data: { label: 'Marcar assistiu', tagName: 'assistiu', tagAction: 'add' } });
  nodes.push({ id: mv, type: 'move_stage', position: { x: 0, y: 260 }, data: { label: 'Assistiu / Checkout', funnelId, stageId: assistiuStageId, stageName: 'Assistiu / Checkout', registerEvent: true } });
  nodes.push({ id: w, type: 'whatsapp', position: { x: 0, y: 390 }, data: {
    label: 'Link do checkout', channel: 'official',
    officialInstanceId: p.officialInstanceId, templateName: p.checkoutTemplate,
    templateVariables: { '1': '{{nome}}', '2': p.checkoutUrl },
  } });
  edge(t, tag); edge(tag, mv); edge(mv, w);

  return { nodes, edges };
}

export async function createWebinarPreset(p: WebinarPresetParams) {
  const orgId = await fetchOrgId();

  // 1) Funil
  const { data: funnel, error: fErr } = await (supabase as any)
    .from('lead_funnels')
    .insert({ name: p.funnelName, color: '#3b82f6', is_active: true, organization_id: orgId })
    .select('id').single();
  if (fErr) throw fErr;
  const funnelId = funnel.id as string;

  // 2) Etapas (Follow up 1..N, Assistiu/Checkout, Encerrado)
  const stageNames: string[] = [];
  for (let i = 1; i <= p.followUps; i++) stageNames.push(`Follow up ${i}`);
  stageNames.push('Assistiu / Checkout', 'Encerrado');
  const { data: stages, error: sErr } = await (supabase as any)
    .from('lead_funnel_stages')
    .insert(stageNames.map((name, i) => ({ funnel_id: funnelId, name, color: '#3b82f6', sort_order: i })))
    .select('id, name');
  if (sErr) throw sErr;
  const sid = (name: string) => (stages as any[]).find((s) => s.name === name)?.id as string;
  const assistiuId = sid('Assistiu / Checkout');
  const encerradoId = sid('Encerrado');

  // 3) Regra: webinar_attended → Assistiu/Checkout
  await (supabase as any).from('stage_transition_rules').insert({
    funnel_id: funnelId, event_name: 'webinar_attended', from_stage_id: null, to_stage_id: assistiuId,
  });

  // 4) Flows
  const flowA = buildFlowA(p, funnelId, encerradoId);
  const flowB = buildFlowB(p, funnelId, assistiuId);
  const { data: fa, error: aErr } = await (supabase as any)
    .from('wz_flows')
    .insert({ name: `${p.funnelName} — Não assistiu`, description: 'Sequência diária de convite (API Oficial)', is_active: false, nodes: flowA.nodes, edges: flowA.edges })
    .select('id').single();
  if (aErr) throw aErr;
  const { data: fb, error: bErr } = await (supabase as any)
    .from('wz_flows')
    .insert({ name: `${p.funnelName} — Assistiu`, description: 'Pós-webinário: checkout (API Oficial)', is_active: false, nodes: flowB.nodes, edges: flowB.edges })
    .select('id').single();
  if (bErr) throw bErr;

  // 5) Vincula os flows ao funil (best-effort)
  try {
    await (supabase as any).from('lead_funnel_automations').insert([
      { funnel_id: funnelId, wz_flow_id: fa.id, trigger_events: ['signup'], is_active: false, show_in_automations: true },
      { funnel_id: funnelId, wz_flow_id: fb.id, trigger_events: ['webinar_attended'], is_active: false, show_in_automations: true },
    ]);
  } catch (e) {
    console.warn('[webinarPreset] vínculo de automação falhou (segue):', (e as Error).message);
  }

  return { funnelId, flowAId: fa.id as string, flowBId: fb.id as string };
}
