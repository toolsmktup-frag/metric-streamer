import React from 'react';
import { Copy, Power, PowerOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WzNodeToolbarProps {
  visible: boolean;
  disabled?: boolean;
  onToggleDisable?: () => void;
  onDuplicate?: () => void;
}

export default function WzNodeToolbar({ visible, disabled, onToggleDisable, onDuplicate }: WzNodeToolbarProps) {
  if (!visible) return null;

  return (
    <div className="absolute -top-9 right-0 z-20 flex items-center gap-1 bg-card border border-border rounded-lg shadow-lg px-1 py-0.5">
      <button
        type="button"
        title={disabled ? 'Ativar (D)' : 'Desativar (D)'}
        className={cn(
          'p-1.5 rounded-md hover:bg-muted transition-colors',
          disabled ? 'text-destructive' : 'text-emerald-500'
        )}
        onClick={(e) => { e.stopPropagation(); onToggleDisable?.(); }}
      >
        {disabled ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        title="Duplicar (Ctrl+C → Ctrl+V)"
        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
        onClick={(e) => { e.stopPropagation(); onDuplicate?.(); }}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
