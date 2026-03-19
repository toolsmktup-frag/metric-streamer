import { useState, useEffect, useCallback } from 'react';
import { useTeamMembers, ROLES, ROLE_LABELS, STATUS_LABELS } from '@/hooks/useTeamMembers';
import { useOrgPermissions, MODULE_KEYS, MODULE_LABELS, type ModuleKey } from '@/hooks/useUserPermissions';
import { useWhatsAppInstances, getInstanceDisplayName } from '@/hooks/useWhatsApp';
import { useLeadCampaigns } from '@/hooks/useLeadCampaigns';
import { useLeadFunnels } from '@/hooks/useLeadFunnels';
import { useOrgFunnelAccess, useGrantFunnelAccess, useRevokeFunnelAccess } from '@/hooks/useLeadFunnelAccess';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Users, Pencil, Check, X, Shield, ChevronDown, ChevronUp, MessageSquare, UserCheck, UserX, Clock, Target, Camera } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-destructive/15 text-destructive border-destructive/30',
  gestor: 'bg-primary/15 text-primary border-primary/30',
  vendedor: 'bg-chart-2/15 text-chart-2 border-chart-2/30',
  suporte: 'bg-accent text-accent-foreground border-border',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-chart-2/15 text-chart-2 border-chart-2/30',
  pending: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  blocked: 'bg-destructive/15 text-destructive border-destructive/30',
};

