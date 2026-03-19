import React, { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLeadFunnel, useUpsertStages, useUpsertTransitionRules, useFunnelSourceNodes, useFunnelEdges, useSaveFunnelSourceNodes, useSaveFunnelEdges } from '@/hooks/useLeadFunnels';
import { useLeadsByFunnel, useFunnelLeadCounts } from '@/hooks/useLeads';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Upload, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import KanbanBoard from '@/components/lead-funnels/KanbanBoard';
import BaseLeadsList from '@/components/lead-funnels/BaseLeadsList';
import FunnelVisual from '@/components/lead-funnels/FunnelVisual';
import FunnelConfigTab from '@/components/lead-funnels/FunnelConfigTab';
import WebhookConfig from '@/components/lead-funnels/WebhookConfig';
import FunnelFlowEditor from '@/components/lead-funnels/FunnelFlowEditor';
import FunnelMetricsTab from '@/components/lead-funnels/FunnelMetricsTab';
import LeadTimeline from '@/components/lead-funnels/LeadTimeline';
import ImportLeadsDialog from '@/components/lead-funnels/ImportLeadsDialog';
import { Lead } from '@/types/leadFunnels';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Node, Edge } from '@xyflow/react';

const LeadFunnelDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: funnel, isLoading } = useLeadFunnel(id ?? null);
  const { data: positions = [] } = useLeadsByFunnel(id ?? null);
  const { data: leadCounts = {} } = useFunnelLeadCounts(id ?? null);
  const { data: sourceNodes = [] } = useFunnelSourceNodes(id ?? null);
  const { data: funnelEdges = [] } = useFunnelEdges(id ?? null);
  const upsertStages = useUpsertStages();
  const upsertRules = useUpsertTransitionRules();
  const saveSourceNodes = useSaveFunnelSourceNodes();
  const saveFunnelEdges = useSaveFunnelEdges();
  const queryClient = useQueryClient();

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClearFunnel = async () => {
    if (!id) return;
    setClearing(true);
    try {
      // Delete lead events for this funnel
      await (supabase as any)
        .from('lead_events')
        .delete()
        .eq('funnel_id', id);

      // Delete lead stage positions for this funnel
      await (supabase as any)
        .from('lead_stage_positions')
        .delete()
        .eq('funnel_id', id);

      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ['leads-by-funnel', id] });
      queryClient.invalidateQueries({ queryKey: ['funnel-lead-counts', id] });

      toast.success('Dados do funil limpos com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao limpar dados do funil');
    } finally {
      setClearing(false);
    }
  };

  const handleLeadClick = (leadId: string) => {
    const pos = positions.find(p => p.lead_id === leadId);
    if (pos?.lead) {
      setSelectedLead(pos.lead);
      setTimelineOpen(true);
    }
  };

  const handleWhatsAppClick = (phone: string) => {
    navigate(`/whatsapp?phone=${encodeURIComponent(phone)}`);
  };

  // Auto-save nodes: update stage positions + upsert source nodes
  const handleAutoSaveNodes = useCallback(async (nodes: Node[]) => {
    if (!id) return;

    // Update stage positions in lead_funnel_stages
    const stageNodes = nodes.filter(n => n.id.startsWith('stage-'));
    for (const node of stageNodes) {
      const stageId = node.id.replace('stage-', '');
      await (supabase as any)
        .from('lead_funnel_stages')
        .update({
          position_x: node.position.x,
          position_y: node.position.y,
          name: (node.data as any).label,
          color: (node.data as any).color,
          page_type: (node.data as any).pageType || 'content',
          page_url: (node.data as any).pageUrl || null,
        })
        .eq('id', stageId);
    }

    // Upsert source nodes
    const srcNodes = nodes.filter(n => n.type === 'trafficSource');
    await saveSourceNodes.mutateAsync({
      funnelId: id,
      nodes: srcNodes.map(n => ({
        source_type: (n.data as any).sourceType || 'other',
        label: (n.data as any).label || 'Fonte',
        position_x: n.position.x,
        position_y: n.position.y,
      })),
    });
  }, [id, saveSourceNodes]);

  // Auto-save edges
  const handleAutoSaveEdges = useCallback(async (edges: Edge[]) => {
    if (!id) return;

    await saveFunnelEdges.mutateAsync({
      funnelId: id,
      edges: edges.map(e => ({
        source_node_id: e.source.replace('stage-', '').replace('source-', ''),
        target_node_id: e.target.replace('stage-', ''),
        source_type: e.source.startsWith('source-') ? 'source' : 'stage',
      })),
    });
  }, [id, saveFunnelEdges]);

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Carregando funil...</div>;
  }

  if (!funnel) {
    return <div className="p-6 text-destructive">Funil não encontrado</div>;
  }

  const stages = funnel.lead_funnel_stages || [];
  const rules = funnel.stage_transition_rules || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/lead-campaigns')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-full" style={{ backgroundColor: funnel.color }} />
          <h1 className="text-2xl font-bold text-foreground">{funnel.name}</h1>
        </div>
        {!funnel.is_active && (
          <span className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">Inativo</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
                Limpar Funil
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar dados do funil?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso vai remover todos os leads e eventos deste funil. As etapas e configurações serão mantidas. Essa ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleClearFunnel}
                  disabled={clearing}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {clearing ? 'Limpando...' : 'Sim, limpar tudo'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Importar Leads
          </Button>
        </div>
      </div>

      {funnel.description && (
        <p className="text-sm text-muted-foreground">{funnel.description}</p>
      )}

      {/* Tabs */}
      <Tabs defaultValue="kanban">
        <TabsList>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="visual">Funil</TabsTrigger>
          <TabsTrigger value="flow">Flow Editor</TabsTrigger>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="mt-4">
          <KanbanBoard
            stages={stages}
            positions={positions}
            onLeadClick={handleLeadClick}
            onWhatsAppClick={handleWhatsAppClick}
            funnelId={funnel.id}
          />
        </TabsContent>

        <TabsContent value="visual" className="mt-4">
          <FunnelVisual stages={stages} leadCounts={leadCounts} />
        </TabsContent>

        <TabsContent value="flow" className="mt-4">
          <FunnelFlowEditor
            stages={stages}
            sourceNodes={sourceNodes}
            leadCounts={leadCounts}
            funnelId={funnel.id}
            edges={funnelEdges.map(e => ({
              source_node_id: e.source_node_id,
              target_node_id: e.target_node_id,
              source_type: e.source_type,
            }))}
            onAutoSaveNodes={handleAutoSaveNodes}
            onAutoSaveEdges={handleAutoSaveEdges}
          />
        </TabsContent>

        <TabsContent value="metrics" className="mt-4">
          <FunnelMetricsTab stages={stages} positions={positions} />
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <FunnelConfigTab
            stages={stages}
            rules={rules}
            onSaveStages={async (newStages) => {
              try {
                await upsertStages.mutateAsync({ funnelId: funnel.id, stages: newStages });
                toast.success('Etapas salvas!');
              } catch {
                toast.error('Erro ao salvar etapas');
              }
            }}
            onSaveRules={async (newRules) => {
              try {
                await upsertRules.mutateAsync({ funnelId: funnel.id, rules: newRules });
                toast.success('Regras salvas!');
              } catch {
                toast.error('Erro ao salvar regras');
              }
            }}
            saving={upsertStages.isPending || upsertRules.isPending}
          />
        </TabsContent>

        <TabsContent value="webhook" className="mt-4">
          <WebhookConfig funnel={funnel} />
        </TabsContent>
      </Tabs>

      <LeadTimeline
        lead={selectedLead}
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
      />

      <ImportLeadsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        stages={stages}
        funnelId={funnel.id}
        organizationId={funnel.organization_id}
      />
    </div>
  );
};

export default LeadFunnelDetail;
