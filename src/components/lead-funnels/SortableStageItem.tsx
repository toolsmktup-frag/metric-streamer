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

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg bg-muted/50 p-3">
      <div className="grid grid-cols-[auto_auto_minmax(12rem,1.1fr)_minmax(13rem,1fr)_minmax(13rem,1fr)_auto] items-end gap-3 max-xl:grid-cols-[auto_auto_minmax(12rem,1fr)_minmax(13rem,1fr)_auto] max-lg:grid-cols-[auto_auto_1fr_auto]">
        <button type="button" {...attributes} {...listeners} className="mb-2 cursor-grab touch-none active:cursor-grabbing" aria-label="Reordenar etapa">
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
        <input
          type="color"
          value={stage.color || defaultColor}
          onChange={e => onUpdate(idx, 'color', e.target.value)}
          className="mb-1 h-9 w-9 rounded border-0 cursor-pointer"
          aria-label="Cor da etapa"
        />
        <div className="space-y-1 min-w-0 max-lg:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Etapa</span>
          <Input
            value={stage.name || ''}
            onChange={e => onUpdate(idx, 'name', e.target.value)}
            placeholder="Nome da etapa"
            className="min-w-0"
          />
        </div>
        <div className="space-y-1 min-w-0 max-xl:col-span-2 max-lg:col-span-4">
          <span className="text-xs font-medium text-muted-foreground">Aparece no desenho após</span>
          <Select
            value={stage.visual_parent_stage_id || 'root'}
            onValueChange={value => onUpdate(idx, 'visual_parent_stage_id', value === 'root' ? '' : value)}
            disabled={!stage.id}
          >
            <SelectTrigger className="w-full min-w-0">
              <SelectValue placeholder="Posição no desenho" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Início do funil</SelectItem>
              {stageOptions
                .filter(option => option.id !== stage.id && !option.id.startsWith('temp-'))
                .map(option => (
                  <SelectItem key={option.id} value={option.id}>Depois de {option.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-0 max-xl:col-span-2 max-lg:col-span-4">
          <span className="text-xs font-medium text-muted-foreground">Conversão calculada sobre</span>
          <Select
            value={stage.conversion_base_stage_id || 'previous'}
            onValueChange={value => onUpdate(idx, 'conversion_base_stage_id', value === 'previous' ? '' : value)}
            disabled={!stage.id}
          >
            <SelectTrigger className="w-full min-w-0">
              <SelectValue placeholder="Base de cálculo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="previous">Etapa anterior</SelectItem>
              {stageOptions
                .filter(option => option.id !== stage.id && !option.id.startsWith('temp-'))
                .map(option => (
                  <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setAdvancedOpen(open => !open)}
          aria-expanded={advancedOpen}
          className="mb-0.5 shrink-0"
          title="Configurações avançadas"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
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
