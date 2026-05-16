import React from 'react';
import { useGuruAccounts } from '@/hooks/useGuruAccounts';

interface GuruAccountBadgeProps {
  slug?: string | null;
  size?: 'sm' | 'xs';
  className?: string;
}

/**
 * Badge colorido identificando a conta Guru de origem (Soulnaturi, Articulabem...).
 * Renderiza null se slug ausente ou desconhecido.
 */
const GuruAccountBadge: React.FC<GuruAccountBadgeProps> = ({ slug, size = 'xs', className = '' }) => {
  const { data: accounts = [] } = useGuruAccounts();
  if (!slug) return null;
  const acc = accounts.find(a => a.account_slug === slug);
  if (!acc) return null;

  const sizeCls = size === 'sm'
    ? 'text-[10px] px-1.5 py-0.5'
    : 'text-[9px] px-1.5 py-0 h-4';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-semibold ${sizeCls} ${className}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${acc.color} 18%, transparent)`,
        color: acc.color,
        borderColor: `color-mix(in srgb, ${acc.color} 35%, transparent)`,
        borderWidth: '1px',
        borderStyle: 'solid',
      }}
      title={`Conta Guru: ${acc.display_name}`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: acc.color }} />
      {acc.display_name}
    </span>
  );
};

export default GuruAccountBadge;
