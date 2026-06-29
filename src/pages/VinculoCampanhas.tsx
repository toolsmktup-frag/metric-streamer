import React, { useMemo, useState } from 'react';
import { Link2, Search, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useMetaCampaigns, useSetCampaignFunnel } from '@/hooks/useCampaignFunnels';
import { useFunnelOptions } from '@/hooks/useAiClassifications';

const NONE = '__none';
const MAX_ROWS = 200;

const VinculoCampanhas: React.FC = () => {
  const { data: campaigns = [], isLoading } = useMetaCampaigns();
  const { data: funnels = [] } = useFunnelOptions();
  const setFunnel = useSetCampaignFunnel();

  const [search, setSearch] = useState('');
  const [filterFunnel, setFilterFunnel] = useState<string>('all'); // all | none | <funnel_id>
  const [edits, setEdits] = useState<Record<string, string>>({});

  const semFunil = useMemo(() => campaigns.filter(c => !c.funnel_id).length, [campaigns]);

  const filtered = useMemo(() => {
    let r = campaigns;
    if (filterFunnel === 'none') r = r.filter(c => !c.funnel_id);
    else if (filterFunnel !== 'all') r = r.filter(c => c.funnel_id === filterFunnel);
    const s = search.trim().toLowerCase();
    if (s) r = r.filter(c => (c.name || '').toLowerCase().includes(s));
    return r;
  }, [campaigns, search, filterFunnel]);

  const funnelName = (id?: string | null) => funnels.find(f => f.id === id)?.name;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-1">
        <Link2 className="h-6 w-6 text-sky-600" /> Vínculo de Campanhas
      </h1>
      <p className="text-sm text-muted-foreground mb-4">
        A qual funil cada campanha do Meta pertence. Quando a conta de anúncios é compartilhada entre funis,
        o automático erra — corrija aqui e o tráfego (investimento, CTR, impressões) passa a aparecer no funil certo.
      </p>

      {semFunil > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          <AlertTriangle className="h-4 w-4" />
          {semFunil} campanha(s) sem funil definido — elas não aparecem em nenhum KPI de funil.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar campanha por nome..." className="pl-9" />
        </div>
        <Select value={filterFunnel} onValueChange={setFilterFunnel}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os funis</SelectItem>
            <SelectItem value="none">⚠️ Sem funil</SelectItem>
            {funnels.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="text-xs text-muted-foreground mb-2">
        {filtered.length} campanha(s){filtered.length > MAX_ROWS ? ` — mostrando as ${MAX_ROWS} primeiras, refine a busca` : ''}
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Campanha</th>
              <th className="text-left p-3 w-56">Funil</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">Carregando campanhas...</td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">Nenhuma campanha encontrada.</td></tr>
            )}
            {filtered.slice(0, MAX_ROWS).map(c => {
              const cur = edits[c.id] ?? (c.funnel_id || NONE);
              const changed = cur !== (c.funnel_id || NONE);
              return (
                <tr key={c.id} className="border-t border-border">
                  <td className="p-2.5">
                    <div className="font-medium leading-tight">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      conta {c.account_id}
                      {c.status && <span className="ml-2 capitalize">· {c.status.toLowerCase()}</span>}
                      {!c.funnel_id && <Badge variant="outline" className="ml-2 text-[9px] text-amber-700 border-amber-300">sem funil</Badge>}
                    </div>
                  </td>
                  <td className="p-2.5">
                    <Select value={cur} onValueChange={v => setEdits(e => ({ ...e, [c.id]: v }))}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— sem funil —</SelectItem>
                        {funnels.map(f => <SelectItem key={f.id} value={f.id}>{f.name}{f.is_active ? '' : ' (inativo)'}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2.5 text-right">
                    <Button size="sm" variant={changed ? 'default' : 'outline'} disabled={!changed || setFunnel.isPending}
                      onClick={async () => {
                        try {
                          await setFunnel.mutateAsync({ campaignId: c.id, funnelId: cur === NONE ? null : cur });
                          toast.success(`Vinculado a ${cur === NONE ? 'nenhum funil' : funnelName(cur)}`);
                        } catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); }
                      }}>Salvar</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VinculoCampanhas;
