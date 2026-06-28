import { describe, it, expect } from 'vitest';
import { classifyTransaction } from '@/lib/classifyTransaction';
import { classifyWithProducts } from '@/hooks/useAllSales';

// Rede de segurança da classificação de vendas (incidente 28/06: order
// bumps/upsells sumiam do dash). A fonte de verdade é o banco
// (funnel_position via funnel_products); estes testes travam o contrato.

describe('classifyWithProducts — fonte de verdade durável', () => {
  it('usa funnel_position do banco quando presente (ignora fallback)', () => {
    // Produto que o hardcoded jogaria em "other" (Articulabem promoção),
    // mas que a view já classificou como "principal".
    expect(classifyWithProducts({ funnel_position: 'principal', product_name: 'Articulabem - 6 potes Promoção' })).toBe('principal');
    expect(classifyWithProducts({ funnel_position: 'bump1', product_name: 'Pote Extra ArticulaBEM' })).toBe('bump1');
    expect(classifyWithProducts({ funnel_position: 'upsell1', product_name: 'Qualquer coisa' })).toBe('upsell1');
  });

  it('funnel_position vence mesmo sem funnelProducts no contexto', () => {
    expect(classifyWithProducts({ funnel_position: 'principal' }, undefined)).toBe('principal');
  });

  it('cai no fallback quando não há funnel_position', () => {
    // 1777999197 = Articulabem 3 Potes VSL (principal) no mapa hardcoded
    expect(classifyWithProducts({ product_id: '1777999197', product_name: 'Articulabem - 3 Potes (VSL)' })).toBe('principal');
  });
});

describe('classifyTransaction — fallback hardcoded (product_id conhecido)', () => {
  it('classifica os product_ids principais e upsells conhecidos', () => {
    expect(classifyTransaction({ product_id: '1777999197', product_name: 'Articulabem 3 Potes VSL' })).toBe('principal');
    expect(classifyTransaction({ product_id: '1781803362', product_name: 'Articulabem 3 Potes Upsell 1' })).toBe('upsell1');
    expect(classifyTransaction({ product_id: '105335', product_name: 'qualquer' })).toBe('principal');
  });

  it('reconhece o front do Guia de Tinturas por nome', () => {
    expect(classifyTransaction({ product_id: '46342', product_name: 'COMO PREPARAR TINTURAS DE ERVAS MEDICINAIS' })).toBe('principal');
  });

  it('produto desconhecido cai em other (o motor de IA mapeia depois)', () => {
    expect(classifyTransaction({ product_id: '99999999', product_name: 'Produto Totalmente Novo XYZ' })).toBe('other');
  });
});
