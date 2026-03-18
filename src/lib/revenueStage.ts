const REVENUE_KEYWORDS = ['comprador', 'compra', 'venda', 'cliente', 'vip', 'recorrente', 'aprovad'];

export function isRevenueStage(stageName: string): boolean {
  const lower = stageName.toLowerCase();
  return REVENUE_KEYWORDS.some(k => lower.includes(k));
}
