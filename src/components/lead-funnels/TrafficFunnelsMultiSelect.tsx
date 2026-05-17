import React, { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, Ban } from 'lucide-react';

interface TrafficFunnelOption {
  id: string;
  name: string;
  color?: string;
}

interface Props {
  options: TrafficFunnelOption[];
  /** IDs atualmente selecionados (M:N + principal). */
  selectedIds: string[];
  /** Se true, ignora qualquer associação (mesmo a herdada da campanha). */
  ignore: boolean;
  onChange: (selectedIds: string[], ignore: boolean) => void;
  /** Texto exibido quando nada está selecionado e nada ignorado. */
  placeholder?: string;
  /** Texto para a opção "herdar da campanha" (apenas display, sem ação). */
  inheritedLabel?: string | null;
  disabled?: boolean;
  className?: string;
}

const TrafficFunnelsMultiSelect: React.FC<Props> = ({
  options,
  selectedIds,
  ignore,
  onChange,
  placeholder = 'Sem funil de tráfego',
  inheritedLabel,
  disabled,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const byId = useMemo(() => new Map(options.map(o => [o.id, o])), [options]);

  const label = ignore
    ? '🚫 Ignorar tráfego'
    : selectedIds.length === 0
      ? (inheritedLabel || placeholder)
      : selectedIds.length === 1
        ? (byId.get(selectedIds[0])?.name || '1 funil')
        : `${selectedIds.length} funis`;

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter(x => x !== id)
      : [...selectedIds, id];
    onChange(next, false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={`h-7 px-2 text-xs font-normal justify-between max-w-[200px] ${className || ''}`}
          onClick={(e) => e.stopPropagation()}
          title={label}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3 w-3 ml-1 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-0"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-2 border-b border-border">
          <button
            type="button"
            onClick={() => { onChange([], true); setOpen(false); }}
            className="flex items-center gap-2 w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
          >
            <Ban className="h-3.5 w-3.5 text-destructive" />
            Ignorar funil de tráfego
          </button>
          <button
            type="button"
            onClick={() => { onChange([], false); setOpen(false); }}
            className="block w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted text-muted-foreground"
          >
            Nenhum (limpar)
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {options.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">Nenhum funil de tráfego.</p>
          )}
          {options.map(opt => {
            const checked = !ignore && selectedIds.includes(opt.id);
            return (
              <label
                key={opt.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(opt.id)} />
                {opt.color && (
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                )}
                <span className="truncate flex-1">{opt.name}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TrafficFunnelsMultiSelect;
