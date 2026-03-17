import React from 'react';

interface StatusBadgeProps {
  status: 'active' | 'paused' | 'error';
}

const StatusBadge = React.memo(function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    active: { label: 'Ativo', dotClass: 'bg-primary animate-pulse-dot', bgClass: 'bg-primary/10' },
    paused: { label: 'Pausado', dotClass: 'bg-muted-foreground', bgClass: 'bg-muted' },
    error: { label: 'Erro', dotClass: 'bg-destructive', bgClass: 'bg-destructive/10' },
  };
  const { label, dotClass, bgClass } = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${bgClass}`}>
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
});

export default StatusBadge;
