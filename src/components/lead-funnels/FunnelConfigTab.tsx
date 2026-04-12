import React, { useState, useEffect, useCallback } from 'react';
import { LeadFunnelStage, StageTransitionRule, LeadStagePosition, Lead, ValueClassification } from '@/types/leadFunnels';
import { Funnel } from '@/hooks/useFunnels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ArrowRight, Shuffle, Circle } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';

import SortableStageItem from './SortableStageItem';
import { toast } from 'sonner';
import FunnelProductsConfig from './FunnelProductsConfig';
import TrackingSnippetPopover from './TrackingSnippetPopover';
import RedistributeLeadsDialog from './RedistributeLeadsDialog';
import ProductMappingConfig from './ProductMappingConfig';
import { getDefaultClassification, classificationLabel } from '@/lib/valueClassification';

import type { LeadFunnelProduct } from '@/hooks/useLeadFunnelProducts';
import type { LeadProductMapping } from '@/hooks/useLeadProductMappings';
import type { FunnelProduct } from '@/hooks/useFunnels';

interface FunnelConfigTabProps {
  stages: LeadFunnelStage[];
  rules: StageTransitionRule[];
  onSaveStages: (stages: Partial<LeadFunnelStage>[]) => void;
  onSaveRules: (rules: Partial<StageTransitionRule>[]) => void;
  saving?: boolean;
  funnelId?: string;
  // Products & Recontact
  leadFunnelProducts?: LeadFunnelProduct[];
  catalogProducts?: FunnelProduct[];
  onSaveProducts?: (products: any[]) => void;
  savingProducts?: boolean;
  onBulkMoveOverdue?: () => void;
  bulkMoving?: boolean;
  // Product Mappings
  distinctLeadProducts?: string[];
  existingMappings?: LeadProductMapping[];
  onSaveMappings?: (mappings: { raw_product_name: string; lead_funnel_product_id: string }[]) => void;
  savingMappings?: boolean;
  loadingDistinctProducts?: boolean;
  // Redistribute
  positions?: (LeadStagePosition & { lead?: Lead })[];
  // Traffic funnel association
  trafficFunnels?: Funnel[];
  currentTrafficFunnelId?: string | null;
  onTrafficFunnelChange?: (id: string | null) => void;
  savingTrafficFunnel?: boolean;
  // Meta CAPI
  metaPixelId?: string | null;
  metaAccessToken?: string | null;
  onMetaPixelChange?: (pixelId: string | null, accessToken: string | null) => void;
  savingMetaPixel?: boolean;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const CANONICAL_EVENTS = [
  { value: 'purchase', label: 'Compra Aprovada' },
  { value: 'pix_generated', label: 'PIX/Boleto Gerado' },
  { value: 'abandoned_cart', label: 'Carrinho Abandonado' },
  { value: 'refused', label: 'Pagamento Recusado' },
  { value: 'refunded', label: 'Reembolso' },
  { value: 'chargeback', label: 'Chargeback' },
  { value: 'canceled', label: 'Cancelado' },
];

const FunnelConfigTab: React.FC<FunnelConfigTabProps> = ({ stages, rules, onSaveStages, onSaveRules, saving, funnelId, leadFunnelProducts = [], catalogProducts = [], onSaveProducts, savingProducts, onBulkMoveOverdue, bulkMoving, distinctLeadProducts = [], existingMappings = [], onSaveMappings, savingMappings, loadingDistinctProducts, positions = [], trafficFunnels = [], currentTrafficFunnelId, onTrafficFunnelChange, savingTrafficFunnel, metaPixelId, metaAccessToken, onMetaPixelChange, savingMetaPixel }) => {
  const [localStages, setLocalStages] = useState<Partial<LeadFunnelStage>[]>(
    stages.length ? stages : [{ name: 'Novo Lead', color: COLORS[0], sort_order: 0 }]
  );
  const [localRules, setLocalRules] = useState<Partial<StageTransitionRule>[]>(rules);
  const [redistributeOpen, setRedistributeOpen] = useState(false);
  const [localPixelId, setLocalPixelId] = useState(metaPixelId || '');
  const [localAccessToken, setLocalAccessToken] = useState(metaAccessToken || '');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalStages(prev => {
      const oldIndex = prev.findIndex((_, i) => (prev[i].id || `temp-${i}`) === active.id);
      const newIndex = prev.findIndex((_, i) => (prev[i].id || `temp-${i}`) === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  // Sync local state when props update (e.g. after save)
  // Only reset if the actual stage composition changed (not just reference)
  useEffect(() => {
    if (stages.length > 0) {
      const sorted = [...stages].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const incomingKey = sorted.map(s => s.id).filter(Boolean).join(',');
      const localKey = localStages.map(s => s.id).filter(Boolean).join(',');
      // Only reset if stages were added/removed, not just reordered locally
      if (incomingKey !== localKey || localStages.length === 0) {
        setLocalStages(sorted);
      }
    }
  }, [stages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const incomingKey = rules.map(r => [r.id ?? '', r.event_name ?? '', r.from_stage_id ?? '', r.to_stage_id ?? ''].join(':')).join('|');
    const localKey = localRules.map(r => [r.id ?? '', r.event_name ?? '', r.from_stage_id ?? '', r.to_stage_id ?? ''].join(':')).join('|');
    if (incomingKey !== localKey) {
      setLocalRules(rules);
    }
  }, [rules]); // eslint-disable-line react-hooks/exhaustive-deps

  const addStage = () => {
    setLocalStages(prev => [
      ...prev,
      { name: '', color: COLORS[prev.length % COLORS.length], sort_order: prev.length },
    ]);
  };

  const removeStage = (idx: number) => {
    setLocalStages(prev => prev.filter((_, i) => i !== idx));
  };

  const updateStage = (idx: number, field: string, value: string | boolean) => {
    setLocalStages(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const [customEventMode, setCustomEventMode] = useState<Record<number, boolean>>({});

  const addRule = () => {
    setLocalRules(prev => [...prev, { event_name: '', from_stage_id: null, to_stage_id: '' }]);
  };

  const removeRule = (idx: number) => {
    setLocalRules(prev => prev.filter((_, i) => i !== idx));
  };

  const updateRule = (idx: number, field: string, value: string | null) => {
    setLocalRules(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const handleSaveStages = () => {
    const valid = localStages.every(s => s.name?.trim());
    if (!valid) {
      toast.error('Todas as etapas precisam ter um nome');
      return;
    }
    onSaveStages(localStages.map((s, i) => ({ ...s, sort_order: i })));
  };

  const handleSaveRules = () => {
    const valid = localRules.every(r => r.event_name?.trim() && r.to_stage_id);
    if (!valid) {
      toast.error('Todas as regras precisam de evento e etapa destino');
      return;
    }
    // Block save if any rule references temp stage IDs
    const hasTemp = localRules.some(r =>
      (r.to_stage_id && r.to_stage_id.startsWith('temp-')) ||
      (r.from_stage_id && r.from_stage_id.startsWith('temp-'))
    );
    if (hasTemp) {
      toast.error('Salve as etapas antes de salvar as regras');
      return;
    }
    onSaveRules(localRules);
  };

  // Use saved stage IDs or temp indices
  const stageOptions = localStages.map((s, i) => ({
    id: s.id || `temp-${i}`,
    name: s.name || `Etapa ${i + 1}`,
  }));

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Traffic Funnel Association */}
      {onTrafficFunnelChange && trafficFunnels.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-3">Funil de Tráfego Associado</h3>
          <p className="text-sm text-muted-foreground mb-2">
            Vincule este funil de leads a um funil de tráfego para unificar dados de receita e CRM.
          </p>
          <select
            value={currentTrafficFunnelId || ''}
            onChange={e => onTrafficFunnelChange(e.target.value || null)}
            disabled={savingTrafficFunnel}
            className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">Nenhum funil de tráfego</option>
            {trafficFunnels.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Stages Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-foreground">Etapas do Funil</h3>
          <Button variant="outline" size="sm" onClick={addStage}>
            <Plus className="h-4 w-4 mr-1" /> Etapa
          </Button>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localStages.map((s, i) => s.id || `temp-${i}`)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {localStages.map((stage, idx) => (
                <SortableStageItem
                  key={stage.id || `temp-${idx}`}
                  stage={stage}
                  idx={idx}
                  sortableId={stage.id || `temp-${idx}`}
                  funnelId={funnelId}
                  defaultColor={COLORS[idx % COLORS.length]}
                  onUpdate={updateStage}
                  onRemove={removeStage}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <Button onClick={handleSaveStages} className="mt-3" disabled={saving}>
          Salvar Etapas
        </Button>
      </div>

      {/* Transition Rules */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-foreground">Regras de Transição</h3>
          <Button variant="outline" size="sm" onClick={addRule}>
            <Plus className="h-4 w-4 mr-1" /> Regra
          </Button>
        </div>

        <div className="space-y-2">
          {localRules.map((rule, idx) => {
            const isCanonical = CANONICAL_EVENTS.some(e => e.value === rule.event_name);
            const isCustom = customEventMode[idx] || (!isCanonical && !!rule.event_name);
            return (
            <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
              {isCustom ? (
                <div className="flex-1 flex gap-1">
                  <Input
                    value={rule.event_name || ''}
                    onChange={e => updateRule(idx, 'event_name', e.target.value)}
                    placeholder="Nome do evento personalizado"
                    className="flex-1"
                  />
                  <Button variant="ghost" size="sm" onClick={() => {
                    setCustomEventMode(prev => ({ ...prev, [idx]: false }));
                    updateRule(idx, 'event_name', '');
                  }} className="text-xs shrink-0">
                    Voltar
                  </Button>
                </div>
              ) : (
                <Select
                  value={rule.event_name || ''}
                  onValueChange={v => {
                    if (v === '__custom__') {
                      setCustomEventMode(prev => ({ ...prev, [idx]: true }));
                      updateRule(idx, 'event_name', '');
                    } else {
                      updateRule(idx, 'event_name', v);
                    }
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione o evento" />
                  </SelectTrigger>
                  <SelectContent>
                    {CANONICAL_EVENTS
                      .filter(e => {
                        // Esconder se outra regra já usa este evento com "Qualquer etapa" (catch-all)
                        const hasCatchAll = localRules.some(
                          (r, i) => i !== idx && r.event_name === e.value && !r.from_stage_id
                        );
                        return !hasCatchAll;
                      })
                      .map(e => (
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    <SelectItem value="__custom__">Outro (personalizado)</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Select
                value={rule.from_stage_id || 'any'}
                onValueChange={v => {
                  const newFromStage = v === 'any' ? null : v;
                  updateRule(idx, 'from_stage_id', newFromStage);
                  // Se mudou para "Qualquer etapa", remover regras redundantes do mesmo evento
                  if (newFromStage === null) {
                    const eventName = localRules[idx].event_name;
                    if (eventName) {
                      setLocalRules(prev => prev.filter(
                        (r, i) => i === idx || r.event_name !== eventName
                      ));
                    }
                  }
                }}
              >
                <SelectTrigger className="min-w-[140px] flex-1">
                  <SelectValue placeholder="De (qualquer)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer etapa</SelectItem>
                  {stageOptions.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <Select
                value={rule.to_stage_id || ''}
                onValueChange={v => updateRule(idx, 'to_stage_id', v)}
              >
                <SelectTrigger className="min-w-[140px] flex-1">
                  <SelectValue placeholder="Para..." />
                </SelectTrigger>
                <SelectContent>
                  {stageOptions.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => removeRule(idx)} className="shrink-0">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            );
          })}

          {localRules.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">
              Nenhuma regra de transição. Adicione regras para mover leads automaticamente quando eventos chegarem via webhook.
            </p>
          )}
        </div>

        {localRules.length > 0 && (
          <Button onClick={handleSaveRules} className="mt-3" disabled={saving}>
            Salvar Regras
          </Button>
        )}
      </div>

      {/* Products & Recontact */}
      {onSaveProducts && (
        <FunnelProductsConfig
          products={leadFunnelProducts}
          catalogProducts={catalogProducts}
          stages={stages}
          onSave={onSaveProducts}
          saving={savingProducts}
          onBulkMoveOverdue={onBulkMoveOverdue}
          bulkMoving={bulkMoving}
        />
      )}

      {/* Product Mapping */}
      {onSaveMappings && leadFunnelProducts.length > 0 && (
        <ProductMappingConfig
          distinctProducts={distinctLeadProducts}
          leadFunnelProducts={leadFunnelProducts}
          existingMappings={existingMappings}
          onSave={onSaveMappings}
          saving={savingMappings}
          loading={loadingDistinctProducts}
        />
      )}

      {/* Meta Conversions API (CAPI) */}
      {onMetaPixelChange && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-3">Meta Conversions API (CAPI)</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Configure o Pixel ID e Access Token para enviar eventos de conversão server-side ao Meta.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Meta Pixel ID</label>
              <Input
                value={localPixelId}
                onChange={e => setLocalPixelId(e.target.value)}
                placeholder="Ex: 123456789012345"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Meta Access Token</label>
              <Input
                type="password"
                value={localAccessToken}
                onChange={e => setLocalAccessToken(e.target.value)}
                placeholder="Token da Conversions API"
              />
            </div>
            <Button
              onClick={() => onMetaPixelChange(localPixelId || null, localAccessToken || null)}
              disabled={savingMetaPixel}
            >
              Salvar Configuração Meta
            </Button>
          </div>
        </div>
      )}

      {/* Redistribute Leads */}
      {funnelId && stages.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-3">Redistribuição de Leads</h3>
          <Button variant="outline" className="gap-2" onClick={() => setRedistributeOpen(true)}>
            <Shuffle className="h-4 w-4" />
            Redistribuir Leads
          </Button>
          <p className="text-xs text-muted-foreground mt-1.5">
            Distribui leads igualmente entre os vendedores com acesso ao funil (round-robin).
          </p>
          <RedistributeLeadsDialog
            open={redistributeOpen}
            onOpenChange={setRedistributeOpen}
            funnelId={funnelId}
            stages={stages}
            positions={positions}
          />
        </div>
      )}

    </div>
  );
};

export default FunnelConfigTab;
