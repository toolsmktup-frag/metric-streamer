import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { WhatsAppInstance } from '@/hooks/useWhatsApp';
import { getInstanceDisplayName } from '@/hooks/useWhatsApp';

interface UserAccess {
  user_id: string;
  full_name: string;
  has_access: boolean;
}

interface InstanceAccessManagerProps {
  instances: WhatsAppInstance[];
  selectedInstanceId: string | null;
}

export default function InstanceAccessManager({ instances, selectedInstanceId }: InstanceAccessManagerProps) {
  const [users, setUsers] = useState<UserAccess[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchUsersAndAccess = useCallback(async () => {
    if (!selectedInstanceId) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get current user's org
      const { data: currentProfile } = await (supabase as any)
        .from('user_profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!currentProfile?.organization_id) return;

      // Get all org members (exclude admins — they always have access; exclude bloqueados/pendentes)
      const { data: profiles } = await (supabase as any)
        .from('user_profiles')
        .select('id, full_name, role, status')
        .eq('organization_id', currentProfile.organization_id)
        .neq('role', 'admin')
        .eq('status', 'active');

      // Get existing access records for this instance
      const { data: accessRecords } = await (supabase as any)
        .from('whatsapp_instance_access')
        .select('user_id')
        .eq('instance_id', selectedInstanceId);

      const accessSet = new Set((accessRecords || []).map((r: any) => r.user_id));

      setUsers(
        (profiles || []).map((p: any) => ({
          user_id: p.id,
          full_name: p.full_name || 'Sem nome',
          has_access: accessSet.has(p.id),
        }))
      );
    } catch (err) {
      console.error('Error fetching access:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedInstanceId]);

  useEffect(() => {
    fetchUsersAndAccess();
  }, [fetchUsersAndAccess]);

  const toggleAccess = async (userId: string, grant: boolean) => {
    if (!selectedInstanceId) return;
    setSaving(userId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: currentProfile } = await (supabase as any)
        .from('user_profiles')
        .select('organization_id')
        .eq('id', user?.id)
        .single();
      const orgId = currentProfile?.organization_id;

      if (grant) {
        const { error } = await (supabase as any)
          .from('whatsapp_instance_access')
          .insert({
            user_id: userId,
            instance_id: selectedInstanceId,
            organization_id: orgId,
          });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('whatsapp_instance_access')
          .delete()
          .eq('user_id', userId)
          .eq('instance_id', selectedInstanceId);
        if (error) throw error;
      }

      setUsers(prev =>
        prev.map(u => u.user_id === userId ? { ...u, has_access: grant } : u)
      );
      toast.success(grant ? 'Acesso concedido' : 'Acesso removido');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar acesso');
    } finally {
      setSaving(null);
    }
  };

  if (!selectedInstanceId) {
    return (
      <p className="text-xs text-muted-foreground">Selecione uma instância para gerenciar acessos.</p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Carregando vendedores...</span>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Nenhum vendedor encontrado na organização.</p>
    );
  }

  const instanceName = instances.find(i => i.id === selectedInstanceId) 
    ? getInstanceDisplayName(instances.find(i => i.id === selectedInstanceId)!) 
    : '';

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Marque os vendedores que terão acesso à instância <strong>{instanceName}</strong>.
        Admins sempre têm acesso a todas.
      </p>
      <div className="space-y-2">
        {users.map(user => (
          <div key={user.user_id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
            <Checkbox
              id={`access-${user.user_id}`}
              checked={user.has_access}
              onCheckedChange={(checked) => toggleAccess(user.user_id, !!checked)}
              disabled={saving === user.user_id}
            />
            <Label htmlFor={`access-${user.user_id}`} className="flex-1 cursor-pointer">
              <span className="text-sm text-foreground">{user.full_name}</span>
            </Label>
            {saving === user.user_id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
        ))}
      </div>
    </div>
  );
}
