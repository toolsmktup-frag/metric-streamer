import React, { useState } from 'react';
import { LeadFunnelStage, StageTransitionRule } from '@/types/leadFunnels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, GripVertical, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface FunnelConfigTabProps {
  stages: LeadFunnelStage[];
  rules: StageTransitionRule[];
  onSaveStages: (stages: Partial<LeadFunnelStage>[]) => void;
  onSaveRules: (rules: Partial<StageTransitionRule>[]) => void;
  saving?: boolean;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const FunnelConfigTab: React.FC<FunnelConfigTabProps> = ({ stages, rules, onSaveStages, onSaveRules, saving }) => {
  const [localStages, setLocalStages] = useState<Partial<LeadFunnelStage>[]>(
    stages.length ? stages : [{ name: 'Novo Lead', color: COLORS[0], sort_order: 0 }]
  );
  const [localRules, setLocalRules] = useState<Partial<StageTransitionRule>[]>(rules);

  const addStage = () => {
    setLocalStages(prev => [
      ...prev,
      { name: '', color: COLORS[prev.length % COLORS.length], sort_order: prev.length },
    ]);
  };

  const removeStage = (idx: number) => {
    setLocalStages(prev => prev.filter((_, i) => i !== idx));
  };

  const updateStage = (idx: number, field: string, value: string) => {
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
    </div>
  );
};

export default FunnelConfigTab;
