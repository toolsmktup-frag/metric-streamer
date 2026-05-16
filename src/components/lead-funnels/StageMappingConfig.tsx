import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GitMerge } from 'lucide-react';
import { useLeadFunnels } from '@/hooks/useLeadFunnels';
import { useLeadFunnelStages } from '@/hooks/useLeadFunnelStages';
import type { LeadFunnelStage } from '@/types/leadFunnels';
import type { LeadFunnelStageMapping } from '@/hooks/useLeadFunnelStageMappings';

interface StageMappingConfigProps {
  targetFunnelId: string;
  targetStages: LeadFunnelStage[];
  /** IDs dos funis de origem (resolvidos a partir das campanhas agregadas) */
  sourceFunnelIds: string[];
  existingMappings: LeadFunnelStageMapping[];
  onSave: (mappings: { source_stage_id: string; target_stage_id: string }[]) => void;
  saving?: boolean;
}

const IGNORE = '__ignore__';

const StageMappingConfig: React.FC<StageMappingConfigProps> = ({
  targetFunnelId,
  targetStages,
  sourceFunnelIds,
  existingMappings,
  onSave,
  saving,
}) => {
  const { data: allFunnels = [] } = useLeadFunnels();
  const { data: stagesByFunnel = {}, isLoading } = useLeadFunnelStages(sourceFunnelIds);

  const [local, setLocal] = useState<Record<string, string>>({});

  useEffect(() => {
    const m: Record<string, string> = {};
    for (const row of existingMappings) m[row.source_stage_id] = row.target_stage_id;
    setLocal(m);
  }, [existingMappings]);

  const sourceFunnels = useMemo(
    () => allFunnels.filter(f => sourceFunnelIds.includes(f.id)),
    [allFunnels, sourceFunnelIds]
  );

  if (sourceFunnelIds.length === 0) return null;

  const handleChange = (sourceStageId: string, value: string) => {
    setLocal(prev => {
      const next = { ...prev };
      if (value === IGNORE) delete next[sourceStageId];
      else next[sourceStageId] = value;
      return next;
    });
  };

  const handleSave = () => {
    const mappings = Object.entries(local).map(([source_stage_id, target_stage_id]) => ({
      source_stage_id,
      target_stage_id,
    }));
    onSave(mappings);
  };

  const totalSourceStages = sourceFunnels.reduce(
    (acc, f) => acc + (stagesByFunnel[f.id]?.length || 0),
    0
  );
  const mappedCount = Object.keys(local).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <GitMerge className="h-5 w-5" /> Mapeamento de etapas (de-para)
        </h3>
        <span className="text-sm text-muted-foreground">
          {mappedCount}/{totalSourceStages} mapeadas
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Para cada etapa dos funis agregados, escolha em qual coluna deste Visão Geral ela deve aparecer.
        Etapas marcadas como <strong>Ignorar</strong> não serão exibidas aqui.
        <br />
        <span className="text-xs">
          Dica: se você não mapear nada, o sistema tenta casar automaticamente pelos nomes idênticos das etapas.
        </span>
      </p>

      {isLoading && (
        <div className="text-sm text-muted-foreground py-4">Carregando etapas dos funis agregados...</div>
      )}

      <div className="space-y-4">
        {sourceFunnels.map(sf => {
          const stages = stagesByFunnel[sf.id] || [];
          if (stages.length === 0) return null;
          return (
            <div key={sf.id} className="border border-border rounded-md p-3 bg-background">
              <div className="flex items-center gap-2 mb-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: sf.color }} />
                <span className="font-medium text-foreground">{sf.name}</span>
              </div>
              <div className="space-y-2">
                {stages.map(s => (
                  <div key={s.id} className="flex items-center gap-3 bg-muted/40 rounded p-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-sm flex-1 truncate" title={s.name}>{s.name}</span>
                    <Select
                      value={local[s.id] || IGNORE}
                      onValueChange={v => handleChange(s.id, v)}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Selecionar coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={IGNORE}>— Ignorar —</SelectItem>
                        {targetStages.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Button onClick={handleSave} disabled={saving} className="mt-3" size="sm">
        {saving ? 'Salvando...' : 'Salvar mapeamento'}
      </Button>
    </div>
  );
};

export default StageMappingConfig;
