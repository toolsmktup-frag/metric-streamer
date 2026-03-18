import { useState, useEffect, useCallback } from 'react';
import { useTeamMembers, ROLES, ROLE_LABELS } from '@/hooks/useTeamMembers';
import { useOrgPermissions, MODULE_KEYS, MODULE_LABELS, type ModuleKey } from '@/hooks/useUserPermissions';
import { useWhatsAppInstances, getInstanceDisplayName } from '@/hooks/useWhatsApp';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Users, Pencil, Check, X, Shield, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
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

export default function Equipe() {
  const { data: members = [], isLoading, updateRole, updateName } = useTeamMembers();
  const { data: permissions = [], isLoading: loadingPerms, updatePermission } = useOrgPermissions();
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState('');
  const [expandedPerms, setExpandedPerms] = useState<string | null>(null);

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

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nome</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Role</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Desde</th>
                <th className="text-center py-3 px-4 font-medium text-muted-foreground">Módulos</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {members.map(member => {
                const perm = getPermission(member.id);
                const isExpanded = expandedPerms === member.id;
                const enabledCount = perm
                  ? MODULE_KEYS.filter(k => perm[k]).length
                  : MODULE_KEYS.length;

                return (
                  <tr key={member.id} className="border-b border-border last:border-0">
                    {/* Row */}
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Expanded permissions panel (rendered outside table for layout) */}
        {members.map(member => {
          const perm = getPermission(member.id);
          const isExpanded = expandedPerms === member.id;
          if (!isExpanded || !perm) return null;

          return (
            <div key={`perm-${member.id}`} className="border-t border-border bg-muted/10 px-6 py-4">
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
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        💡 Para adicionar novos membros, peça para eles criarem uma conta no login. Eles serão vinculados automaticamente à sua organização.
      </p>
    </div>
  );
}
