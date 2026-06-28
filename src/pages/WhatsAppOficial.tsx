import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Plus, RefreshCw, Sparkles, Trash2, CheckCircle2, Send } from 'lucide-react';
import {
  useWhatsAppOfficialInstances,
  useWhatsAppOfficialTemplates,
} from '@/hooks/useWhatsAppOfficial';
import { createWebinarPreset } from '@/lib/webinarPreset';
import { useNavigate } from 'react-router-dom';

const SUPABASE_URL = 'https://emfbocpmphtftqcezaib.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmJvY3BtcGh0ZnRxY2V6YWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODc4ODAsImV4cCI6MjA4ODU2Mzg4MH0.EpE1RwQhmk4C9YFdVjnJXp__cI8LPiic5dMqIMP1g8M';

async function callEdge<T = any>(name: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error || `Erro ${res.status}`);
  return json as T;
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'APPROVED' || status === 'connected') return 'default';
  if (status === 'REJECTED' || status === 'disconnected') return 'destructive';
  if (status === 'PENDING' || status === 'connecting') return 'secondary';
  return 'outline';
}

// ─────────────────────────── ABA INSTÂNCIAS ───────────────────────────
function InstancesTab() {
  const { instances, loading, refetch } = useWhatsAppOfficialInstances();
  const [form, setForm] = useState({ instance_name: '', waba_id: '', phone_number_id: '', access_token: '', app_secret: '' });
  const [busy, setBusy] = useState(false);
  const [webhook, setWebhook] = useState<{ url: string; verify_token: string } | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const connect = async () => {
    if (!form.instance_name || !form.waba_id || !form.phone_number_id || !form.access_token) {
      toast.error('Preencha nome, WABA ID, Phone Number ID e Access Token.');
      return;
    }
    setBusy(true);
    try {
      const out = await callEdge('meta-whatsapp-instance', { action: 'connect', ...form });
      toast.success('Número oficial conectado e validado!');
      setWebhook(out.webhook || null);
      setForm({ instance_name: '', waba_id: '', phone_number_id: '', access_token: '', app_secret: '' });
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (id: string) => {
    try {
      const out = await callEdge('meta-whatsapp-instance', { action: 'verify', instance_id: id });
      toast.success(`Status: ${out?.processed?.status || 'ok'}`);
      refetch();
    } catch (e) { toast.error((e as Error).message); }
  };

  const remove = async (id: string) => {
    if (!confirm('Remover esta instância oficial?')) return;
    try {
      await callEdge('meta-whatsapp-instance', { action: 'delete', instance_id: id });
      toast.success('Instância removida.');
      refetch();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Conectar número (API Oficial)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Nome da instância</Label>
            <Input value={form.instance_name} onChange={(e) => set('instance_name', e.target.value)} placeholder="Ex: Vendas Oficial" />
          </div>
          <div className="space-y-1">
            <Label>WhatsApp Business Account ID (WABA)</Label>
            <Input value={form.waba_id} onChange={(e) => set('waba_id', e.target.value)} placeholder="ID da conta business" />
          </div>
          <div className="space-y-1">
            <Label>Phone Number ID</Label>
            <Input value={form.phone_number_id} onChange={(e) => set('phone_number_id', e.target.value)} placeholder="ID do número" />
          </div>
          <div className="space-y-1">
            <Label>Access Token (System User permanente)</Label>
            <Input type="password" value={form.access_token} onChange={(e) => set('access_token', e.target.value)} placeholder="EAAB..." />
          </div>
          <div className="space-y-1">
            <Label>App Secret (opcional — valida o webhook)</Label>
            <Input type="password" value={form.app_secret} onChange={(e) => set('app_secret', e.target.value)} placeholder="opcional" />
          </div>
          <Button onClick={connect} disabled={busy} className="w-full gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Conectar e validar
          </Button>

          {webhook && (
            <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-xs space-y-1">
              <p className="font-medium">Configure o webhook no painel da Meta (WhatsApp › Configuration):</p>
              <p className="break-all"><b>Callback URL:</b> {webhook.url}</p>
              <p className="break-all"><b>Verify Token:</b> {webhook.verify_token}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Números conectados</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : instances.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma instância oficial conectada ainda.</p>
          ) : instances.map((i) => (
            <div key={i.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{i.display_name || i.instance_name}</p>
                <p className="text-xs text-muted-foreground">{i.phone_number || i.meta_phone_number_id}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant(i.status)}>{i.status}</Badge>
                <Button variant="ghost" size="icon" onClick={() => verify(i.id)} title="Verificar"><RefreshCw className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(i.id)} title="Remover"><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────── ABA TEMPLATES ───────────────────────────
function TemplatesTab() {
  const { instances } = useWhatsAppOfficialInstances();
  const { templates, loading, refetch } = useWhatsAppOfficialTemplates();
  const [instanceId, setInstanceId] = useState<string>('');
  const [syncing, setSyncing] = useState(false);

  const effInstance = instanceId || instances[0]?.id || '';

  const sync = async () => {
    if (!effInstance) { toast.error('Conecte uma instância oficial primeiro.'); return; }
    setSyncing(true);
    try {
      const out = await callEdge('meta-templates-sync', { instance_id: effInstance });
      toast.success(`${out.synced} template(s) sincronizado(s).`);
      refetch();
    } catch (e) { toast.error((e as Error).message); } finally { setSyncing(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {instances.length > 0 && (
          <Select value={effInstance} onValueChange={setInstanceId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Instância oficial" /></SelectTrigger>
            <SelectContent>
              {instances.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.display_name || i.instance_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" onClick={sync} disabled={syncing} className="gap-2">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sincronizar com a Meta
        </Button>
        <GenerateDialog instanceId={effInstance} onCreated={refetch} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Templates</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum template ainda. Gere com IA ou sincronize da Meta.</p>
          ) : templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.category} · {t.language}{t.strategy === 'bypass' ? ' · bypass' : ''}
                </p>
              </div>
              <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────── DIÁLOGO: GERAR COM IA ───────────────────────
function GenerateDialog({ instanceId, onCreated }: { instanceId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [strategy, setStrategy] = useState<'bypass' | 'utility' | 'marketing'>('bypass');
  const [quantity, setQuantity] = useState('2');
  const [primaryUrl, setPrimaryUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [creatingIdx, setCreatingIdx] = useState<number | null>(null);

  const generate = async () => {
    if (!prompt.trim()) { toast.error('Descreva o que você quer comunicar.'); return; }
    setGenerating(true);
    try {
      const out = await callEdge('meta-templates-generate', {
        prompt, strategy, quantity: Number(quantity), primaryUrl: primaryUrl || undefined,
      });
      setResults(out.templates || []);
      if (!out.templates?.length) toast.error('A IA não retornou templates. Tente reformular.');
    } catch (e) { toast.error((e as Error).message); } finally { setGenerating(false); }
  };

  const createOnMeta = async (tpl: any, idx: number) => {
    if (!instanceId) { toast.error('Selecione/conecte uma instância oficial.'); return; }
    setCreatingIdx(idx);
    try {
      await callEdge('meta-templates-create', { instance_id: instanceId, ...tpl });
      toast.success(`Template "${tpl.name}" enviado para aprovação da Meta.`);
      onCreated();
    } catch (e) { toast.error((e as Error).message); } finally { setCreatingIdx(null); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Sparkles className="h-4 w-4" /> Gerar com IA</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Gerar templates com IA</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>O que você quer comunicar?</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
              placeholder="Ex: convidar para o workshop de ervas com bônus, vagas limitadas, evento amanhã 19h" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Estratégia</Label>
              <Select value={strategy} onValueChange={(v) => setStrategy(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bypass">Bypass (UTILITY + marketing nas variáveis)</SelectItem>
                  <SelectItem value="utility">Utility (transacional)</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Quantidade</Label>
              <Input type="number" min={1} max={5} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>URL do botão</Label>
              <Input value={primaryUrl} onChange={(e) => setPrimaryUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <Button onClick={generate} disabled={generating} className="w-full gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Gerar
          </Button>

          {results.map((t, idx) => (
            <Card key={idx} className="border-blue-500/30">
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{t.name}</p>
                  <Badge variant="outline">{t.category || 'UTILITY'}</Badge>
                </div>
                <p className="text-sm bg-muted/40 rounded p-2 whitespace-pre-wrap">{t.content}</p>
                {t.strategy === 'bypass' && (
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded border border-border p-2">
                      <p className="font-semibold text-muted-foreground mb-1">Meta vê (sample)</p>
                      {Object.entries(t.sample_variables || {}).map(([k, v]) => (
                        <p key={k}>{`{{${k}}}`}: {String(v)}</p>
                      ))}
                    </div>
                    <div className="rounded border border-blue-500/30 p-2">
                      <p className="font-semibold text-blue-600 mb-1">Cliente recebe (marketing)</p>
                      {Object.entries(t.marketing_variables || {}).map(([k, v]) => (
                        <p key={k}>{`{{${k}}}`}: {String(v)}</p>
                      ))}
                    </div>
                  </div>
                )}
                <Button size="sm" variant="outline" className="gap-2" disabled={creatingIdx === idx} onClick={() => createOnMeta(t, idx)}>
                  {creatingIdx === idx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar para a Meta
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────── ABA WEBINÁRIO (preset) ───────────────────────
function WebinarTab() {
  const navigate = useNavigate();
  const { instances } = useWhatsAppOfficialInstances();
  const { templates } = useWhatsAppOfficialTemplates();
  const [form, setForm] = useState({
    funnelName: 'Webinário Articulabem',
    officialInstanceId: '',
    conviteTemplate: '',
    checkoutTemplate: '',
    webinarUrl: '',
    checkoutUrl: '',
    followUps: '7',
    sendTime: '18:00',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ funnelId: string; flowAId: string; flowBId: string } | null>(null);

  const run = async () => {
    if (!form.officialInstanceId || !form.conviteTemplate || !form.checkoutTemplate || !form.webinarUrl || !form.checkoutUrl) {
      toast.error('Preencha a instância, os 2 templates e os links do webinário e do checkout.');
      return;
    }
    setBusy(true);
    try {
      const res = await createWebinarPreset({
        funnelName: form.funnelName,
        officialInstanceId: form.officialInstanceId,
        conviteTemplate: form.conviteTemplate,
        checkoutTemplate: form.checkoutTemplate,
        webinarUrl: form.webinarUrl,
        checkoutUrl: form.checkoutUrl,
        followUps: Math.min(Math.max(parseInt(form.followUps, 10) || 7, 1), 14),
        sendTime: form.sendTime || '18:00',
      });
      setCreated(res);
      toast.success('Funil de Webinário criado! Revise os fluxos e ative.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Criar Funil de Webinário (API Oficial)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Monta 2 fluxos prontos: <b>Não assistiu</b> (manda o link {form.followUps}x, 1x/dia) e <b>Assistiu</b> (manda o checkout e sai da sequência).
            Os leads do Articulabem entram via <b>Bulk Enroll</b> no fluxo "Não assistiu".
          </p>

          <div className="space-y-1">
            <Label>Nome do funil</Label>
            <Input value={form.funnelName} onChange={(e) => set('funnelName', e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Instância (API Oficial)</Label>
            <Select value={form.officialInstanceId} onValueChange={(v) => set('officialInstanceId', v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar instância..." /></SelectTrigger>
              <SelectContent>
                {instances.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.display_name || i.instance_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Template do convite</Label>
              <Select value={form.conviteTemplate} onValueChange={(v) => set('conviteTemplate', v)}>
                <SelectTrigger><SelectValue placeholder="Convite diário..." /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.name}>{t.name} · {t.status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Template do checkout</Label>
              <Select value={form.checkoutTemplate} onValueChange={(v) => set('checkoutTemplate', v)}>
                <SelectTrigger><SelectValue placeholder="Pós-assistiu..." /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.name}>{t.name} · {t.status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Link do webinário (sala/replay)</Label>
            <Input value={form.webinarUrl} onChange={(e) => set('webinarUrl', e.target.value)} placeholder="https://..." />
            <p className="text-[10px] text-muted-foreground">Vira um link rastreável por lead — clicar = considerado "assistiu".</p>
          </div>
          <div className="space-y-1">
            <Label>Link do checkout</Label>
            <Input value={form.checkoutUrl} onChange={(e) => set('checkoutUrl', e.target.value)} placeholder="https://..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nº de follow-ups</Label>
              <Input type="number" min={1} max={14} value={form.followUps} onChange={(e) => set('followUps', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Horário de envio</Label>
              <Input value={form.sendTime} onChange={(e) => set('sendTime', e.target.value)} placeholder="18:00" />
            </div>
          </div>

          <Button onClick={run} disabled={busy} className="w-full gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Criar Funil de Webinário
          </Button>

          {created && (
            <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
              <p className="text-xs font-medium">Criado! Revise e ative os fluxos:</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => navigate(`/ferramentas/automacoes/${created.flowAId}`)}>Abrir "Não assistiu"</Button>
                <Button size="sm" variant="outline" onClick={() => navigate(`/ferramentas/automacoes/${created.flowBId}`)}>Abrir "Assistiu"</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function WhatsAppOficial() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-blue-500" />
        <h1 className="text-xl font-semibold">WhatsApp API Oficial</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Conecte números via Meta Cloud API e gerencie templates (incluindo o gerador com bypass).
      </p>
      <Tabs defaultValue="instancias">
        <TabsList>
          <TabsTrigger value="instancias">Instâncias</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="webinario">Webinário</TabsTrigger>
        </TabsList>
        <TabsContent value="instancias" className="mt-4"><InstancesTab /></TabsContent>
        <TabsContent value="templates" className="mt-4"><TemplatesTab /></TabsContent>
        <TabsContent value="webinario" className="mt-4"><WebinarTab /></TabsContent>
      </Tabs>
    </div>
  );
}
