import { describe, it, expect } from 'vitest';
import {
  isDripFlow,
  parseWebinarFlow,
  applyDailyTimeUtc,
  applyDayTags,
  applyWebinarUrl,
  brtToUtc,
  utcToBrt,
  type WzNodeLike,
  type WzEdgeLike,
} from '@/lib/webinarFlowParser';

// Fixture no padrão real do flow do webinário (3 dias + etapa final)
function buildDripFixture() {
  const nodes: WzNodeLike[] = [
    { id: 't', type: 'trigger', data: { triggerType: 'purchase_approved' }, position: { x: 0, y: 0 } },
  ];
  const edges: WzEdgeLike[] = [];
  let prev = 't';
  for (let i = 1; i <= 3; i++) {
    nodes.push(
      { id: `sd${i}`, type: 'smart_delay', data: { targetTime: '12:00', targetDay: 'any', label: `Dia ${i}` } },
      { id: `mc${i}`, type: 'manychat', data: { tagName: `webinar_d${i}`, label: `Tag d${i}` } },
      { id: `ms${i}`, type: 'move_stage', data: { stageName: `Follow Up 0${i}`, stageId: `stage-${i}`, funnelId: 'f1' } },
    );
    edges.push({ source: prev, target: `sd${i}` }, { source: `sd${i}`, target: `mc${i}` }, { source: `mc${i}`, target: `ms${i}` });
    prev = `ms${i}`;
  }
  nodes.push({ id: 'end', type: 'move_stage', data: { stageName: 'Encerrado', stageId: 'stage-end', funnelId: 'f1' } });
  edges.push({ source: prev, target: 'end' });
  return { nodes, edges };
}

describe('isDripFlow', () => {
  it('detecta flow com smart_delay + manychat', () => {
    const { nodes, edges } = buildDripFixture();
    expect(isDripFlow(nodes, edges)).toBe(true);
  });

  it('rejeita flow sem manychat', () => {
    const nodes: WzNodeLike[] = [
      { id: 'a', type: 'trigger' },
      { id: 'b', type: 'smart_delay', data: { targetTime: '09:00' } },
      { id: 'c', type: 'whatsapp', data: {} },
    ];
    expect(isDripFlow(nodes, [])).toBe(false);
  });
});

describe('parseWebinarFlow', () => {
  it('parseia 3 dias na ordem, com tag, coluna e etapa final', () => {
    const { nodes, edges } = buildDripFixture();
    const parse = parseWebinarFlow(nodes, edges);
    expect(parse.days).toHaveLength(3);
    expect(parse.days.map(d => d.tagName)).toEqual(['webinar_d1', 'webinar_d2', 'webinar_d3']);
    expect(parse.days.map(d => d.stageName)).toEqual(['Follow Up 01', 'Follow Up 02', 'Follow Up 03']);
    expect(parse.days.map(d => d.dayNumber)).toEqual([1, 2, 3]);
    expect(parse.finalStage?.stageName).toBe('Encerrado');
    expect(parse.commonTimeUtc).toBe('12:00');
    expect(parse.warnings).toHaveLength(0);
  });

  it('degrada com warnings quando um dia não tem move_stage', () => {
    const nodes: WzNodeLike[] = [
      { id: 't', type: 'trigger' },
      { id: 'sd1', type: 'smart_delay', data: { targetTime: '12:00' } },
      { id: 'mc1', type: 'manychat', data: { tagName: 'x' } },
      { id: 'sd2', type: 'smart_delay', data: { targetTime: '13:00' } },
      { id: 'mc2', type: 'manychat', data: {} },
    ];
    const edges: WzEdgeLike[] = [
      { source: 't', target: 'sd1' },
      { source: 'sd1', target: 'mc1' },
      { source: 'mc1', target: 'sd2' },
      { source: 'sd2', target: 'mc2' },
    ];
    const parse = parseWebinarFlow(nodes, edges);
    expect(parse.days).toHaveLength(2);
    expect(parse.commonTimeUtc).toBeNull();
    expect(parse.warnings.length).toBeGreaterThan(0);
  });

  it('não entra em loop com edges circulares', () => {
    const nodes: WzNodeLike[] = [
      { id: 't', type: 'trigger' },
      { id: 'sd1', type: 'smart_delay', data: { targetTime: '12:00' } },
      { id: 'mc1', type: 'manychat', data: { tagName: 'x' } },
    ];
    const edges: WzEdgeLike[] = [
      { source: 't', target: 'sd1' },
      { source: 'sd1', target: 'mc1' },
      { source: 'mc1', target: 'sd1' },
    ];
    const parse = parseWebinarFlow(nodes, edges);
    expect(parse.days.length).toBeGreaterThanOrEqual(1);
  });
});

