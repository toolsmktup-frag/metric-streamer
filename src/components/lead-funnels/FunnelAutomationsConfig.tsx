import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ExternalLink, Zap, Eye, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useWzFlows } from '@/hooks/useWzFlows';
import { useLeadFunnelAutomations, useLinkFunnelAutomation, useUpdateFunnelAutomation, useUnlinkFunnelAutomation } from '@/hooks/useLeadFunnelAutomations';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { LeadFunnelAutomation } from '@/types/wz-automation';

interface FunnelAutomationsConfigProps {
  funnelId: string;
  funnelName?: string;
}

const FunnelAutomationsConfig: React.FC<FunnelAutomationsConfigProps> = ({ funnelId, funnelName }) => {
  const { data: automations = [], isLoading } = useLeadFunnelAutomations(funnelId);
  const { data: allFlows = [] } = useWzFlows();
  const linkMutation = useLinkFunnelAutomation();
  const updateMutation = useUpdateFunnelAutomation();
  const unlinkMutation = useUnlinkFunnelAutomation();
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();

  const linkedFlowIds = automations.map(a => a.wz_flow_id);
  const availableFlows = allFlows.filter(f => !linkedFlowIds.includes(f.id));

  const handleLink = () => {
    if (!selectedFlowId) return;
    linkMutation.mutate({ funnel_id: funnelId, wz_flow_id: selectedFlowId });
    setSelectedFlowId('');
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const flowName = `Automação - ${funnelName || 'Funil'}`;
      const { data, error } = await (supabase as any)
        .from('wz_flows')
        .insert({ name: flowName, platform: 'whatsapp', is_active: false, nodes: [], edges: [] })
        .select()
        .single();
      if (error) throw error;
      // Link to funnel
      await (supabase as any)
        .from('lead_funnel_automations')
        .insert({ funnel_id: funnelId, wz_flow_id: data.id, trigger_events: [], show_in_automations: false });
      qc.invalidateQueries({ queryKey: ['wz-flows'] });
      qc.invalidateQueries({ queryKey: ['lead-funnel-automations', funnelId] });
      toast.success('Automação criada e vinculada!');
      window.open(`/ferramentas/automacoes/${data.id}`, '_blank');
    } catch (e) {
      toast.error('Erro ao criar automação');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = (auto: LeadFunnelAutomation, is_active: boolean) => {
    updateMutation.mutate({ id: auto.id, funnel_id: funnelId, is_active });
  };

  const handleToggleShowInAutomations = (auto: LeadFunnelAutomation, show: boolean) => {
    updateMutation.mutate({ id: auto.id, funnel_id: funnelId, show_in_automations: show });
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
        <Zap className="h-5 w-5" />
        Automações Vinculadas
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Vincule fluxos de automação WhatsApp que serão disparados por eventos deste funil.
      </p>

      {/* Add new */}
      <div className="flex gap-2 mb-4">
        <Select value={selectedFlowId} onValueChange={setSelectedFlowId}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Selecione um fluxo para vincular..." />
          </SelectTrigger>
          <SelectContent>
            {availableFlows.length === 0 && (
              <SelectItem value="__none__" disabled>Nenhum fluxo disponível</SelectItem>
            )}
            {availableFlows.map(f => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleLink} disabled={!selectedFlowId || linkMutation.isPending} size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Vincular
        </Button>
        <Button onClick={handleCreate} disabled={creating} size="sm" variant="outline" className="gap-1">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Criar Automação
        </Button>
      </div>

      {/* Linked automations */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : automations.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">
          Nenhuma automação vinculada a este funil.
        </p>
      ) : (
        <div className="space-y-3">
          {automations.map(auto => (
            <div key={auto.id} className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-3">
                <Switch
                  checked={auto.is_active}
                  onCheckedChange={(v) => handleToggle(auto, v)}
                />
                <span className="font-medium text-sm text-foreground flex-1">
                  {auto.wz_flow?.name || 'Fluxo sem nome'}
                </span>
                <div className="flex items-center gap-1.5">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer" title="Mostrar também na lista de Automações">
                    <Checkbox
                      checked={auto.show_in_automations}
                      onCheckedChange={(v) => handleToggleShowInAutomations(auto, !!v)}
                    />
                    <Eye className="h-3.5 w-3.5" />
                    Exibir em Automações
                  </label>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => window.open(`/ferramentas/automacoes/${auto.wz_flow_id}`, '_blank')}
                  title="Editar fluxo"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => unlinkMutation.mutate({ id: auto.id, funnel_id: funnelId })}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FunnelAutomationsConfig;
