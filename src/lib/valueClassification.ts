import type { ValueClassification } from '@/types/leadFunnels';

/** Default classification based on canonical event names */
const EVENT_CLASSIFICATION: Record<string, ValueClassification> = {
  purchase: 'positive',
  pix_generated: 'pending',
  abandoned_cart: 'negative',
  refused: 'negative',
  refunded: 'negative',
  chargeback: 'negative',
  canceled: 'negative',
};

export function getDefaultClassification(eventName: string): ValueClassification {
  return EVENT_CLASSIFICATION[eventName] ?? 'negative';
}

export function classificationLabel(c: ValueClassification): string {
  switch (c) {
    case 'positive': return 'Receita';
    case 'pending': return 'Pendente';
    case 'negative': return 'Recuperar';
  }
}

export function classificationColor(c: ValueClassification): string {
  switch (c) {
    case 'positive': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
    case 'pending': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10';
    case 'negative': return 'text-destructive bg-destructive/10';
  }
}

/** Extract the monetary value from lead metadata (Guru amount or Ticto amount_cents) */
export function extractMetadataAmount(metadata: Record<string, unknown> | undefined): number {
  if (!metadata) return 0;
  const amount = Number(metadata.amount);
  if (amount > 0) return amount;
  const cents = Number(metadata.amount_cents);
  if (cents > 0) return cents / 100;
  return 0;
}
