import React, { useState } from 'react';
import { useLeadFunnelAutomations } from '@/hooks/useLeadFunnelAutomations';
import { useWzExecutions } from '@/hooks/useWzExecutions';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Zap, Eye, EyeOff, Plus, Loader2 } from 'lucide-react';
import { useUpdateFunnelAutomation } from '@/hooks/useLeadFunnelAutomations';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface FunnelAutomationsTabProps {
  funnelId: string;
  funnelName?: string;
}

const FunnelAutomationsTab: React.FC<FunnelAutomationsTabProps> = ({ funnelId, funnelName }) => {
  const { data: automations = [], isLoading } = useLeadFunnelAutomations(funnelId);
  const updateMutation = useUpdateFunnelAutomation();
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();

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

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Carregando automações...</div>;
  }

  if (automations.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Zap className="h-12 w-12 mx-auto mb-4 opacity-40" />
        <p className="text-lg font-medium">Nenhuma automação vinculada</p>
        <p className="text-sm mt-1">Vá na aba Configuração para vincular fluxos de automação a este funil.</p>
        <Button onClick={handleCreate} disabled={creating} size="sm" variant="outline" className="gap-1 mt-4">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Criar Automação
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Automações do Funil</h3>
        <div className="flex-1" />
        <Button onClick={handleCreate} disabled={creating} size="sm" variant="outline" className="gap-1">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Criar Automação
        </Button>
      </div>

      <div className="space-y-3">
        {automations.map(auto => (
          <AutomationCard
            key={auto.id}
            automation={auto}
            funnelId={funnelId}
            onToggle={(is_active) => updateMutation.mutate({ id: auto.id, funnel_id: funnelId, is_active })}
            onToggleVisibility={(show) => updateMutation.mutate({ id: auto.id, funnel_id: funnelId, show_in_automations: show })}
          />
        ))}
      </div>
    </div>
  );
};

function AutomationCard({ automation, funnelId, onToggle, onToggleVisibility }: {
  automation: any;
  funnelId: string;
  onToggle: (v: boolean) => void;
  onToggleVisibility: (v: boolean) => void;
}) {
  const { data: executions = [] } = useWzExecutions({ flowId: automation.wz_flow_id });
  const recentExecs = executions.slice(0, 3);

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Switch checked={automation.is_active} onCheckedChange={onToggle} />
        <span className="font-medium text-foreground flex-1">
          {automation.wz_flow?.name || 'Fluxo sem nome'}
        </span>
        <Badge variant={automation.show_in_automations ? 'default' : 'secondary'} className="gap-1 cursor-pointer text-xs" onClick={() => onToggleVisibility(!automation.show_in_automations)}>
          {automation.show_in_automations ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          {automation.show_in_automations ? 'Visível em Automações' : 'Só neste funil'}
        </Badge>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => window.open(`/ferramentas/automacoes/${automation.wz_flow_id}`, '_blank')}>
          <ExternalLink className="h-3.5 w-3.5" /> Editar
        </Button>
      </div>

      {recentExecs.length > 0 && (
        <div className="text-xs text-muted-foreground space-y-1">
          <span className="font-medium">Últimas execuções:</span>
          {recentExecs.map((exec: any) => (
            <div key={exec.id} className="flex items-center gap-2">
              <Badge variant={exec.status === 'completed' ? 'default' : exec.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px] px-1.5">
                {exec.status}
              </Badge>
              <span>{exec.contact_name || exec.contact_phone || '—'}</span>
              <span className="ml-auto">{format(new Date(exec.started_at), 'dd/MM HH:mm')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FunnelAutomationsTab;
