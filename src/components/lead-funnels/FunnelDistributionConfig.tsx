import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Scale, Users } from 'lucide-react';
import { useFunnelDistribution, useSaveFunnelDistribution } from '@/hooks/useFunnelDistribution';

interface Props {
  funnelId: string;
}

interface Seller {
  id: string;
  full_name: string;
}

const FunnelDistributionConfig: React.FC<Props> = ({ funnelId }) => {
  const { data: config, isLoading: loadingConfig } = useFunnelDistribution(funnelId);
  const save = useSaveFunnelDistribution();

  // Mesma query (e queryKey) do RedistributeLeadsDialog → compartilha cache.
  const { data: sellers = [], isLoading: loadingSellers } = useQuery({
    queryKey: ['funnel-sellers', funnelId],
    queryFn: async (): Promise<Seller[]> => {
      const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
      if (!orgId) return [];

      const { data: accessRecords, error: accessErr } = await (supabase as any)
        .from('lead_funnel_access')
        .select('user_id')
        .eq('organization_id', orgId)
        .or(`funnel_id.eq.${funnelId},funnel_id.is.null`);
      if (accessErr) throw accessErr;
      if (!accessRecords?.length) return [];

      const userIds = [...new Set(accessRecords.map((r: any) => r.user_id))] as string[];

      const { data: profiles, error: profErr } = await (supabase as any)
        .from('user_profiles')
        .select('id, full_name, role')
        .in('id', userIds)
        .eq('status', 'active');
      if (profErr) throw profErr;

      return (profiles || []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name || 'Sem nome',
      }));
    },
  });

  const [enabled, setEnabled] = useState(false);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const initialized = useRef(false);

  // Inicializa o estado local uma vez, quando config + sellers carregam.
  useEffect(() => {
    if (initialized.current) return;
    if (loadingConfig || loadingSellers || !config) return;
    setEnabled(config.enabled);
    const saved = new Map(config.weights.map(w => [w.user_id, w.weight]));
    const init: Record<string, number> = {};
    sellers.forEach(s => {
      init[s.id] = saved.get(s.id) ?? 0;
    });
    setWeights(init);
    initialized.current = true;
  }, [config, sellers, loadingConfig, loadingSellers]);

  const setWeight = (userId: string, value: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(value || 0)));
    setWeights(prev => ({ ...prev, [userId]: clamped }));
  };

  // Preview proporcional: "A cada 10 leads novos: ~9 Fulana, ~1 Beltrana"
  const preview = useMemo(() => {
    const active = sellers
      .map(s => ({ name: s.full_name, weight: weights[s.id] ?? 0 }))
      .filter(w => w.weight > 0);
    const total = active.reduce((acc, w) => acc + w.weight, 0);
    if (total === 0) return [];
    return active.map(w => ({ name: w.name, perTen: Math.round((w.weight / total) * 10) }));
  }, [sellers, weights]);

  const totalWeight = useMemo(
    () => sellers.reduce((acc, s) => acc + (weights[s.id] ?? 0), 0),
    [sellers, weights]
  );

  const handleSave = () => {
    const payload = sellers
      .map(s => ({ user_id: s.id, weight: weights[s.id] ?? 0 }))
      .filter(w => w.weight > 0);
    save.mutate({ funnelId, enabled, weights: payload });
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
        <Scale className="h-5 w-5 text-primary" />
        Distribuição automática de leads
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        Atribui leads novos (sem dono) automaticamente entre as vendedoras com acesso a este funil,
        respeitando os pesos. O "Assumir" manual continua funcionando por cima.
      </p>

      <div className="flex items-center gap-3 mb-4">
        <Switch checked={enabled} onCheckedChange={setEnabled} id="auto-distribute" />
        <label htmlFor="auto-distribute" className="text-sm font-medium text-foreground cursor-pointer">
          Distribuir leads automaticamente entre vendedores
        </label>
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          Pesos por vendedora
        </label>

        {loadingSellers ? (
          <p className="text-sm text-muted-foreground">Carregando vendedoras...</p>
        ) : sellers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma vendedora com acesso a este funil. Libere o acesso primeiro na tela{' '}
            <span className="font-medium text-foreground">Equipe</span>.
          </p>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {sellers.map(seller => (
              <div key={seller.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground">{seller.full_name}</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={weights[seller.id] ?? 0}
                  onChange={e => setWeight(seller.id, Number(e.target.value))}
                  className="w-20 text-right"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview */}
      {enabled && preview.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-3 mt-3">
          <p className="text-sm text-foreground">
            A cada 10 leads novos:{' '}
            <span className="font-medium">
              {preview.map(p => `~${p.perTen} ${p.name}`).join(', ')}
            </span>
          </p>
        </div>
      )}

      {enabled && totalWeight === 0 && sellers.length > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-500 mt-3">
          Defina um peso maior que 0 para ao menos uma vendedora — senão nenhum lead será distribuído.
        </p>
      )}

      <p className="text-xs text-muted-foreground mt-3">
        Salvar redefine a contagem de balanceamento (recomeça a proporção do zero).
      </p>

      <Button onClick={handleSave} className="mt-2" disabled={save.isPending || loadingConfig}>
        {save.isPending ? 'Salvando...' : 'Salvar distribuição'}
      </Button>
    </div>
  );
};

export default FunnelDistributionConfig;
