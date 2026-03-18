import { useState } from 'react';
import { useTeamMembers, ROLES, ROLE_LABELS } from '@/hooks/useTeamMembers';
import { Loader2, Users, Pencil, Check, X, Shield } from 'lucide-react';
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

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-destructive/15 text-destructive border-destructive/30',
  gestor: 'bg-primary/15 text-primary border-primary/30',
  vendedor: 'bg-chart-2/15 text-chart-2 border-chart-2/30',
  suporte: 'bg-accent text-accent-foreground border-border',
};

export default function Equipe() {
  const { data: members = [], isLoading, updateRole, updateName } = useTeamMembers();
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameValue, setNameValue] = useState('');

  function startEditName(userId: string, currentName: string) {
    setEditingName(userId);
    setNameValue(currentName || '');
  }

  function saveEditName(userId: string) {
    updateName.mutate({ userId, fullName: nameValue });
    setEditingName(null);
  }

  if (isLoading) {
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
            Gerencie os membros da sua equipe e seus papéis de acesso.
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
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {members.map(member => (
                <tr key={member.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
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

                  {/* Created */}
                  <td className="py-3 px-4 text-muted-foreground text-xs">
                    {new Date(member.created_at).toLocaleDateString('pt-BR')}
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        💡 Para adicionar novos membros, peça para eles criarem uma conta no login. Eles serão vinculados automaticamente à sua organização.
      </p>
    </div>
  );
}
