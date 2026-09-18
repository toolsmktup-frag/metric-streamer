import { describe, it, expect } from 'vitest';
import {
  detectUpsellContext,
  isPreSaleTrigger,
  type RecentPurchase,
} from '../../supabase/functions/_shared/upsellContext';

// Caso real de 17/09/2026 — Ricardo Castro, +55 92 8277-1702:
//   09:41  pix_generated  46342 (Guia, R$ 47)
//   09:44  purchase_approved 46342  → recebeu o acesso
//   09:47  pix_generated  47629 (Curso Mestre, R$ 147 — order bump)
// O terceiro evento disparou "seu pedido não foi concluído" para quem tinha
// acabado de comprar. Ele precisa ser reconhecido como upsell.
const COMPRA_DO_GUIA: RecentPurchase = {
  productId: '46342',
  productName: 'COMO PREPARAR TINTURAS DE ERVAS MEDICINAIS',
  at: '2026-09-17T12:44:33.000Z', // 09:44 BRT
};
const AGORA = new Date('2026-09-17T12:47:00.000Z'); // 09:47 BRT

describe('detectUpsellContext', () => {
  it('reconhece o Pix do Curso Mestre logo após a compra do Guia', () => {
    const ctx = detectUpsellContext('47629', [COMPRA_DO_GUIA], 30, AGORA);
    expect(ctx.isUpsell).toBe(true);
    expect(ctx.recentPurchaseProductName).toBe('COMO PREPARAR TINTURAS DE ERVAS MEDICINAIS');
  });

  it('não marca upsell quando o Pix é do mesmo produto que foi comprado', () => {
    // segunda via do mesmo pedido não é upsell — é o próprio produto
    const ctx = detectUpsellContext('46342', [COMPRA_DO_GUIA], 30, AGORA);
    expect(ctx.isUpsell).toBe(false);
    expect(ctx.recentPurchaseProductName).toBeNull();
  });

  it('não marca upsell quando a compra é antiga (fora da janela)', () => {
    const tresHorasDepois = new Date('2026-09-17T15:47:00.000Z');
    const ctx = detectUpsellContext('47629', [COMPRA_DO_GUIA], 30, tresHorasDepois);
    expect(ctx.isUpsell).toBe(false);
  });

  it('não marca upsell quando não houve compra nenhuma', () => {
    const ctx = detectUpsellContext('47629', [], 30, AGORA);
    expect(ctx.isUpsell).toBe(false);
  });

  it('escolhe a compra mais recente quando há várias', () => {
    const outra: RecentPurchase = {
      productId: '99999',
      productName: 'Produto Anterior',
      at: '2026-09-17T12:30:00.000Z',
    };
    const ctx = detectUpsellContext('47629', [outra, COMPRA_DO_GUIA], 30, AGORA);
    expect(ctx.isUpsell).toBe(true);
    expect(ctx.recentPurchaseProductName).toBe('COMO PREPARAR TINTURAS DE ERVAS MEDICINAIS');
  });

  it('ignora compra sem product_id em vez de tratar como produto diferente', () => {
    const semId: RecentPurchase = { productId: null, productName: 'X', at: '2026-09-17T12:46:00.000Z' };
    const ctx = detectUpsellContext('47629', [semId], 30, AGORA);
    expect(ctx.isUpsell).toBe(false);
  });

  it('compara ids de tipos diferentes sem falso positivo', () => {
    const numerico: RecentPurchase = { productId: 47629, productName: 'Curso', at: '2026-09-17T12:46:00.000Z' };
    const ctx = detectUpsellContext('47629', [numerico], 30, AGORA);
    expect(ctx.isUpsell).toBe(false);
  });
});

describe('isPreSaleTrigger', () => {
  it('cobre os gatilhos que tratam o contato como quem não comprou', () => {
    for (const t of ['pix_generated', 'boleto_generated', 'cart_abandoned', 'pix_expired', 'payment_refused']) {
      expect(isPreSaleTrigger(t)).toBe(true);
    }
  });

  it('não inclui compra aprovada nem cancelamento', () => {
    expect(isPreSaleTrigger('purchase_approved')).toBe(false);
    expect(isPreSaleTrigger('cancellation')).toBe(false);
  });
});
