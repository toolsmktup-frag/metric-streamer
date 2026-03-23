import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLeadFunnel, useUpsertStages, useUpsertTransitionRules, useFunnelSourceNodes, useFunnelEdges, useSaveFunnelSourceNodes, useSaveFunnelEdges } from '@/hooks/useLeadFunnels';
import { useLeadsByFunnel, useFunnelLeadCounts } from '@/hooks/useLeads';
import { useBulkLeadPurchases } from '@/hooks/useBulkLeadPurchases';
import { useFunnels } from '@/hooks/useFunnels';
import { useLeadFunnelProducts, useUpsertLeadFunnelProducts } from '@/hooks/useLeadFunnelProducts';
import { useLeadProductMappings, useDistinctLeadProducts, useSaveLeadProductMappings } from '@/hooks/useLeadProductMappings';
import { useRecontactDeadlines } from '@/hooks/useRecontactDeadlines';
import { useMoveLeadStage } from '@/hooks/useMoveLeadStage';
import { useCurrentUserRole } from '@/hooks/useCurrentUserRole';
import { useHasFunnelAccess } from '@/hooks/useLeadFunnelAccess';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Upload, Trash2, Layers } from 'lucide-react';
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
  const { data: paymentFunnels = [] } = useFunnels();
  const { data: leadFunnelProducts = [] } = useLeadFunnelProducts(id ?? null);
  const { data: productMappings = [] } = useLeadProductMappings(id ?? null);
  const { data: distinctLeadProducts = [], isLoading: loadingDistinctProducts } = useDistinctLeadProducts(id ?? null);
  const upsertStages = useUpsertStages();
  const upsertRules = useUpsertTransitionRules();
  const upsertLeadProducts = useUpsertLeadFunnelProducts();
  const saveProductMappings = useSaveLeadProductMappings();
  const saveSourceNodes = useSaveFunnelSourceNodes();
  const saveFunnelEdges = useSaveFunnelEdges();
  const moveLeadStage = useMoveLeadStage();
  const queryClient = useQueryClient();
  const { data: userRole = 'vendedor' } = useCurrentUserRole();
  const isAdmin = userRole === 'admin' || userRole === 'gestor';
  const { data: hasAccess, isLoading: loadingAccess } = useHasFunnelAccess(id ?? null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);
  const [bulkMoving, setBulkMoving] = useState(false);

  // Bulk purchase data for recontact fallback
  const { data: purchaseMap } = useBulkLeadPurchases(positions);
  const recontactMap = useRecontactDeadlines(positions, leadFunnelProducts, productMappings, purchaseMap);
  const allCatalogProducts = paymentFunnels.flatMap(f => f.funnel_products || []);

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const selectedLead = useMemo(() => {
    if (!selectedLeadId) return null;
    return positions.find(p => p.lead_id === selectedLeadId)?.lead ?? null;
  }, [selectedLeadId, positions]);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleBulkMoveOverdue = useCallback(async () => {
    if (!id || !funnel) return;
    const stagesArr = funnel.lead_funnel_stages || [];
    setBulkMoving(true);
    let movedCount = 0;
    try {
      for (const product of leadFunnelProducts) {
        if (!product.auto_move_stage_id || !product.recontact_days) continue;
        
        for (const pos of positions) {
          const leadId = pos.lead_id;
          const recontact = recontactMap.get(leadId);
          if (!recontact?.isOverdue) continue;
          if (recontact.matchedProductId !== product.id) continue;
          if (pos.stage_id === product.auto_move_stage_id) continue;

          const targetStage = stagesArr.find(s => s.id === product.auto_move_stage_id);
          await moveLeadStage.mutateAsync({
            positionId: pos.id,
            leadId,
            funnelId: id,
            fromStageId: pos.stage_id,
            toStageId: product.auto_move_stage_id,
            toStageName: targetStage?.name,
          });
          movedCount++;
        }
      }
      if (movedCount > 0) {
        toast.success(`${movedCount} lead(s) movido(s) por recontato vencido`);
      } else {
        toast.info('Nenhum lead vencido para mover');
      }
    } catch {
      toast.error('Erro ao mover leads');
    } finally {
      setBulkMoving(false);
    }
  }, [id, funnel, leadFunnelProducts, positions, recontactMap, moveLeadStage]);

  const handleClearFunnel = async () => {
    if (!id) return;
    setClearing(true);
    try {
      await (supabase as any)
        .from('lead_events')
        .delete()
        .eq('funnel_id', id);

      await (supabase as any)
        .from('lead_stage_positions')
        .delete()
        .eq('funnel_id', id);

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
      setSelectedLeadId(leadId);
      setTimelineOpen(true);
    }
  };

  const handleWhatsAppClick = (phone: string) => {
    navigate(`/whatsapp?phone=${encodeURIComponent(phone)}`);
  };

  const handleAutoSaveNodes = useCallback(async (nodes: Node[]) => {
    if (!id) return;

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

  if ((isLoading || loadingAccess) && !funnel) {
    return <div className="p-6 text-muted-foreground">Carregando funil...</div>;
  }

  if (!funnel) {
    return <div className="p-6 text-destructive">Funil não encontrado</div>;
  }

  if (!isAdmin && hasAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Layers className="h-12 w-12 mx-auto mb-4 opacity-40" />
        <p className="text-lg font-medium">Acesso negado</p>
        <p className="text-sm mt-1">Você não tem permissão para acessar este funil.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/lead-campaigns')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
      </div>
    );
  }

  const stages = funnel.lead_funnel_stages || [];
  const rules = funnel.stage_transition_rules || [];
  const isBaseFunnel = /base/i.test(funnel.name) || stages.length <= 1;

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
      <Tabs defaultValue={isBaseFunnel ? 'leads' : 'kanban'}>
        <TabsList>
          {isBaseFunnel ? (
            <TabsTrigger value="leads">Base de Leads</TabsTrigger>
          ) : (
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
          )}
          <TabsTrigger value="visual">Funil</TabsTrigger>
          {isAdmin && <TabsTrigger value="flow">Flow Editor</TabsTrigger>}
          {isAdmin && <TabsTrigger value="metrics">Métricas</TabsTrigger>}
          {isAdmin && <TabsTrigger value="config">Configuração</TabsTrigger>}
          {isAdmin && <TabsTrigger value="webhook">Webhook</TabsTrigger>}
        </TabsList>

        {isBaseFunnel ? (
          <TabsContent value="leads" className="mt-4">
            <BaseLeadsList
              positions={positions}
              onLeadClick={handleLeadClick}
              onWhatsAppClick={handleWhatsAppClick}
              recontactMap={recontactMap}
            />
          </TabsContent>
        ) : (
          <TabsContent value="kanban" className="mt-4">
            <KanbanBoard
              stages={stages}
              positions={positions}
              onLeadClick={handleLeadClick}
              onWhatsAppClick={handleWhatsAppClick}
              funnelId={funnel.id}
              recontactMap={recontactMap}
              userRole={userRole}
              currentUserId={currentUserId}
            />
          </TabsContent>
        )}

        <TabsContent value="visual" className="mt-4">
          <FunnelVisual stages={stages} leadCounts={leadCounts} />
        </TabsContent>

        {isAdmin && (
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
        )}

        {isAdmin && (
          <TabsContent value="metrics" className="mt-4">
            <FunnelMetricsTab stages={stages} positions={positions} />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="config" className="mt-4">
            <FunnelConfigTab
              funnelId={funnel.id}
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
              leadFunnelProducts={leadFunnelProducts}
              catalogProducts={allCatalogProducts}
              onSaveProducts={async (prods) => {
                try {
                  await upsertLeadProducts.mutateAsync({ funnelId: funnel.id, products: prods });
                  toast.success('Produtos salvos!');
                } catch {
                  toast.error('Erro ao salvar produtos');
                }
              }}
              savingProducts={upsertLeadProducts.isPending}
              onBulkMoveOverdue={handleBulkMoveOverdue}
              bulkMoving={bulkMoving}
              distinctLeadProducts={distinctLeadProducts}
              existingMappings={productMappings}
              onSaveMappings={async (mappings) => {
                try {
                  await saveProductMappings.mutateAsync({ funnelId: funnel.id, mappings });
                  toast.success('Vínculos salvos!');
                } catch {
                  toast.error('Erro ao salvar vínculos');
                }
              }}
              savingMappings={saveProductMappings.isPending}
              loadingDistinctProducts={loadingDistinctProducts}
              positions={positions}
            />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="webhook" className="mt-4">
            <WebhookConfig funnel={funnel} />
          </TabsContent>
        )}
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
