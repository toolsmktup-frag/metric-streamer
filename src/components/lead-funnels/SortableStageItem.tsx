import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, EyeOff } from 'lucide-react';
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-wrap items-center gap-2 bg-muted/50 rounded-lg p-2">
      <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
      <input
        type="color"
        value={stage.color || defaultColor}
        onChange={e => onUpdate(idx, 'color', e.target.value)}
        className="w-8 h-8 rounded border-0 cursor-pointer"
      />
      <Input
        value={stage.name || ''}
        onChange={e => onUpdate(idx, 'name', e.target.value)}
        placeholder="Nome da etapa"
        className="flex-1"
      />
      <Input
        value={stage.page_url || ''}
        onChange={e => onUpdate(idx, 'page_url', e.target.value)}
        placeholder="URL da página (opcional)"
        className="flex-1"
      />
      <Select
        value={stage.conversion_base_stage_id || 'previous'}
        onValueChange={value => onUpdate(idx, 'conversion_base_stage_id', value === 'previous' ? '' : value)}
        disabled={!stage.id}
      >
        <SelectTrigger className="w-[220px] shrink-0">
          <SelectValue placeholder="Base de conversão" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="previous">Base automática</SelectItem>
          {stageOptions
            .filter(option => option.id !== stage.id && !option.id.startsWith('temp-'))
            .map(option => (
              <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Select
        value={stage.visual_parent_stage_id || 'root'}
        onValueChange={value => onUpdate(idx, 'visual_parent_stage_id', value === 'root' ? '' : value)}
        disabled={!stage.id}
      >
        <SelectTrigger className="w-[220px] shrink-0">
          <SelectValue placeholder="Aparece depois de" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="root">Raiz / sem pai</SelectItem>
          {stageOptions
            .filter(option => option.id !== stage.id && !option.id.startsWith('temp-'))
            .map(option => (
              <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
            ))}
        </SelectContent>
      </Select>
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
          onCheckedChange={checked => onUpdate(idx, 'hide_values', checked as any)}
        />
      </div>
      <Button variant="ghost" size="icon" onClick={() => onRemove(idx)} className="shrink-0">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
};

export default SortableStageItem;
