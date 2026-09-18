import { describe, it, expect } from 'vitest';
import {
  pickPrimaryJourney,
  canAccessFunnel,
  visibleJourney,
  isAutomationStage,
  type JourneyEntry,
} from '../lib/leadStageNavigation';

const pos = (id: string, funnel: string, stage: string, entered?: string | null): JourneyEntry => ({
  id, funnel_id: funnel, stage_id: stage, entered_at: entered ?? null,
});

describe('pickPrimaryJourney', () => {
  it('escolhe o funil mexido por último', () => {
    const j = [
      pos('p1', 'f-base', 's1', '2026-09-10T10:00:00Z'),
      pos('p2', 'f-recompra', 's2', '2026-09-17T18:00:00Z'),
      pos('p3', 'f-webinar', 's3', '2026-09-01T09:00:00Z'),
    ];
    expect(pickPrimaryJourney(j)?.funnel_id).toBe('f-recompra');
  });

  it('devolve null quando o lead não está em funil nenhum', () => {
    expect(pickPrimaryJourney([])).toBeNull();
  });

  it('não quebra quando falta entered_at', () => {
    const j = [pos('p1', 'f-a', 's1', null), pos('p2', 'f-b', 's2', '2026-09-17T18:00:00Z')];
    expect(pickPrimaryJourney(j)?.funnel_id).toBe('f-b');
  });

  it('com todas as datas ausentes, mantém a primeira (ordem estável)', () => {
    const j = [pos('p1', 'f-a', 's1', null), pos('p2', 'f-b', 's2', null)];
    expect(pickPrimaryJourney(j)?.funnel_id).toBe('f-a');
  });

  it('ignora data inválida', () => {
    const j = [pos('p1', 'f-a', 's1', 'não é data'), pos('p2', 'f-b', 's2', '2026-09-17T18:00:00Z')];
    expect(pickPrimaryJourney(j)?.funnel_id).toBe('f-b');
  });
});

describe('canAccessFunnel', () => {
  it('admin vê qualquer funil', () => {
    expect(canAccessFunnel('f-x', { isAdmin: true, access: [] })).toBe(true);
  });

  it('vendedora vê funil liberado individualmente', () => {
    expect(canAccessFunnel('f-x', { isAdmin: false, access: [{ funnel_id: 'f-x' }] })).toBe(true);
  });

  it('vendedora vê funil pela campanha inteira', () => {
    expect(canAccessFunnel('f-x', {
      isAdmin: false,
      access: [{ campaign_id: 'c-1' }],
      funnelCampaignId: 'c-1',
    })).toBe(true);
  });

  it('acesso a UM funil da campanha não libera os outros da mesma campanha', () => {
    expect(canAccessFunnel('f-y', {
      isAdmin: false,
      access: [{ campaign_id: 'c-1', funnel_id: 'f-x' }],
      funnelCampaignId: 'c-1',
    })).toBe(false);
  });

  it('vendedora sem acesso não vê', () => {
    expect(canAccessFunnel('f-x', { isAdmin: false, access: [{ funnel_id: 'f-outro' }] })).toBe(false);
  });
});

describe('visibleJourney', () => {
  const j = [pos('p1', 'f-permitido', 's1'), pos('p2', 'f-proibido', 's2')];

  it('filtra para a vendedora', () => {
    const v = visibleJourney(j, { isAdmin: false, access: [{ funnel_id: 'f-permitido' }] });
    expect(v.map((x) => x.funnel_id)).toEqual(['f-permitido']);
  });

  it('não filtra para admin', () => {
    expect(visibleJourney(j, { isAdmin: true, access: [] })).toHaveLength(2);
  });
});

describe('isAutomationStage', () => {
  it('reconhece etapa de espera da campanha', () => {
    expect(isAutomationStage('s-espera', ['s-espera', 's-outra'])).toBe(true);
  });

  it('etapa comum não pede confirmação', () => {
    expect(isAutomationStage('s-normal', ['s-espera'])).toBe(false);
  });

  it('lista vazia não trava nada', () => {
    expect(isAutomationStage('s-normal', [])).toBe(false);
  });
});