export default function Equipe() {
  const { data: members = [], isLoading, updateRole, updateName, updateStatus } = useTeamMembers();
  const { data: permissions = [], isLoading: loadingPerms, updatePermission } = useOrgPermissions();
  const { instances, loading: loadingInstances } = useWhatsAppInstances();
  const { data: campaigns = [] } = useLeadCampaigns();
  const { data: allFunnels = [] } = useLeadFunnels();
  const { data: allFunnelAccess = [] } = useOrgFunnelAccess();
  const grantFunnelAccess = useGrantFunnelAccess();
  const revokeFunnelAccess = useRevokeFunnelAccess();
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState('');
  const [expandedPerms, setExpandedPerms] = useState<string | null>(null);
  const [instanceAccess, setInstanceAccess] = useState<Record<string, Set<string>>>({});
  const [savingAccess, setSavingAccess] = useState<string | null>(null);
  const [savingFunnelAccess, setSavingFunnelAccess] = useState<string | null>(null);

  const pendingMembers = members.filter(m => m.status === 'pending');
  const activeMembers = members.filter(m => m.status !== 'pending');

  // Fetch instance access for all members
  const fetchInstanceAccess = useCallback(async () => {
    try {
      const { data } = await (supabase as any)
        .from('whatsapp_instance_access')
        .select('user_id, instance_id');
      if (data) {
        const map: Record<string, Set<string>> = {};
        for (const row of data) {
          if (!map[row.user_id]) map[row.user_id] = new Set();
          map[row.user_id].add(row.instance_id);
        }
        setInstanceAccess(map);
      }
    } catch (err) {
      console.error('Error fetching instance access:', err);
    }
  }, []);

  useEffect(() => {
    fetchInstanceAccess();
  }, [fetchInstanceAccess]);

  const toggleInstanceAccess = async (userId: string, instanceId: string, grant: boolean) => {
    setSavingAccess(`${userId}-${instanceId}`);
    try {
      const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
      if (grant) {
        const { error } = await (supabase as any)
          .from('whatsapp_instance_access')
          .insert({ user_id: userId, instance_id: instanceId, organization_id: orgId });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('whatsapp_instance_access')
          .delete()
          .eq('user_id', userId)
          .eq('instance_id', instanceId);
        if (error) throw error;
      }
      setInstanceAccess(prev => {
        const updated = { ...prev };
        if (!updated[userId]) updated[userId] = new Set();
        else updated[userId] = new Set(updated[userId]);
        if (grant) updated[userId].add(instanceId);
        else updated[userId].delete(instanceId);
        return updated;
      });
      toast.success(grant ? 'Acesso concedido' : 'Acesso removido');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar acesso');
    } finally {
      setSavingAccess(null);
    }
  };

  const toggleCampaignFunnelAccess = async (userId: string, type: 'campaign' | 'funnel', targetId: string, grant: boolean) => {
    const key = `${userId}-${type}-${targetId}`;
    setSavingFunnelAccess(key);
    try {
      const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
      if (grant) {
        const params: any = { userId, organizationId: orgId };
        if (type === 'campaign') params.campaignId = targetId;
        else params.funnelId = targetId;
        await grantFunnelAccess.mutateAsync(params);
      } else {
        const params: any = { userId };
        if (type === 'campaign') params.campaignId = targetId;
        else params.funnelId = targetId;
        await revokeFunnelAccess.mutateAsync(params);
      }
    } finally {
      setSavingFunnelAccess(null);
    }
  };

  function startEditName(userId: string, currentName: string) {
    setEditingName(userId);
    setNameValue(currentName || '');
  }

  function saveEditName(userId: string) {
    updateName.mutate({ userId, fullName: nameValue });
    setEditingName(null);
  }

  function getPermission(userId: string) {
    return permissions.find(p => p.user_id === userId);
  }

  function toggleExpand(userId: string) {
    setExpandedPerms(prev => prev === userId ? null : userId);
  }

  function handleApprove(userId: string) {
    updateStatus.mutate({ userId, status: 'active' });
  }

  function handleBlock(userId: string) {
    updateStatus.mutate({ userId, status: 'blocked' });
  }

  function handleUnblock(userId: string) {
    updateStatus.mutate({ userId, status: 'active' });
  }

  if (isLoading || loadingPerms) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6" />
            Equipe
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie os membros da sua equipe, papéis e permissões de acesso.
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {members.length} {members.length === 1 ? 'membro' : 'membros'}
        </Badge>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {ROLES.map(role => (
          <div key={role} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${ROLE_COLORS[role]?.split(' ')[0] || 'bg-muted'}`} />
            <span className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
          </div>
        ))}
      </div>

      {/* Pending approval section */}
      {pendingMembers.length > 0 && (
        <div className="rounded-xl border-2 border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-500/20 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold text-foreground">Pendentes de aprovação</span>
            <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-xs ml-1">
              {pendingMembers.length}
            </Badge>
          </div>
          <div className="divide-y divide-amber-500/10">
            {pendingMembers.map(member => (
              <div key={member.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-amber-500/10 flex items-center justify-center text-sm font-bold text-amber-600">
                    {(member.full_name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{member.full_name || 'Sem nome'}</p>
                    <p className="text-xs text-muted-foreground">
                      Cadastro em {new Date(member.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-chart-2 border-chart-2/30 hover:bg-chart-2/10"
                    onClick={() => handleApprove(member.id)}
                    disabled={updateStatus.isPending}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => handleBlock(member.id)}
                    disabled={updateStatus.isPending}
                  >
                    <UserX className="h-3.5 w-3.5" />
                    Rejeitar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active members table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nome</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Role</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Desde</th>
                <th className="text-center py-3 px-4 font-medium text-muted-foreground">Módulos</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {activeMembers.map(member => {
                const perm = getPermission(member.id);
                const isExpanded = expandedPerms === member.id;
                const enabledCount = perm
                  ? MODULE_KEYS.filter(k => perm[k]).length
                  : MODULE_KEYS.length;

                return (
                  <tr key={member.id} className="border-b border-border last:border-0">
                    {/* Name */}
                    <td className="py-3 px-4">
                      {editingName === member.id ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={nameValue}
                            onChange={e => setNameValue(e.target.value)}
                            className="h-8 text-sm w-48"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveEditName(member.id);
                              if (e.key === 'Escape') setEditingName(null);
                            }}
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEditName(member.id)}>
                            <Check className="h-3.5 w-3.5 text-chart-2" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingName(null)}>
                            <X className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {(member.full_name || '?')[0].toUpperCase()}
                          </div>
                          <span className="font-medium text-foreground">
                            {member.full_name || 'Sem nome'}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Role */}
                    <td className="py-3 px-4">
                      <Select
                        value={member.role}
                        onValueChange={role => updateRole.mutate({ userId: member.id, role })}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <div className="flex items-center gap-1.5">
                            <Shield className="h-3 w-3" />
                            <SelectValue />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map(r => (
                            <SelectItem key={r} value={r}>
                              <span className="text-xs">{ROLE_LABELS[r]}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <Badge variant="outline" className={`text-xs ${STATUS_COLORS[member.status] || ''}`}>
                        {STATUS_LABELS[member.status] || member.status}
                      </Badge>
                    </td>

                    {/* Since */}
                    <td className="py-3 px-4 text-muted-foreground text-xs">
                      {new Date(member.created_at).toLocaleDateString('pt-BR')}
                    </td>

                    {/* Modules toggle */}
                    <td className="py-3 px-4 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => toggleExpand(member.id)}
                      >
                        <span>{enabledCount}/{MODULE_KEYS.length}</span>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {editingName !== member.id && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => startEditName(member.id, member.full_name || '')}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {member.status === 'active' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleBlock(member.id)}
                            title="Bloquear usuário"
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {member.status === 'blocked' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-chart-2 hover:text-chart-2"
                            onClick={() => handleUnblock(member.id)}
                            title="Desbloquear usuário"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Expanded permissions panel */}
        {activeMembers.map(member => {
          const perm = getPermission(member.id);
          const isExpanded = expandedPerms === member.id;
          if (!isExpanded || !perm) return null;

          const userInstances = instanceAccess[member.id] || new Set();

          return (
            <div key={`perm-${member.id}`} className="border-t border-border bg-muted/10 px-6 py-4 space-y-5">
              {/* Module permissions */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">
                  Permissões de módulo — {member.full_name || 'Sem nome'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                  {MODULE_KEYS.map(mod => (
                    <label key={mod} className="flex items-center gap-2 cursor-pointer">
                      <Switch
                        checked={perm[mod]}
                        onCheckedChange={(checked: boolean) =>
                          updatePermission.mutate({
                            permissionId: perm.id,
                            field: mod,
                            value: checked,
                          })
                        }
                      />
                      <span className="text-xs text-foreground">{MODULE_LABELS[mod]}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* WhatsApp instances */}
              {instances.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Instâncias WhatsApp
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {instances.map(inst => {
                      const hasAccess = userInstances.has(inst.id);
                      const isSaving = savingAccess === `${member.id}-${inst.id}`;
                      return (
                        <label
                          key={inst.id}
                          className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                        >
                          <Checkbox
                            checked={hasAccess}
                            onCheckedChange={(checked) =>
                              toggleInstanceAccess(member.id, inst.id, !!checked)
                            }
                            disabled={isSaving}
                          />
                          <span className="text-xs text-foreground">{getInstanceDisplayName(inst)}</span>
                          {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Campaign / Funnel access */}
              {campaigns.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5" />
                    Acesso a Campanhas / Funis de Leads
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Marque a campanha para dar acesso a todos os funis. Ou marque funis individuais.
                  </p>
                  <div className="space-y-3">
                    {campaigns.map(campaign => {
                      const hasCampaignAccess = allFunnelAccess.some(
                        a => a.user_id === member.id && a.campaign_id === campaign.id && !a.funnel_id
                      );
                      const campaignSaving = savingFunnelAccess === `${member.id}-campaign-${campaign.id}`;
                      const campaignFunnels = allFunnels.filter(f => f.campaign_id === campaign.id);

                      return (
                        <div key={campaign.id} className="rounded-md border border-border p-3 space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={hasCampaignAccess}
                              onCheckedChange={(checked) =>
                                toggleCampaignFunnelAccess(member.id, 'campaign', campaign.id, !!checked)
                              }
                              disabled={campaignSaving}
                            />
                            <span className="text-xs font-medium text-foreground">{campaign.name}</span>
                            <span className="text-[10px] text-muted-foreground">(campanha inteira)</span>
                            {campaignSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                          </label>
                          {campaignFunnels.length > 0 && (
                            <div className="ml-6 space-y-1">
                              {campaignFunnels.map(funnel => {
                                const hasFunnelAccess = allFunnelAccess.some(
                                  a => a.user_id === member.id && a.funnel_id === funnel.id
                                );
                                const inherited = hasCampaignAccess;
                                const funnelSaving = savingFunnelAccess === `${member.id}-funnel-${funnel.id}`;
                                return (
                                  <label key={funnel.id} className="flex items-center gap-2 cursor-pointer">
                                    <Checkbox
                                      checked={inherited || hasFunnelAccess}
                                      onCheckedChange={(checked) =>
                                        toggleCampaignFunnelAccess(member.id, 'funnel', funnel.id, !!checked)
                                      }
                                      disabled={inherited || funnelSaving}
                                    />
                                    <span className="text-xs text-foreground">{funnel.name}</span>
                                    {inherited && (
                                      <span className="text-[10px] text-primary">(via campanha)</span>
                                    )}
                                    {funnelSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        💡 Para adicionar novos membros, peça para eles criarem uma conta no login. Eles aparecerão como "pendentes" para sua aprovação.
      </p>
    </div>
  );
}
