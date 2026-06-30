export interface WeightedSeller {
  id: string;
  weight: number;
}

/**
 * Weighted round-robin determinístico: distribui `count` itens entre os
 * vendedores conforme os pesos, escolhendo a cada passo quem tem o menor
 * (recebidos + 1) / peso. Espalha bem (intercala) e converge à proporção —
 * mesmo critério da RPC `assign_lead_by_distribution` (distribuição automática).
 *
 * Retorna a sequência de sellerIds (tamanho = count). Só entram pesos > 0.
 * Determinístico: empates resolvidos pela ordem de id (asc).
 */
export function weightedSequence(count: number, sellers: WeightedSeller[]): string[] {
  const active = sellers
    .filter(s => s.weight > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!active.length || count <= 0) return [];

  const received: Record<string, number> = {};
  active.forEach(s => {
    received[s.id] = 0;
  });

  const seq: string[] = [];
  for (let i = 0; i < count; i++) {
    let best = active[0];
    let bestScore = (received[best.id] + 1) / best.weight;
    for (const s of active) {
      const score = (received[s.id] + 1) / s.weight;
      // < com tolerância: no empate mantém o `best` atual (menor id, pela ordenação)
      if (score < bestScore - 1e-9) {
        best = s;
        bestScore = score;
      }
    }
    received[best.id]++;
    seq.push(best.id);
  }
  return seq;
}

/** Contagem final por vendedor resultante de weightedSequence (para preview). */
export function weightedCounts(count: number, sellers: WeightedSeller[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of weightedSequence(count, sellers)) {
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}
