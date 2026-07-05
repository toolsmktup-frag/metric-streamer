import { describe, it, expect } from "vitest";
import {
  parseQuantityFromText,
  resolveQuantity,
} from "../../supabase/functions/_shared/potQuantity";

describe("parseQuantityFromText — offers reais do banco", () => {
  const casos: Array<[string, number]> = [
    ["3 potes ArticulaBEM - Soulnaturi", 3],
    ["6 potes", 6],
    ["1 pote gratuito", 1],
    ["3 potes - Meteorico", 3],
    ["5 potes Supervita - promoçao", 5],
    ["12 potes  articulabem - meteorico", 12],
    ["Leve 6 potes do Articulabem com Desconto!", 6],
    ["3 Potes do Articulabem", 3],
    ["2 potes com desconto de black friday", 2],
    ["9 potes ArticulaBEM - Soulnaturi", 9],
    ["Upsell 1 - 3 potes ArticulaBEM - Soulnaturi", 3], // ignora o "1 -", pega "3 potes"
    ["Oferta 3 potes - 323,00", 3], // ignora o 323, pega "3 potes"
  ];
  for (const [texto, esperado] of casos) {
    it(`"${texto}" → ${esperado}`, () => {
      expect(parseQuantityFromText(texto)?.quantity).toBe(esperado);
      expect(parseQuantityFromText(texto)?.source).toBe("parser_potes");
    });
  }

  it("converte duração em potes: 'Pote 90 dias' → 3", () => {
    const r = parseQuantityFromText("Articulabem Pote 90 dias");
    expect(r?.quantity).toBe(3);
    expect(r?.source).toBe("parser_dias");
  });

  it("'Pote 360 dias' → 12 potes", () => {
    expect(parseQuantityFromText("Pote 360 dias")?.quantity).toBe(12);
  });

  it("'pote' no singular sem número = 1 ('Oferta Pote grátis')", () => {
    expect(parseQuantityFromText("Oferta Pote grátis")).toEqual({
      quantity: 1,
      source: "parser_potes",
    });
  });

  it("order bump 'Pote Extra ArticulaBEM (Bump do pote grátis)' → 1", () => {
    expect(
      parseQuantityFromText("Pote Extra ArticulaBEM - Soulnaturi (Bump do pote grátis)")?.quantity,
    ).toBe(1);
  });

  it("retorna null quando não há pote nem dias ('1 articulabem + 1 supervita')", () => {
    expect(parseQuantityFromText("1 articulabem + 1 supervita")).toBeNull();
  });

  it("ignora números absurdos (>100)", () => {
    expect(parseQuantityFromText("500 potes")).toBeNull();
  });
});

describe("resolveQuantity — precedência", () => {
  it("mapping tem prioridade sobre o texto", () => {
    const r = resolveQuantity({
      offerName: "3 potes ArticulaBEM",
      mappingQuantity: 6,
    });
    expect(r).toEqual({ quantity: 6, source: "mapping" });
  });

  it("sem mapping, usa o parser de texto", () => {
    const r = resolveQuantity({ offerName: "6 potes" });
    expect(r).toEqual({ quantity: 6, source: "parser_potes" });
  });

  it("default = 1 quando nada casa", () => {
    const r = resolveQuantity({ offerName: "Combo sem indicação", productName: null });
    expect(r).toEqual({ quantity: 1, source: "default" });
  });

  it("cai no product_name quando offer_name não tem quantidade", () => {
    const r = resolveQuantity({
      offerName: "Oferta especial",
      productName: "3 potes ArticulaBEM",
    });
    expect(r.quantity).toBe(3);
  });
});
