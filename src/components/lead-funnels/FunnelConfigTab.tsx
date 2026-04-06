import React, { useState, useEffect } from 'react';
import { LeadFunnelStage, StageTransitionRule, LeadStagePosition, Lead } from '@/types/leadFunnels';
import { Funnel } from '@/hooks/useFunnels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, GripVertical, ArrowRight, EyeOff, Shuffle } from 'lucide-react';
import { toast } from 'sonner';
import FunnelProductsConfig from './FunnelProductsConfig';
import RedistributeLeadsDialog from './RedistributeLeadsDialog';
import ProductMappingConfig from './ProductMappingConfig';

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
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const FunnelConfigTab: React.FC<FunnelConfigTabProps> = ({ stages, rules, onSaveStages, onSaveRules, saving, funnelId, leadFunnelProducts = [], catalogProducts = [], onSaveProducts, savingProducts, onBulkMoveOverdue, bulkMoving, distinctLeadProducts = [], existingMappings = [], onSaveMappings, savingMappings, loadingDistinctProducts, positions = [], trafficFunnels = [], currentTrafficFunnelId, onTrafficFunnelChange, savingTrafficFunnel }) => {
  const [localStages, setLocalStages] = useState<Partial<LeadFunnelStage>[]>(
    stages.length ? stages : [{ name: 'Novo Lead', color: COLORS[0], sort_order: 0 }]
  );
  const [localRules, setLocalRules] = useState<Partial<StageTransitionRule>[]>(rules);
  const [redistributeOpen, setRedistributeOpen] = useState(false);

  // Sync local state when props update (e.g. after save)
  useEffect(() => {
    if (stages.length > 0) {
      setLocalStages(stages);
    }
  }, [stages]);

  useEffect(() => {
    setLocalRules(rules);
  }, [rules]);

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

        <div className="space-y-2">
          {localStages.map((stage, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="color"
                value={stage.color || COLORS[0]}
                onChange={e => updateStage(idx, 'color', e.target.value)}
                className="w-8 h-8 rounded border-0 cursor-pointer"
              />
              <Input
                value={stage.name || ''}
                onChange={e => updateStage(idx, 'name', e.target.value)}
                placeholder="Nome da etapa"
                className="flex-1"
              />
              <Input
                value={stage.page_url || ''}
                onChange={e => updateStage(idx, 'page_url', e.target.value)}
                placeholder="URL da página (opcional)"
                className="flex-1"
              />
              <div className="flex items-center gap-1.5 shrink-0" title="Ocultar valores para vendedores">
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                <Switch
                  checked={!!stage.hide_values}
                  onCheckedChange={checked => updateStage(idx, 'hide_values', checked as any)}
                />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeStage(idx)} className="shrink-0">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

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
          {localRules.map((rule, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
              <Input
                value={rule.event_name || ''}
                onChange={e => updateRule(idx, 'event_name', e.target.value)}
                placeholder="Nome do evento (ex: signup)"
                className="flex-1"
              />
              <Select
                value={rule.from_stage_id || 'any'}
                onValueChange={v => updateRule(idx, 'from_stage_id', v === 'any' ? null : v)}
              >
                <SelectTrigger className="w-40">
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
                <SelectTrigger className="w-40">
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
          ))}

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
