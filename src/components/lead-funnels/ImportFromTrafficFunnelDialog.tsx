import React, { useState, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
}

const PAGE_SIZE = 1000;

async function fetchAllSales(trafficFunnelId: string, dateFrom: string, dateTo: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await (supabase as any)
      .from('v_all_sales')
      .select('customer_email, customer_name, utm_source, utm_medium, utm_campaign, utm_content, product_name, platform, purchased_at, status, revenue')
      .eq('funnel_id', trafficFunnelId)
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

async function fetchLeadsByUtm(trafficFunnelId: string, organizationId: string, dateFrom: string, dateTo: string) {
  // Pega nomes de campanhas Meta atribuídas ao funil de tráfego
  const { data: campaigns, error: campErr } = await (supabase as any)
    .from('meta_campaigns')
    .select('name')
    .eq('funnel_id', trafficFunnelId);
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
  open, onOpenChange, stages, funnelId, organizationId,
}) => {
  const { data: trafficFunnels = [] } = useFunnels();
  const importMutation = useImportLeads();

  const [trafficFunnelId, setTrafficFunnelId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('2026-01-01');
  const [dateTo, setDateTo] = useState<string>(new Date().toISOString().slice(0, 10));
  const [includeSales, setIncludeSales] = useState(true);
  const [includeUtm, setIncludeUtm] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; skipped: number; fetched: number } | null>(null);

  const firstStage = useMemo(
    () => [...stages].sort((a, b) => a.sort_order - b.sort_order)[0],
    [stages],
  );

  const handleClose = () => {
    if (loading) return;
    setResult(null);
    setProgress(0);
    onOpenChange(false);
  };

  const handleImport = async () => {
    if (!trafficFunnelId || !firstStage) return;
    setLoading(true);
    setProgress(0);
    setResult(null);

    try {
      const fetches: Promise<any[]>[] = [];
      if (includeSales) fetches.push(fetchAllSales(trafficFunnelId, dateFrom, dateTo));
      if (includeUtm) fetches.push(fetchLeadsByUtm(trafficFunnelId, organizationId, dateFrom, dateTo));
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
              traffic_funnel_id: trafficFunnelId,
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
              traffic_funnel_id: trafficFunnelId,
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Importar do funil de tráfego
          </DialogTitle>
          <DialogDescription>
            Traz leads (vendas + UTM) de um funil de tráfego para a primeira etapa deste funil de leads.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Funil de tráfego origem</Label>
            <Select value={trafficFunnelId} onValueChange={setTrafficFunnelId} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um funil..." />
              </SelectTrigger>
              <SelectContent>
                {trafficFunnels.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: f.color }} />
                      {f.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                Incluir vendas atribuídas ao funil
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
                {result.fetched} encontrados no funil de tráfego
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
            disabled={loading || !trafficFunnelId || !firstStage || (!includeSales && !includeUtm)}
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