describe('serializers imutáveis', () => {
  it('applyDailyTimeUtc troca só o targetTime dos smart_delay, sem mutar o original', () => {
    const { nodes } = buildDripFixture();
    const before = JSON.stringify(nodes);
    const out = applyDailyTimeUtc(nodes, '00:30');
    expect(JSON.stringify(nodes)).toBe(before);
    for (const n of out) {
      if (n.type === 'smart_delay') {
        expect(n.data?.targetTime).toBe('00:30');
        expect(n.data?.targetDay).toBe('any'); // resto preservado
      } else {
        expect(n).toBe(nodes.find(o => o.id === n.id)); // referência intacta
      }
    }
  });

  it('applyDayTags troca só a tagName dos nós indicados', () => {
    const { nodes } = buildDripFixture();
    const out = applyDayTags(nodes, [{ nodeId: 'mc2', tagName: 'nova_tag' }]);
    expect(out.find(n => n.id === 'mc2')?.data?.tagName).toBe('nova_tag');
    expect(out.find(n => n.id === 'mc1')?.data?.tagName).toBe('webinar_d1');
    expect(out.find(n => n.id === 'mc2')?.data?.label).toBe('Tag d2'); // resto preservado
  });
});

describe('condition no meio da sequência (regra "já comprou → sai")', () => {
  it('atravessa condition pelo ramo "no" e parseia os dias normalmente', () => {
    const nodes: WzNodeLike[] = [
      { id: 't', type: 'trigger' },
      { id: 'sd1', type: 'smart_delay', data: { targetTime: '12:00' } },
      { id: 'cond1', type: 'condition', data: { variable: 'tag', operator: 'contains', compareValue: 'erveiros_aluno' } },
      { id: 'saida', type: 'move_stage', data: { stageName: 'Encerrado' } },
      { id: 'fim', type: 'stop' },
      { id: 'mc1', type: 'manychat', data: { tagName: 'webinar_d1', webinarUrl: 'https://live.exemplo.com' } },
      { id: 'ms1', type: 'move_stage', data: { stageName: 'Follow Up 01' } },
    ];
    const edges: WzEdgeLike[] = [
      { source: 't', target: 'sd1' },
      { source: 'sd1', target: 'cond1' },
      { source: 'cond1', target: 'saida', sourceHandle: 'yes' },
      { source: 'saida', target: 'fim' },
      { source: 'cond1', target: 'mc1', sourceHandle: 'no' },
      { source: 'mc1', target: 'ms1' },
    ];
    const parse = parseWebinarFlow(nodes, edges);
    expect(parse.days).toHaveLength(1);
    expect(parse.days[0].tagName).toBe('webinar_d1');
    expect(parse.days[0].webinarUrl).toBe('https://live.exemplo.com');
    expect(parse.days[0].stageName).toBe('Follow Up 01');
    expect(parse.warnings).toHaveLength(0);
  });
});

describe('applyWebinarUrl', () => {
  it('grava a URL só nos nós manychat, sem mutar o original', () => {
    const { nodes } = buildDripFixture();
    const before = JSON.stringify(nodes);
    const out = applyWebinarUrl(nodes, 'https://live.exemplo.com/sala');
    expect(JSON.stringify(nodes)).toBe(before);
    for (const n of out) {
      if (n.type === 'manychat') {
        expect(n.data?.webinarUrl).toBe('https://live.exemplo.com/sala');
        expect(n.data?.tagName).toMatch(/^webinar_d/);
      } else {
        expect(n.data?.webinarUrl).toBeUndefined();
      }
    }
  });

  it('string vazia remove o campo (desliga o rastreio)', () => {
    const { nodes } = buildDripFixture();
    const withUrl = applyWebinarUrl(nodes, 'https://x.com');
    const cleared = applyWebinarUrl(withUrl, '  ');
    for (const n of cleared) {
      expect(n.data?.webinarUrl).toBeUndefined();
    }
  });
});

describe('conversão BRT ↔ UTC', () => {
  it('converte com virada de dia', () => {
    expect(brtToUtc('21:30')).toBe('00:30');
    expect(utcToBrt('00:30')).toBe('21:30');
    expect(brtToUtc('09:00')).toBe('12:00');
    expect(utcToBrt('12:00')).toBe('09:00');
  });

  it('round-trip é identidade', () => {
    for (const t of ['00:00', '05:45', '12:00', '23:59']) {
      expect(utcToBrt(brtToUtc(t))).toBe(t);
    }
  });
});
