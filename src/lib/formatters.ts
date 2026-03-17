export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace('.', ',')}K`;
  return value.toLocaleString('pt-BR');
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1).replace('.', ',')}%`;
}

export function formatDecimal(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

export function formatRoas(value: number): string {
  return `${value.toFixed(2).replace('.', ',')}x`;
}

export function formatVariation(value: number): string {
  const sign = value >= 0 ? '↑' : '↓';
  return `${sign} ${Math.abs(value).toFixed(1).replace('.', ',')}%`;
}

export function getRoasColor(value: number): string {
  if (value >= 1.5) return 'text-roas-good';
  if (value >= 1) return 'text-roas-mid';
  return 'text-roas-bad';
}

export function getProfitColor(value: number): string {
  return value >= 0 ? 'text-kpi-positive' : 'text-kpi-negative';
}

export function getVariationColor(value: number): string {
  return value >= 0 ? 'text-kpi-positive' : 'text-kpi-negative';
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s atrás`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h atrás`;
}
