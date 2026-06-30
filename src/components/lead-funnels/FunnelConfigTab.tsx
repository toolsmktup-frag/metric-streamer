import React, { useState, useEffect, useCallback } from 'react';
import { LeadFunnelStage, StageTransitionRule, LeadStagePosition, Lead, ValueClassification } from '@/types/leadFunnels';
import { Funnel } from '@/hooks/useFunnels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, ArrowRight, Shuffle, Circle, Download, Layers, Package, GitBranch, Plug, Settings2 } from 'lucide-react';
import { downloadCsv } from '@/lib/exportCsv';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';

import SortableStageItem from './SortableStageItem';
import { toast } from 'sonner';
import FunnelProductsConfig from './FunnelProductsConfig';
import FunnelAutomationsConfig from './FunnelAutomationsConfig';
import WhatsAppGroupSyncConfig from './WhatsAppGroupSyncConfig';
import RedistributeLeadsDialog from './RedistributeLeadsDialog';
import FunnelDistributionConfig from './FunnelDistributionConfig';
import ProductMappingConfig from './ProductMappingConfig';
import StageMappingConfig from './StageMappingConfig';
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
  funnelName?: string;
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
  // Campanhas agregadas (visão geral)
  allCampaigns?: { id: string; name: string; color: string }[];
  linkedCampaignIds?: string[];
  onSaveLinkedCampaigns?: (ids: string[]) => void;
  savingLinkedCampaigns?: boolean;
  // Mapeamento de etapas (visão geral)
  aggregatedSourceFunnelIds?: string[];
  stageMappings?: import('@/hooks/useLeadFunnelStageMappings').LeadFunnelStageMapping[];
  onSaveStageMappings?: (mappings: { source_stage_id: string; target_stage_id: string }[]) => void;
  savingStageMappings?: boolean;
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

