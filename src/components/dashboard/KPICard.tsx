import React from 'react';
import { LucideIcon, Info } from 'lucide-react';
import { formatVariation, getVariationColor } from '@/lib/formatters';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface KPICardProps {
  label: string;
  value: string;
  variation?: number;
  icon: LucideIcon;
  colorClass?: string;
  tooltip?: string;
}

const KPICard = React.memo(function KPICard({ label, value, variation, icon: Icon, colorClass = '', tooltip }: KPICardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">{label}</span>
              {tooltip && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs max-w-[200px]">{tooltip}</p></TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className={`text-2xl font-semibold font-mono-value tracking-tight ${colorClass}`}>
              {value}
            </p>
          </div>
        </div>
      </div>
      {variation !== undefined && (
        <div className={`mt-2 text-xs font-medium ${getVariationColor(variation)}`}>
          {formatVariation(variation)}
          <span className="text-muted-foreground ml-1">vs período anterior</span>
        </div>
      )}
    </div>
  );
});

export default KPICard;
