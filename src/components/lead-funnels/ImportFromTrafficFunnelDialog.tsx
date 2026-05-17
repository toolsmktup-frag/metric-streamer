import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Loader2, CheckCircle, TrendingUp } from 'lucide-react';
import { LeadFunnelStage } from '@/types/leadFunnels';
import { useFunnels } from '@/hooks/useFunnels';
import { useImportLeads } from '@/hooks/useImportLeads';
import { supabase } from '@/integrations/supabase/client';
import { dayStartISO, dayEndISO } from '@/lib/dateUtils';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: LeadFunnelStage[];
  funnelId: string;
  organizationId: string;
  /** Funis de tráfego pré-selecionados (vinculados ao funil de lead). */
  defaultTrafficFunnelIds?: string[];
}

const PAGE_SIZE = 1000;

async function fetchAllSales(trafficFunnelIds: string[], dateFrom: string, dateTo: string) {
  if (trafficFunnelIds.length === 0) return [];
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await (supabase as any)
      .from('v_all_sales')
      .select('customer_email, customer_name, utm_source, utm_medium, utm_campaign, utm_content, product_name, platform, purchased_at, status, revenue, funnel_id')
      .in('funnel_id', trafficFunnelIds)
      .gte('purchased_at', dayStartISO(dateFrom))
      .lte('purchased_at', dayEndISO(dateTo))
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data || []) as any[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchLeadsByUtm(trafficFunnelIds: string[], organizationId: string, dateFrom: string, dateTo: string) {
  if (trafficFunnelIds.length === 0) return [];
  // Pega nomes de campanhas Meta atribuídas aos funis de tráfego selecionados
  const { data: campaigns, error: campErr } = await (supabase as any)
    .from('meta_campaigns')
    .select('name')
    .in('funnel_id', trafficFunnelIds);
  if (campErr) throw campErr;
  const names = Array.from(new Set(((campaigns || []) as { name: string }[]).map(c => c.name).filter(Boolean)));
  if (names.length === 0) return [];

  // Chunk em batches pequenos pra evitar URL gigante (PostgREST → 400 Bad Request)
  const NAMES_CHUNK = 25;
  const seen = new Set<string>();
  const rows: any[] = [];

  for (let i = 0; i < names.length; i += NAMES_CHUNK) {
    const chunk = names.slice(i, i + NAMES_CHUNK);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await (supabase as any)
        .from('leads')
        .select('id, name, email, phone, utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at')
        .eq('organization_id', organizationId)
        .in('utm_campaign', chunk)
        .gte('created_at', dayStartISO(dateFrom))
        .lte('created_at', dayEndISO(dateTo))
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const batch = (data || []) as any[];
      for (const r of batch) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        rows.push(r);
      }
      if (batch.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

const ImportFromTrafficFunnelDialog: React.FC<Props> = ({
  open, onOpenChange, stages, funnelId, organizationId, defaultTrafficFunnelIds = [],
}) => {
  const { data: trafficFunnels = [] } = useFunnels();
  const importMutation = useImportLeads();

  const [selectedIds, setSelectedIds] = useState<string[]>(defaultTrafficFunnelIds);
  const [dateFrom, setDateFrom] = useState<string>('2026-01-01');
  const [dateTo, setDateTo] = useState<string>(new Date().toISOString().slice(0, 10));
  const [includeSales, setIncludeSales] = useState(true);
  const [includeUtm, setIncludeUtm] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; skipped: number; fetched: number } | null>(null);

  // Atualiza seleção default quando o dialog abre ou os defaults mudam
  useEffect(() => {
    if (open) setSelectedIds(defaultTrafficFunnelIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultTrafficFunnelIds.join('|')]);

  const firstStage = useMemo(
    () => [...stages].sort((a, b) => a.sort_order - b.sort_order)[0],
    [stages],
  );

  const toggle = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleClose = () => {
    if (loading) return;
    setResult(null);
    setProgress(0);
    onOpenChange(false);
  };

  const handleImport = async () => {
    if (selectedIds.length === 0 || !firstStage) return;
    setLoading(true);
    setProgress(0);
    setResult(null);

    try {
      const fetches: Promise<any[]>[] = [];
      if (includeSales) fetches.push(fetchAllSales(selectedIds, dateFrom, dateTo));
      if (includeUtm) fetches.push(fetchLeadsByUtm(selectedIds, organizationId, dateFrom, dateTo));
      const results = await Promise.all(fetches);

      const importLeads: any[] = [];

      // Vendas → ImportLead
      if (includeSales && results[0]) {
        for (const s of results[0]) {
          if (!s.customer_email && !s.customer_name) continue;
          importLeads.push({
            name: s.customer_name || null,
            email: s.customer_email || null,
            phone: null,
            utm_source: s.utm_source || null,
            utm_medium: s.utm_medium || null,
            utm_campaign: s.utm_campaign || null,
            utm_content: s.utm_content || null,
            utm_term: null,
            metadata: {
              source: 'traffic_funnel_import',
              traffic_funnel_id: s.funnel_id || null,
              traffic_funnel_ids: selectedIds,
              product_name: s.product_name || null,
              platform: s.platform || null,
              purchased_at: s.purchased_at || null,
              amount: s.revenue ?? null,
              status: s.status || null,
            },
          });
        }
      }

      // Leads por UTM
      const utmRows = includeUtm ? (includeSales ? results[1] : results[0]) : null;
      if (utmRows) {
        for (const l of utmRows) {
          if (!l.email && !l.phone) continue;
          importLeads.push({
            name: l.name || null,
            email: l.email || null,
            phone: l.phone || null,
            utm_source: l.utm_source || null,
            utm_medium: l.utm_medium || null,
            utm_campaign: l.utm_campaign || null,
            utm_content: l.utm_content || null,
            utm_term: l.utm_term || null,
            metadata: {
              source: 'traffic_funnel_import_utm',
              traffic_funnel_ids: selectedIds,
            },
          });
        }
      }

      if (importLeads.length === 0) {
        toast.warning('Nenhum lead encontrado no período selecionado');
        setLoading(false);
        return;
      }

      const res = await importMutation.mutateAsync({
        leads: importLeads,
        funnelId,
        stageId: firstStage.id,
        organizationId,
        onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
      });

      setResult({ ...res, fetched: importLeads.length });
    } catch (err: any) {
      console.error('[ImportFromTrafficFunnel]', err);
      toast.error(err?.message || 'Erro ao importar do funil de tráfego');
    } finally {
      setLoading(false);
    }
  };

  const allChecked = trafficFunnels.length > 0 && selectedIds.length === trafficFunnels.length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Importar do funil de tráfego
          </DialogTitle>
          <DialogDescription>
            Selecione um ou mais funis de tráfego. Vendas e leads via UTM serão trazidos para a primeira etapa deste funil.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Funis de tráfego origem</Label>
              <button
                type="button"
                onClick={() => setSelectedIds(allChecked ? [] : trafficFunnels.map(f => f.id))}
                className="text-xs text-primary hover:underline"
                disabled={loading}
              >
                {allChecked ? 'Limpar' : 'Selecionar todos'}
              </button>
            </div>
            <div className="rounded-lg border border-border max-h-48 overflow-y-auto divide-y divide-border">
              {trafficFunnels.length === 0 && (
                <p className="text-xs text-muted-foreground p-3">Nenhum funil de tráfego disponível.</p>
              )}
              {trafficFunnels.map(f => {
                const checked = selectedIds.includes(f.id);
                const wasDefault = defaultTrafficFunnelIds.includes(f.id);
                return (
                  <label
                    key={f.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer text-sm"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(f.id)} disabled={loading} />
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                    <span className="flex-1 truncate">{f.name}</span>
                    {wasDefault && (
                      <span className="text-[10px] uppercase tracking-wide text-primary/80">vinculado</span>
                    )}
                  </label>
                );
              })}
            </div>
            {selectedIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedIds.length} funil(is) selecionado(s). Duplicados (mesmo email) são ignorados.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>De</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label>Até</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} disabled={loading} />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Checkbox id="sales" checked={includeSales} onCheckedChange={v => setIncludeSales(!!v)} disabled={loading} />
              <Label htmlFor="sales" className="cursor-pointer text-sm font-normal">
                Incluir vendas atribuídas aos funis
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="utm" checked={includeUtm} onCheckedChange={v => setIncludeUtm(!!v)} disabled={loading} />
              <Label htmlFor="utm" className="cursor-pointer text-sm font-normal">
                Incluir leads com UTM das campanhas Meta
              </Label>
            </div>
          </div>

          {firstStage && (
            <p className="text-xs text-muted-foreground">
              Leads serão inseridos na primeira etapa: <strong className="text-foreground">{firstStage.name}</strong>.
              Leads que já existem no funil são ignorados.
            </p>
          )}

          {loading && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground text-center">{progress}%</p>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <CheckCircle className="h-4 w-4 text-primary" />
                <strong>{result.imported}</strong> leads importados
              </div>
              <p className="text-xs text-muted-foreground">
                {result.fetched} encontrados nos funis de tráfego
                {result.skipped > 0 && ` · ${result.skipped} ignorados`}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Fechar
          </Button>
          <Button
            onClick={handleImport}
            disabled={loading || selectedIds.length === 0 || !firstStage || (!includeSales && !includeUtm)}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" /> Importar leads
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportFromTrafficFunnelDialog;
