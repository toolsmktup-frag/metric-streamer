import { describe, it, expect } from 'vitest';
import { computeRecompra as front, type DurationTier } from '@/lib/recompra';
// Cópia que roda no edge (Deno) — deve produzir resultados IDÊNTICOS ao front.
import { computeRecompra as edge } from '../../supabase/functions/_shared/recompra';

const tiers: DurationTier[] = [
  { durationDays: 30, reminderDaysBefore: 7 },
  { durationDays: 90, reminderDaysBefore: 15 },
  { durationDays: 180, reminderDaysBefore: 15 },
  { durationDays: 270, reminderDaysBefore: 20 },
  { durationDays: 360, reminderDaysBefore: 20 },
];

const today = new Date('2026-06-11T12:00:00.000Z');

const cases = [
  { label: '1 pote, há 40 dias (vencido)', purchases: [{ date: new Date('2026-05-02T00:00:00Z'), quantity: 1 }] },
  { label: '3 potes, há 10 dias (no prazo)', purchases: [{ date: new Date('2026-06-01T00:00:00Z'), quantity: 3 }] },
  { label: 'estoque que estende (2 compras antes de acabar)', purchases: [
    { date: new Date('2026-03-01T00:00:00Z'), quantity: 1 },
    { date: new Date('2026-03-20T00:00:00Z'), quantity: 1 },
  ] },
  { label: 'estoque zerado e recompra reinicia', purchases: [
    { date: new Date('2026-01-01T00:00:00Z'), quantity: 1 },
    { date: new Date('2026-05-20T00:00:00Z'), quantity: 2 },
  ] },
  { label: '12 potes', purchases: [{ date: new Date('2026-02-01T00:00:00Z'), quantity: 12 }] },
];

describe('paridade front × edge (computeRecompra)', () => {
  for (const c of cases) {
    it(c.label, () => {
      const a = front(c.purchases, tiers, today);
      const b = edge(c.purchases, tiers, today);
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(b!.totalPots).toBe(a!.totalPots);
      expect(b!.totalDays).toBe(a!.totalDays);
      expect(b!.reminderDaysBefore).toBe(a!.reminderDaysBefore);
      expect(b!.daysRemaining).toBe(a!.daysRemaining);
      expect(b!.stockEndsAt.getTime()).toBe(a!.stockEndsAt.getTime());
      expect(b!.recontactAt.getTime()).toBe(a!.recontactAt.getTime());
    });
  }
});
