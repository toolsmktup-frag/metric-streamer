import { describe, it, expect } from 'vitest';
import { computeRecompra, pickReminderDays, type DurationTier } from '@/lib/recompra';

// Faixas reais do funil RECOMPRA - POTES
const TIERS: DurationTier[] = [
  { durationDays: 30, reminderDaysBefore: 7 },
  { durationDays: 90, reminderDaysBefore: 15 },
  { durationDays: 180, reminderDaysBefore: 15 },
  { durationDays: 270, reminderDaysBefore: 20 },
  { durationDays: 360, reminderDaysBefore: 20 },
];

const TODAY = new Date('2026-06-11T12:00:00Z');
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * 86400000);

describe('pickReminderDays', () => {
  it('escolhe a antecedência da faixa correta', () => {
    expect(pickReminderDays(TIERS, 30)).toBe(7);
    expect(pickReminderDays(TIERS, 90)).toBe(15);
    expect(pickReminderDays(TIERS, 150)).toBe(15); // entre 90 e 180 → usa 90
    expect(pickReminderDays(TIERS, 270)).toBe(20);
    expect(pickReminderDays(TIERS, 360)).toBe(20);
    expect(pickReminderDays(TIERS, 10)).toBe(7); // abaixo de tudo → menor faixa
  });
});

describe('computeRecompra', () => {
  it('A — comprou 3 potes ontem → ~74 dias (90d − 15 antecedência − 1)', () => {
    const r = computeRecompra([{ date: daysAgo(1), quantity: 3 }], TIERS, TODAY);
    expect(r).not.toBeNull();
    expect(r!.totalPots).toBe(3);
    expect(r!.totalDays).toBe(90);
    expect(r!.daysRemaining).toBe(74); // ontem + 90 − 15 = +74
    expect(r!.daysRemaining).toBeGreaterThan(0); // NÃO é negativo (o bug do -979d)
  });

  it('B — SOMA: 3 potes há 40d + 6 potes ontem → estoque estende', () => {
    const r = computeRecompra(
      [
        { date: daysAgo(40), quantity: 3 },
        { date: daysAgo(1), quantity: 6 },
      ],
      TIERS,
      TODAY,
    );
    expect(r!.totalPots).toBe(9); // somou
    // estoque: (-40+90)=+50 ainda futuro → +50+180 = +230; antecedência(270)=20 → +210
    expect(r!.daysRemaining).toBe(210);
    // prova que somou: NÃO ficou só com os 165 da compra de 6 potes
    expect(r!.daysRemaining).toBeGreaterThan(165);
  });

  it('C — recompra após o estoque zerar reinicia o ciclo', () => {
    // 1 pote há 200 dias (estoque zerou) + 3 potes ontem
    const r = computeRecompra(
      [
        { date: daysAgo(200), quantity: 1 },
        { date: daysAgo(1), quantity: 3 },
      ],
      TIERS,
      TODAY,
    );
    expect(r!.totalPots).toBe(4);
    // o primeiro pote (30d) zerou há muito; reinicia em ontem + 90 (3 potes); antecedência(120)=15
    // estoque final = ontem + 90 = +89; recontato = +89 − 15 = +74
    expect(r!.daysRemaining).toBe(74);
  });

  it('D — sem compras de pote → null (sem badge, fim do -979d)', () => {
    expect(computeRecompra([], TIERS, TODAY)).toBeNull();
  });

  it('E — quem comprou 1 pote ontem NÃO aparece atrasado', () => {
    const r = computeRecompra([{ date: daysAgo(1), quantity: 1 }], TIERS, TODAY);
    expect(r!.daysRemaining).toBe(22); // ontem + 30 − 7 = +22
    expect(r!.daysRemaining).toBeGreaterThan(0);
  });
});
