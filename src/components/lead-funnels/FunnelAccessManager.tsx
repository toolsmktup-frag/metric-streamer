import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useOrgFunnelAccess, useGrantFunnelAccess, useRevokeFunnelAccess } from '@/hooks/useLeadFunnelAccess';

interface UserAccess {
  user_id: string;
  full_name: string;
  hasCampaignAccess: boolean;
  hasFunnelAccess: boolean;
}

interface FunnelAccessManagerProps {
  /** When set, manages campaign-level access */
  campaignId?: string;
  /** When set, manages funnel-level access */
  funnelId?: string;
  /** Title for the section */
  title?: string;
}

export default function FunnelAccessManager({ campaignId, funnelId, title }: FunnelAccessManagerProps) {
  const [users, setUsers] = useState<UserAccess[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingUser, setSavingUser] = useState<string | null>(null);
  const { data: allAccess = [] } = useOrgFunnelAccess();
  const grantAccess = useGrantFunnelAccess();
  const revokeAccess = useRevokeFunnelAccess();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
      if (!orgId) return;

      const { data: profiles } = await (supabase as any)
        .from('user_profiles')
        .select('id, full_name, role')
        .eq('organization_id', orgId);

      // Only show sellers (vendedor/suporte) — admins/gestors always have access
      const sellers = (profiles || []).filter((p: any) => !['admin', 'gestor'].includes(p.role));

      const mapped: UserAccess[] = sellers.map((p: any) => ({
        user_id: p.id,
        full_name: p.full_name || 'Sem nome',
        email: p.email || '',
        hasCampaignAccess: allAccess.some(
          a => a.user_id === p.id && a.campaign_id === campaignId && !a.funnel_id
        ),
        hasFunnelAccess: allAccess.some(
          a => a.user_id === p.id && a.funnel_id === funnelId
        ),
      }));

      setUsers(mapped);
    } catch (err) {
      console.error('Error fetching users for access:', err);
    } finally {
      setLoading(false);
    }
  }, [campaignId, funnelId, allAccess]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const toggleCampaignAccess = async (userId: string, grant: boolean) => {
    if (!campaignId) return;
    setSavingUser(userId);
    try {
      const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
      if (grant) {
        await grantAccess.mutateAsync({ userId, campaignId, organizationId: orgId });
      } else {
        await revokeAccess.mutateAsync({ userId, campaignId });
      }
    } finally {
      setSavingUser(null);
    }
  };

  const toggleFunnelAccess = async (userId: string, grant: boolean) => {
    if (!funnelId) return;
    setSavingUser(userId);
    try {
      const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
      if (grant) {
        await grantAccess.mutateAsync({ userId, funnelId, organizationId: orgId });
      } else {
        await revokeAccess.mutateAsync({ userId, funnelId });
      }
    } finally {
      setSavingUser(null);
    }
  };

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
      <p className="text-xs text-muted-foreground py-2">
        Nenhum vendedor na organização (admins e gestores já têm acesso total).
      </p>
    );
  }

  const isCampaignMode = !!campaignId && !funnelId;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">
          {title || (isCampaignMode ? 'Acesso dos Vendedores à Campanha' : 'Acesso dos Vendedores ao Funil')}
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        {isCampaignMode
          ? 'Marque para dar acesso a todos os funis desta campanha. Admins e gestores já têm acesso total.'
          : 'Marque para dar acesso individual a este funil. Vendedores com acesso à campanha inteira já aparecem marcados.'}
      </p>
      <div className="space-y-1.5">
        {users.map(user => {
          const checked = isCampaignMode ? user.hasCampaignAccess : (user.hasFunnelAccess || user.hasCampaignAccess);
          const disabled = !isCampaignMode && user.hasCampaignAccess; // Can't toggle funnel if campaign-level granted
          return (
            <div key={user.user_id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
              <Checkbox
                id={`faccess-${user.user_id}`}
                checked={checked}
                disabled={savingUser === user.user_id || disabled}
                onCheckedChange={(val) => {
                  if (isCampaignMode) {
                    toggleCampaignAccess(user.user_id, !!val);
                  } else {
                    toggleFunnelAccess(user.user_id, !!val);
                  }
                }}
              />
              <Label htmlFor={`faccess-${user.user_id}`} className="flex-1 cursor-pointer">
                <span className="text-sm text-foreground">{user.full_name}</span>
                {user.email && (
                  <span className="text-xs text-muted-foreground ml-2">{user.email}</span>
                )}
                {disabled && (
                  <span className="text-xs text-primary ml-2">(acesso via campanha)</span>
                )}
              </Label>
              {savingUser === user.user_id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