const FunnelConfigTab: React.FC<FunnelConfigTabProps> = ({ stages, rules, onSaveStages, onSaveRules, saving, funnelId, funnelName, leadFunnelProducts = [], catalogProducts = [], onSaveProducts, savingProducts, onBulkMoveOverdue, bulkMoving, distinctLeadProducts = [], existingMappings = [], onSaveMappings, savingMappings, loadingDistinctProducts, positions = [], trafficFunnels = [], currentTrafficFunnelId, onTrafficFunnelChange, savingTrafficFunnel, metaPixelId, metaAccessToken, onMetaPixelChange, savingMetaPixel, allCampaigns = [], linkedCampaignIds = [], onSaveLinkedCampaigns, savingLinkedCampaigns, aggregatedSourceFunnelIds = [], stageMappings = [], onSaveStageMappings, savingStageMappings }) => {
  const [localStages, setLocalStages] = useState<Partial<LeadFunnelStage>[]>(
    stages.length ? stages : [{ name: 'Novo Lead', color: COLORS[0], sort_order: 0 }]
  );
  const [localRules, setLocalRules] = useState<Partial<StageTransitionRule>[]>(rules);
  const [redistributeOpen, setRedistributeOpen] = useState(false);
  const [localPixelId, setLocalPixelId] = useState(metaPixelId || '');
  const [localAccessToken, setLocalAccessToken] = useState(metaAccessToken || '');
  const [localLinkedCampaigns, setLocalLinkedCampaigns] = useState<string[]>(linkedCampaignIds);
  useEffect(() => { setLocalLinkedCampaigns(linkedCampaignIds); }, [linkedCampaignIds.join(',')]);

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
    setLocalStages(prev => {
      const removedId = prev[idx]?.id;
      return prev
        .filter((_, i) => i !== idx)
        .map(stage => removedId ? {
          ...stage,
          conversion_base_stage_id: stage.conversion_base_stage_id === removedId ? null : stage.conversion_base_stage_id,
          visual_parent_stage_id: stage.visual_parent_stage_id === removedId ? null : stage.visual_parent_stage_id,
        } : stage);
    });
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
    const validIds = new Set(localStages.map(stage => stage.id).filter(Boolean));
    onSaveStages(localStages.map((s, i) => ({
      ...s,
      sort_order: i,
      conversion_base_stage_id: s.conversion_base_stage_id && s.conversion_base_stage_id !== s.id && validIds.has(s.conversion_base_stage_id) ? s.conversion_base_stage_id : null,
      visual_parent_stage_id: s.visual_parent_stage_id && s.visual_parent_stage_id !== s.id && validIds.has(s.visual_parent_stage_id) ? s.visual_parent_stage_id : null,
    })));
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
    <div className="max-w-6xl">
      <Tabs defaultValue="stages" className="w-full">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="stages" className="gap-1.5"><Layers className="h-3.5 w-3.5" />Etapas</TabsTrigger>
          <TabsTrigger value="products" className="gap-1.5"><Package className="h-3.5 w-3.5" />Produtos</TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5"><GitBranch className="h-3.5 w-3.5" />Regras</TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5"><Plug className="h-3.5 w-3.5" />Integrações</TabsTrigger>
          <TabsTrigger value="advanced" className="gap-1.5"><Settings2 className="h-3.5 w-3.5" />Avançado</TabsTrigger>
        </TabsList>

        {/* ─────────────── ETAPAS ─────────────── */}
        <TabsContent value="stages" className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-foreground">Etapas do Funil</h3>
              <Button variant="outline" size="sm" onClick={addStage}>
                <Plus className="h-4 w-4 mr-1" /> Etapa
              </Button>
            </div>
            <div className="mb-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Desenho:</span> onde a etapa aparece no funil.{' '}
              <span className="font-medium text-foreground">Conversão:</span> qual etapa serve de base para calcular a taxa.
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
                      stageOptions={stageOptions}
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
        </TabsContent>

        {/* ─────────────── PRODUTOS ─────────────── */}
        <TabsContent value="products" className="space-y-6">
          {onSaveProducts ? (
            <FunnelProductsConfig
              products={leadFunnelProducts}
              catalogProducts={catalogProducts}
              stages={stages}
              onSave={onSaveProducts}
              saving={savingProducts}
              onBulkMoveOverdue={onBulkMoveOverdue}
              bulkMoving={bulkMoving}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Configuração de produtos indisponível.</p>
          )}

          {onSaveMappings && leadFunnelProducts.length > 0 && (
            <ProductMappingConfig
              distinctProducts={distinctLeadProducts}
              leadFunnelProducts={leadFunnelProducts}
              existingMappings={existingMappings}
              onSave={onSaveMappings}
              saving={savingMappings}
              loading={loadingDistinctProducts}
              funnelId={funnelId}
            />
          )}
        </TabsContent>

        {/* ─────────────── REGRAS ─────────────── */}
        <TabsContent value="rules" className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-foreground">Regras de Transição</h3>
              <Button variant="outline" size="sm" onClick={addRule}>
                <Plus className="h-4 w-4 mr-1" /> Regra
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Quando um evento chega via webhook (ex: <strong>Compra Aprovada</strong>), o lead é movido automaticamente para a etapa configurada aqui.
            </p>

            <div className="space-y-2">
              {localRules.map((rule, idx) => {
                const isCanonical = CANONICAL_EVENTS.some(e => e.value === rule.event_name);
                const isCustom = customEventMode[idx] || (!isCanonical && !!rule.event_name);
                return (
                <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
                  {(() => {
                    const cls = (rule.value_classification || (rule.event_name ? getDefaultClassification(rule.event_name) : null)) as ValueClassification | null;
                    if (!cls) return null;
                    const dotColor = cls === 'positive' ? 'bg-emerald-500' : cls === 'pending' ? 'bg-yellow-500' : 'bg-destructive';
                    return (
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`}
                        title={classificationLabel(cls)}
                      />
                    );
                  })()}
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
                          const autoCls = getDefaultClassification(v);
                          updateRule(idx, 'value_classification', autoCls);
                        }
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecione o evento" />
                      </SelectTrigger>
                      <SelectContent>
                        {CANONICAL_EVENTS
                          .filter(e => {
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
                  <Select
                    value={rule.value_classification || (rule.event_name ? getDefaultClassification(rule.event_name) : '')}
                    onValueChange={v => updateRule(idx, 'value_classification', v as ValueClassification)}
                  >
                    <SelectTrigger className="min-w-[100px] w-[100px]">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="positive">Receita</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="negative">Recuperar</SelectItem>
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
        </TabsContent>

        {/* ─────────────── INTEGRAÇÕES ─────────────── */}
        <TabsContent value="integrations" className="space-y-8">
          {onTrafficFunnelChange && trafficFunnels.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Funil de Tráfego Associado</h3>
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

          {onSaveLinkedCampaigns && allCampaigns.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Campanhas agregadas (Visão Geral)</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Selecione campanhas adicionais para que este funil mostre leads vindos delas, agrupados pelas etapas com nome igual.
                Útil para criar um funil "Geral" que junta várias campanhas num só Kanban.
              </p>
              <div className="space-y-2 border border-border rounded-md p-3 max-h-64 overflow-y-auto bg-background">
                {allCampaigns.map(c => {
                  const checked = localLinkedCampaigns.includes(c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          setLocalLinkedCampaigns(prev =>
                            e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id)
                          );
                        }}
                      />
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="text-foreground">{c.name}</span>
                    </label>
                  );
                })}
              </div>
              <Button
                onClick={() => onSaveLinkedCampaigns(localLinkedCampaigns)}
                disabled={savingLinkedCampaigns}
                className="mt-3"
                size="sm"
              >
                {savingLinkedCampaigns ? 'Salvando...' : 'Salvar campanhas agregadas'}
              </Button>
            </div>
          )}

          {funnelId && onSaveStageMappings && aggregatedSourceFunnelIds.length > 0 && (
            <StageMappingConfig
              targetFunnelId={funnelId}
              targetStages={stages as any}
              sourceFunnelIds={aggregatedSourceFunnelIds}
              existingMappings={stageMappings}
              onSave={onSaveStageMappings}
              saving={savingStageMappings}
            />
          )}

          {onMetaPixelChange && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Meta Conversions API (CAPI)</h3>
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

          {funnelId && (
            <FunnelAutomationsConfig funnelId={funnelId} funnelName={funnelName} />
          )}

          {funnelId && stages.length > 0 && (
            <WhatsAppGroupSyncConfig funnelId={funnelId} stages={stages} />
          )}
        </TabsContent>

        {/* ─────────────── AVANÇADO ─────────────── */}
        <TabsContent value="advanced" className="space-y-6">
          {funnelId && positions.length >= 0 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-3">Exportar Leads</h3>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  if (!positions.length) {
                    toast.error('Nenhum lead para exportar neste funil');
                    return;
                  }
                  const stageMap = new Map(stages.map(s => [s.id, s.name]));
                  const formatPhone = (raw?: string | null) => {
                    if (!raw) return '';
                    let digits = String(raw).replace(/\D/g, '');
                    if (!digits) return '';
                    digits = digits.replace(/^0+/, '');
                    if (!digits.startsWith('55')) {
                      if (digits.length === 10 || digits.length === 11) {
                        digits = '55' + digits;
                      }
                    }
                    return digits;
                  };
                  const rows = positions.map(p => {
                    const lead = p.lead || ({} as Lead);
                    return {
                      name: lead.name || '',
                      email: lead.email || '',
                      phone: formatPhone(lead.phone),
                      stage: stageMap.get(p.stage_id) || '',
                      entered_at: p.entered_at ? new Date(p.entered_at).toLocaleString('pt-BR') : '',
                      utm_source: lead.utm_source || '',
                      utm_medium: lead.utm_medium || '',
                      utm_campaign: lead.utm_campaign || '',
                      utm_content: lead.utm_content || '',
                      utm_term: lead.utm_term || '',
                      created_at: lead.created_at ? new Date(lead.created_at).toLocaleString('pt-BR') : '',
                    };
                  });
                  const safeName = (funnelName || 'funil').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
                  const stamp = new Date().toISOString().slice(0, 10);
                  downloadCsv(
                    rows,
                    [
                      { key: 'name', label: 'Nome' },
                      { key: 'email', label: 'Email' },
                      { key: 'phone', label: 'Telefone' },
                      { key: 'stage', label: 'Etapa' },
                      { key: 'entered_at', label: 'Entrou na Etapa' },
                      { key: 'utm_source', label: 'UTM Source' },
                      { key: 'utm_medium', label: 'UTM Medium' },
                      { key: 'utm_campaign', label: 'UTM Campaign' },
                      { key: 'utm_content', label: 'UTM Content' },
                      { key: 'utm_term', label: 'UTM Term' },
                      { key: 'created_at', label: 'Criado em' },
                    ],
                    `leads_${safeName}_${stamp}.csv`,
                  );
                  toast.success(`${rows.length} leads exportados`);
                }}
              >
                <Download className="h-4 w-4" />
                Exportar Leads (CSV)
              </Button>
              <p className="text-xs text-muted-foreground mt-1.5">
                Baixa todos os leads atualmente neste funil em formato CSV (compatível com Excel).
              </p>
            </div>
          )}

          {funnelId && stages.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-3">Redistribuição de Leads</h3>
              <Button variant="outline" className="gap-2" onClick={() => setRedistributeOpen(true)}>
                <Shuffle className="h-4 w-4" />
                Redistribuir Leads
              </Button>
              <p className="text-xs text-muted-foreground mt-1.5">
                Redistribui os leads já existentes do funil — agora, em lote. Escolha o escopo
                (sem vendedor, todos, etc.) e distribua igualmente ou por peso (ex.: 90/10).
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

          {funnelId && (
            <FunnelDistributionConfig funnelId={funnelId} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FunnelConfigTab;
