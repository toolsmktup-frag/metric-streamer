import React, { useState } from 'react';
import { Sparkles, Check, X, Trash2, RefreshCw, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  usePendingSuggestions, useAutoMappings, useFunnelOptions, useAllProductMappings,
  useApproveClassification, useRejectSuggestion, useUpdateMapping, useDeleteMapping, useRunClassifier,
  ROLE_LABELS, type Role,
} from '@/hooks/useAiClassifications';

const ROLES = Object.keys(ROLE_LABELS) as Role[];
const brl = (v?: number | null) => (v ? `R$ ${Math.round(v).toLocaleString('pt-BR')}` : '—');

function ConfidenceBadge({ c }: { c: string | null }) {
  if (c === 'high') return <Badge className="bg-emerald-600">alta</Badge>;
  if (c === 'medium') return <Badge className="bg-amber-500">média</Badge>;
  return <Badge variant="outline">baixa</Badge>;
}

const ClassificacaoIA: React.FC = () => {
  const { data: pending = [], isLoading: lp } = usePendingSuggestions();
  const { data: autos = [], isLoading: la } = useAutoMappings();
  const { data: allMappings = [], isLoading: lm } = useAllProductMappings();
  const { data: funnels = [] } = useFunnelOptions();
  const approve = useApproveClassification();
  const reject = useRejectSuggestion();
  const updateMap = useUpdateMapping();
  const delMap = useDeleteMapping();
  const run = useRunClassifier();

  // edição inline por linha: id -> { funnel_id, role }
  const [edits, setEdits] = useState<Record<string, { funnel_id: string; role: Role }>>({});
  const setEdit = (id: string, patch: Partial<{ funnel_id: string; role: Role }>) =>
    setEdits(e => ({ ...e, [id]: { ...e[id], ...patch } as any }));

  const funnelName = (id?: string | null) => funnels.find(f => f.id === id)?.name || '—';

  const FunnelSelect = ({ value, onChange }: { value?: string; onChange: (v: string) => void }) => (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Escolher funil" /></SelectTrigger>
      <SelectContent>
        {funnels.map(f => (
          <SelectItem key={f.id} value={f.id}>{f.name}{f.is_active ? '' : ' (inativo)'}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const RoleSelect = ({ value, onChange }: { value?: string; onChange: (v: string) => void }) => (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Papel" /></SelectTrigger>
      <SelectContent>
        {ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const runAnalysis = async () => {
    try {
      const res: any = await run.mutateAsync();
      toast.success(`Análise concluída — ${res?.processed ?? 0} produto(s) processado(s).`);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao rodar a análise');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6 text-violet-600" /> Classificação por IA
        </h1>
        <Button variant="outline" onClick={runAnalysis} disabled={run.isPending}>
          <RefreshCw className={`h-4 w-4 mr-1 ${run.isPending ? 'animate-spin' : ''}`} /> Rodar análise agora
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        A IA classifica os produtos novos que aparecem nas vendas. Confirme ou corrija aqui — cada ajuste
        ensina o motor e melhora as próximas classificações. O dashboard usa essa classificação na hora.
      </p>

      {/* ─── Aguardando revisão ─── */}
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-amber-500" /> Aguardando sua revisão
        {pending.length > 0 && <Badge variant="secondary">{pending.length}</Badge>}
      </h2>
      <div className="border border-border rounded-lg overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Produto</th>
              <th className="text-left p-3">Vendas</th>
              <th className="text-left p-3">Sugestão da IA</th>
              <th className="text-left p-3">Funil / Papel</th>
              <th className="w-44"></th>
            </tr>
          </thead>
          <tbody>
            {lp && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>}
            {!lp && pending.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">
                Nada pendente — tudo classificado. 🎉
              </td></tr>
            )}
            {pending.map(s => {
              const cur = edits[s.id] || { funnel_id: s.suggested_funnel_id || '', role: (s.suggested_role as Role) || 'front' };
              return (
                <tr key={s.id} className="border-t border-border align-top">
                  <td className="p-3">
                    <div className="font-medium">{s.product_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{s.platform} · {s.product_id}</div>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <div>{s.sales_count ?? 0}</div>
                    <div className="text-xs text-muted-foreground">{brl(s.revenue)}</div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">{s.suggested_funnel_name || (s.suggested_role === 'other' ? 'nenhum' : '—')}</span>
                      <ConfidenceBadge c={s.confidence} />
                    </div>
                    {s.reasoning && <div className="text-xs text-muted-foreground mt-0.5 max-w-[220px]">{s.reasoning}</div>}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1.5">
                      <FunnelSelect value={cur.funnel_id} onChange={v => setEdit(s.id, { funnel_id: v })} />
                      <RoleSelect value={cur.role} onChange={v => setEdit(s.id, { role: v as Role })} />
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1.5">
                      <Button size="sm" disabled={approve.isPending}
                        onClick={async () => {
                          try {
                            await approve.mutateAsync({
                              suggestionId: s.id, funnel_id: cur.funnel_id, role: cur.role,
                              product_id: s.product_id, platform: s.platform, product_name: s.product_name || '',
                            });
                            toast.success('Classificado!');
                          } catch (e: any) { toast.error(e?.message || 'Erro'); }
                        }}>
                        <Check className="h-4 w-4 mr-1" /> Confirmar
                      </Button>
                      <Button size="sm" variant="ghost" disabled={reject.isPending}
                        onClick={async () => {
                          try { await reject.mutateAsync(s.id); toast.success('Ignorado'); }
                          catch (e: any) { toast.error(e?.message || 'Erro'); }
                        }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── Já classificado pela IA ─── */}
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-violet-500" /> Classificado automaticamente pela IA
        {autos.length > 0 && <Badge variant="secondary">{autos.length}</Badge>}
      </h2>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Produto</th>
              <th className="text-left p-3">Classificação atual</th>
              <th className="text-left p-3">Corrigir</th>
              <th className="w-32"></th>
            </tr>
          </thead>
          <tbody>
            {la && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>}
            {!la && autos.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Nenhum produto classificado pela IA ainda.</td></tr>
            )}
            {autos.map(m => {
              const cur = edits[m.id] || { funnel_id: m.funnel_id, role: m.role as Role };
              const changed = cur.funnel_id !== m.funnel_id || cur.role !== m.role;
              return (
                <tr key={m.id} className="border-t border-border align-top">
                  <td className="p-3">
                    <div className="font-medium">{m.display_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{m.platform} · {m.product_id}</div>
                  </td>
                  <td className="p-3">
                    <div>{m.funnel_name}</div>
                    <div className="text-xs text-muted-foreground">{ROLE_LABELS[m.role as Role] || m.role}</div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1.5">
                      <FunnelSelect value={cur.funnel_id} onChange={v => setEdit(m.id, { funnel_id: v })} />
                      <RoleSelect value={cur.role} onChange={v => setEdit(m.id, { role: v as Role })} />
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1.5">
                      <Button size="sm" variant={changed ? 'default' : 'outline'} disabled={!changed || updateMap.isPending}
                        onClick={async () => {
                          try { await updateMap.mutateAsync({ id: m.id, funnel_id: cur.funnel_id, role: cur.role }); toast.success('Corrigido'); }
                          catch (e: any) { toast.error(e?.message || 'Erro'); }
                        }}>Salvar</Button>
                      <Button size="sm" variant="ghost" disabled={delMap.isPending}
                        onClick={async () => {
                          if (!confirm(`Remover a classificação de "${m.display_name}"? Ele volta a "other".`)) return;
                          try { await delMap.mutateAsync(m.id); toast.success('Removido'); }
                          catch (e: any) { toast.error(e?.message || 'Erro'); }
                        }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── Todos os produtos por funil ─── */}
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-1 mt-8">
        <Brain className="h-4 w-4 text-violet-600" /> Todos os produtos por funil
      </h2>
      <p className="text-sm text-muted-foreground mb-3">
        A classificação que o dashboard usa. Ajuste o papel de qualquer produto (ex: marcar um SKU como upsell) — vale na hora.
      </p>
      {lm && <div className="p-6 text-center text-muted-foreground">Carregando...</div>}
      {Object.entries(
        allMappings.reduce((acc: Record<string, typeof allMappings>, m) => {
          const k = m.funnel_name || '(sem funil)';
          (acc[k] ||= []).push(m);
          return acc;
        }, {})
      ).map(([funil, prods]) => (
        <div key={funil} className="mb-5 border border-border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-3 py-2 text-sm font-semibold">{funil}</div>
          <table className="w-full text-sm">
            <tbody>
              {prods.map(m => {
                const cur = edits[m.id]?.role || (m.role as Role);
                const changed = cur !== m.role;
                return (
                  <tr key={m.id} className="border-t border-border">
                    <td className="p-2.5">
                      <div className="font-medium">{m.display_name || m.product_name_contains}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {m.platform || 'todas'} · {m.product_id || `nome: ${m.product_name_contains}`}
                        {m.source === 'ai_auto' && <Badge variant="outline" className="ml-2 text-[9px]">IA</Badge>}
                      </div>
                    </td>
                    <td className="p-2.5 w-44">
                      <RoleSelect value={cur} onChange={v => setEdit(m.id, { role: v as Role, funnel_id: m.funnel_id })} />
                    </td>
                    <td className="p-2.5 w-24 text-right">
                      <Button size="sm" variant={changed ? 'default' : 'outline'} disabled={!changed || updateMap.isPending}
                        onClick={async () => {
                          try { await updateMap.mutateAsync({ id: m.id, funnel_id: m.funnel_id, role: cur }); toast.success('Salvo'); }
                          catch (e: any) { toast.error(e?.message || 'Erro'); }
                        }}>Salvar</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

export default ClassificacaoIA;
