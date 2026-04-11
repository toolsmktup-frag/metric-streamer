import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MetaEntity {
  id: string;
  name: string;
  status: string;
}

async function getOrgId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');
  const { data } = await (supabase as any)
    .from('user_profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();
  if (!data?.organization_id) throw new Error('Sem organização');
  return data.organization_id;
}

export function useMetaEntities(scopeType: 'campaign' | 'adset' | 'ad') {
  const tableMap = {
    campaign: 'meta_campaigns',
    adset: 'meta_adsets',
    ad: 'meta_ads',
  };

  return useQuery({
    queryKey: ['meta-entities', scopeType],
    queryFn: async () => {
      const orgId = await getOrgId();
      const table = tableMap[scopeType];
      const { data, error } = await (supabase as any)
        .from(table)
        .select('meta_id, name, status')
        .eq('organization_id', orgId)
        .order('name');
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.meta_id,
        name: row.name || `ID: ${row.meta_id}`,
        status: row.status || 'UNKNOWN',
      })) as MetaEntity[];
    },
  });
}
