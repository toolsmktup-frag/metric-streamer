// ════════════════════════════════════════════════════════════════════
// Parser ÚNICO de quantidade de potes por compra.
// Usado pelos webhooks (ingestão) e pelo backfill histórico — fonte de
// verdade única para não divergir. Sem dependências de runtime (testável
// em vitest e em Deno).
//
// Precedência:
//   1. mapping  → quantidade vinda de product_offer_mappings (override exato)
//   2. parser_potes → regex "N potes" no offer_name/product_name
//   3. parser_dias  → regex "N dias" → potes = round(dias/30)
//   4. default  → 1 (baixa confiança, sinalizado para auditoria)
// ════════════════════════════════════════════════════════════════════

export type QuantitySource = "mapping" | "parser_potes" | "parser_dias" | "default";

export interface QuantityResult {
  quantity: number;
  source: QuantitySource;
}

export const DIAS_POR_POTE = 30;

// "3 potes", "3 Potes", "1 pote", "Leve 6 potes", "12 potes" → captura o número.
// \b evita casar dígitos colados a outras palavras.
const POTES_RE = /\b(\d{1,3})\s*potes?\b/i;
// "Pote 90 dias", "180 dias" → captura os dias (convertidos para potes).
const DIAS_RE = /\b(\d{1,4})\s*dias?\b/i;

function clampQty(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return Math.trunc(n);
}

/** Parser puro de texto (sem DB). Retorna null se nada casar. */
export function parseQuantityFromText(
  ...texts: Array<string | null | undefined>
): QuantityResult | null {
  // 1ª passada: "N potes" tem prioridade sobre "N dias"
  for (const t of texts) {
    if (!t) continue;
    const m = t.match(POTES_RE);
    if (m) {
      const q = clampQty(parseInt(m[1], 10));
      if (q) return { quantity: q, source: "parser_potes" };
    }
  }
  // 2ª passada: "N dias" → potes
  for (const t of texts) {
    if (!t) continue;
    const m = t.match(DIAS_RE);
    if (m) {
      const dias = parseInt(m[1], 10);
      const q = clampQty(Math.max(1, Math.round(dias / DIAS_POR_POTE)));
      if (q) return { quantity: q, source: "parser_dias" };
    }
  }
  return null;
}

/**
 * Resolve a quantidade final aplicando a precedência completa.
 * @param mappingQuantity quantidade já resolvida via product_offer_mappings (ou null)
 */
export function resolveQuantity(opts: {
  offerName?: string | null;
  productName?: string | null;
  mappingQuantity?: number | null;
}): QuantityResult {
  const mq = opts.mappingQuantity;
  if (typeof mq === "number" && mq > 0) {
    return { quantity: Math.trunc(mq), source: "mapping" };
  }
  const parsed = parseQuantityFromText(opts.offerName, opts.productName);
  if (parsed) return parsed;
  return { quantity: 1, source: "default" };
}
