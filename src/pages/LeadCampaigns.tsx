import React, { useState, useMemo } from 'react';
import { useLeadCampaigns, useCreateLeadCampaign, useDeleteLeadCampaign, useUpdateLeadCampaign } from '@/hooks/useLeadCampaigns';
import { useLeadFunnels, useCreateLeadFunnel, useDeleteLeadFunnel } from '@/hooks/useLeadFunnels';
import { useFunnels } from '@/hooks/useFunnels';
import { useCurrentUserRole } from '@/hooks/useCurrentUserRole';
import { useMyFunnelAccess } from '@/hooks/useLeadFunnelAccess';
import FunnelAccessManager from '@/components/lead-funnels/FunnelAccessManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, ChevronRight, Layers, Users, Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const LeadCampaignsPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: campaigns = [], isLoading, isError: campaignsError } = useLeadCampaigns();
  const { data: allFunnels = [], isError: funnelsError } = useLeadFunnels();
  const { data: trafficFunnels = [] } = useFunnels();
  const { data: userRole = 'vendedor', isError: roleError } = useCurrentUserRole();
  const { data: myAccess = [], isError: accessError } = useMyFunnelAccess();
  const isAdmin = userRole === 'admin' || userRole === 'gestor';
  const hasError = campaignsError || funnelsError || roleError || accessError;

  const createCampaign = useCreateLeadCampaign();
  const deleteCampaign = useDeleteLeadCampaign();
  const updateCampaign = useUpdateLeadCampaign();
  const createFunnel = useCreateLeadFunnel();
  const deleteFunnel = useDeleteLeadFunnel();

  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showNewFunnel, setShowNewFunnel] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedTrafficFunnelId, setSelectedTrafficFunnelId] = useState<string | null>(null);
  const [accessCampaignId, setAccessCampaignId] = useState<string | null>(null);
  const [accessFunnelId, setAccessFunnelId] = useState<string | null>(null);

  // Filter funnels/campaigns for sellers (with safety catch)
  const visibleFunnels = useMemo(() => {
    try {
      if (isAdmin) return allFunnels;
      return allFunnels.filter(f => {
        if (myAccess.some(a => a.funnel_id === f.id)) return true;
        if (f.campaign_id && myAccess.some(a => a.campaign_id === f.campaign_id && !a.funnel_id)) return true;
        return false;
      });
    } catch {
      return [];
    }
  }, [allFunnels, myAccess, isAdmin]);

  const visibleCampaigns = useMemo(() => {
    try {
      if (isAdmin) return campaigns;
      const campaignIds = new Set(visibleFunnels.map(f => f.campaign_id).filter(Boolean));
      myAccess.forEach(a => { if (a.campaign_id) campaignIds.add(a.campaign_id); });
      return campaigns.filter(c => campaignIds.has(c.id));
    } catch {
      return [];
    }
  }, [campaigns, visibleFunnels, myAccess, isAdmin]);

  const orphanFunnels = visibleFunnels.filter(f => !f.campaign_id);

  const handleCreateCampaign = async () => {
    if (!newName.trim()) return;
    try {
      await createCampaign.mutateAsync({ name: newName, color: newColor });
      toast.success('Campanha criada!');
      setShowNewCampaign(false);
      setNewName('');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar campanha');
    }
  };

  const handleCreateFunnel = async () => {
    if (!newName.trim()) return;
    try {
      const funnel = await createFunnel.mutateAsync({
        name: newName,
        color: newColor,
        campaign_id: selectedCampaignId,
        traffic_funnel_id: selectedTrafficFunnelId,
      });
      toast.success('Funil criado!');
      setShowNewFunnel(false);
      setNewName('');
      setSelectedTrafficFunnelId(null);
      navigate(`/lead-funnels/${funnel.id}`);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao criar funil');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Funis de Leads</h1>
            <p className="text-sm text-muted-foreground mt-1 animate-pulse">Carregando dados...</p>
          </div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 rounded-full animate-pulse bg-muted" />
                <div className="h-5 w-40 rounded animate-pulse bg-muted" />
              </div>
              <div className="mt-3 ml-7 space-y-2">
                {[1, 2].map(j => (
                  <div key={j} className="h-10 rounded-md animate-pulse bg-muted/50" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="p-6 text-center py-20 text-muted-foreground">
        <p className="text-lg font-medium text-foreground">Erro ao carregar dados</p>
        <p className="text-sm mt-1">Não foi possível carregar os funis. Tente recarregar a página.</p>
        <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 rounded-md border border-border text-sm hover:bg-muted transition-colors">
          Recarregar
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Funis de Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie campanhas e funis de rastreamento de leads
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Dialog open={showNewCampaign} onOpenChange={setShowNewCampaign}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={() => { setNewName(''); setNewColor('#6366f1'); }}>
                  <Plus className="h-4 w-4 mr-1" /> Campanha
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova Campanha</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome da campanha" />
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground">Cor:</label>
                    <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="w-10 h-8 rounded" />
                  </div>
                  <Button onClick={handleCreateCampaign} className="w-full" disabled={createCampaign.isPending}>
                    Criar Campanha
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={showNewFunnel} onOpenChange={setShowNewFunnel}>
              <DialogTrigger asChild>
                <Button onClick={() => { setNewName(''); setNewColor('#10b981'); setSelectedCampaignId(null); setSelectedTrafficFunnelId(null); }}>
                  <Plus className="h-4 w-4 mr-1" /> Novo Funil
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo Funil</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do funil" />
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground">Cor:</label>
                    <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="w-10 h-8 rounded" />
                  </div>
                  <select
                    value={selectedCampaignId || ''}
                    onChange={e => setSelectedCampaignId(e.target.value || null)}
                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                  >
                    <option value="">Sem campanha</option>
                    {campaigns.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <select
                    value={selectedTrafficFunnelId || ''}
                    onChange={e => setSelectedTrafficFunnelId(e.target.value || null)}
                    className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                  >
                    <option value="">Sem funil de tráfego associado</option>
                    {trafficFunnels.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  <Button onClick={handleCreateFunnel} className="w-full" disabled={createFunnel.isPending}>
                    Criar Funil
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Access management dialog */}
      <Dialog
        open={!!(accessCampaignId || accessFunnelId)}
        onOpenChange={(open) => { if (!open) { setAccessCampaignId(null); setAccessFunnelId(null); } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Permissões de Acesso</DialogTitle>
          </DialogHeader>
          <FunnelAccessManager
            campaignId={accessCampaignId || undefined}
            funnelId={accessFunnelId || undefined}
          />
        </DialogContent>
      </Dialog>

      {/* Campaigns with funnels */}
      {visibleCampaigns.map(campaign => {
        const funnels = visibleFunnels.filter(f => f.campaign_id === campaign.id);
        return (
          <div key={campaign.id} className="border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: campaign.color }} />
                <h2 className="font-semibold text-foreground">{campaign.name}</h2>
                <span className="text-xs text-muted-foreground">({funnels.length} funis)</span>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <select
                    value={campaign.traffic_funnel_id || ''}
                    onChange={async (e) => {
                      const val = e.target.value || null;
                      try {
                        await updateCampaign.mutateAsync({ id: campaign.id, traffic_funnel_id: val });
                        toast.success(val ? 'Funil de tráfego associado à campanha!' : 'Funil de tráfego desvinculado');
                      } catch {
                        toast.error('Erro ao atualizar campanha');
                      }
                    }}
                    className="border border-input rounded-md px-2 py-1 text-xs bg-background max-w-[180px]"
                    title="Funil de tráfego da campanha"
                  >
                    <option value="">Sem funil de tráfego</option>
                    {trafficFunnels.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Permissões de acesso"
                    onClick={() => setAccessCampaignId(campaign.id)}
                  >
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm('Excluir campanha?')) deleteCampaign.mutate(campaign.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              )}
            </div>

            <div className="divide-y divide-border">
              {funnels.map(funnel => (
                <div
                  key={funnel.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 cursor-pointer transition-colors"
                >
                  <div
                    className="flex items-center gap-2 flex-1"
                    onClick={() => navigate(`/lead-funnels/${funnel.id}`)}
                  >
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{funnel.name}</span>
                    {!funnel.is_active && (
                      <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">inativo</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Permissões do funil"
                        onClick={(e) => { e.stopPropagation(); setAccessFunnelId(funnel.id); }}
                      >
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
              {funnels.length === 0 && (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">Nenhum funil nesta campanha</p>
              )}
            </div>
          </div>
        );
      })}

      {/* Funnels without campaign */}
      {orphanFunnels.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-muted/30">
            <h2 className="font-semibold text-foreground">Funis sem campanha</h2>
          </div>
          <div className="divide-y divide-border">
            {orphanFunnels.map(funnel => (
              <div
                key={funnel.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 cursor-pointer transition-colors"
              >
                <div
                  className="flex items-center gap-2 flex-1"
                  onClick={() => navigate(`/lead-funnels/${funnel.id}`)}
                >
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{funnel.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Permissões do funil"
                        onClick={e => { e.stopPropagation(); setAccessFunnelId(funnel.id); }}
                      >
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={e => {
                          e.stopPropagation();
                          if (confirm('Excluir funil?')) deleteFunnel.mutate(funnel.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {visibleCampaigns.length === 0 && orphanFunnels.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <Layers className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">Nenhum funil de leads ainda</p>
          <p className="text-sm mt-1">
            {isAdmin ? 'Crie uma campanha ou funil para começar a rastrear leads' : 'Você não tem acesso a nenhum funil. Peça ao administrador.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default LeadCampaignsPage;