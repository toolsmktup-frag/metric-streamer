import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EyeOff, GripVertical, Link2, Settings2, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LeadFunnelStage } from '@/types/leadFunnels';
import TrackingSnippetPopover from './TrackingSnippetPopover';

interface SortableStageItemProps {
  stage: Partial<LeadFunnelStage>;
  idx: number;
  sortableId: string;
  funnelId?: string;
  defaultColor: string;
  stageOptions?: { id: string; name: string }[];
  onUpdate: (idx: number, field: string, value: string | boolean) => void;
  onRemove: (idx: number) => void;
}

const SortableStageItem: React.FC<SortableStageItemProps> = ({
  stage, idx, sortableId, funnelId, defaultColor, stageOptions = [], onUpdate, onRemove,
}) => {
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const filteredOptions = stageOptions.filter(o => o.id !== stage.id && !o.id.startsWith('temp-'));

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-border/60 bg-card p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing" aria-label="Reordenar etapa">
          <GripVertical className="h-4 w-4" />
        </button>
        <label className="relative inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full ring-1 ring-border" style={{ backgroundColor: stage.color || defaultColor }} title="Cor da etapa">
          <input
            type="color"
            value={stage.color || defaultColor}
            onChange={e => onUpdate(idx, 'color', e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Cor da etapa"
          />
        </label>
        <Input
          value={stage.name || ''}
          onChange={e => onUpdate(idx, 'name', e.target.value)}
          placeholder="Nome da etapa"
          className="h-9 flex-1 min-w-0 font-medium"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setAdvancedOpen(open => !open)}
          aria-expanded={advancedOpen}
          className="h-9 w-9 shrink-0"
          title="Configurações avançadas"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <div className="space-y-1 min-w-0">
          <span className="text-xs font-medium text-muted-foreground">Aparece no desenho após</span>
          <Select
            value={stage.visual_parent_stage_id || 'root'}
            onValueChange={value => onUpdate(idx, 'visual_parent_stage_id', value === 'root' ? '' : value)}
            disabled={!stage.id}
          >
            <SelectTrigger className="h-9 w-full min-w-0">
              <SelectValue placeholder="Posição no desenho" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Início do funil</SelectItem>
              {filteredOptions.map(option => (
                <SelectItem key={option.id} value={option.id}>Depois de {option.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-0">
          <span className="text-xs font-medium text-muted-foreground">Conversão calculada sobre</span>
          <Select
            value={stage.conversion_base_stage_id || 'previous'}
            onValueChange={value => onUpdate(idx, 'conversion_base_stage_id', value === 'previous' ? '' : value)}
            disabled={!stage.id}
          >
            <SelectTrigger className="h-9 w-full min-w-0">
              <SelectValue placeholder="Base de cálculo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="previous">Etapa anterior</SelectItem>
              {filteredOptions.map(option => (
                <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {advancedOpen && (
        <div className="mt-3 grid grid-cols-[minmax(14rem,1fr)_auto_auto] items-end gap-3 border-t border-border pt-3 max-lg:grid-cols-1">
          <div className="space-y-1 min-w-0">
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Link2 className="h-3.5 w-3.5" /> URL e rastreamento
            </span>
            <Input
              value={stage.page_url || ''}
              onChange={e => onUpdate(idx, 'page_url', e.target.value)}
              placeholder="URL da página (opcional)"
              className="min-w-0"
            />
          </div>
          <div className="flex items-center gap-2">
            {stage.page_url && funnelId && stage.id && (
              <TrackingSnippetPopover
                funnelId={funnelId}
                stageId={stage.id}
                stageName={stage.name || `Etapa ${idx + 1}`}
                pageUrl={stage.page_url}
              />
            )}
            <div className="flex items-center gap-1.5 shrink-0" title="Ocultar valores para vendedores">
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
              <Switch
                checked={!!stage.hide_values}
                onCheckedChange={checked => onUpdate(idx, 'hide_values', checked)}
              />
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onRemove(idx)} className="shrink-0 justify-self-end" title="Remover etapa">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default SortableStageItem;
