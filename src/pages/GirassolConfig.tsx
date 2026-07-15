import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useCurrentUserRole } from '@/hooks/useCurrentUserRole';
import {
  useGirassolConfig, useGirassolVersions, useSaveGirassolDraft, usePublishGirassol,
  type GirassolVersion,
} from '@/hooks/useGirassolConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Flower2, FileText, SlidersHorizontal, History, Loader2, Save, Rocket, RotateCcw, Eye } from 'lucide-react';

export default function GirassolConfig() {
  const { data: role, isLoading: roleLoading } = useCurrentUserRole();
  const { data: cfg, isLoading } = useGirassolConfig();
  const { data: versions } = useGirassolVersions();
  const saveDraft = useSaveGirassolDraft();
  const publish = usePublishGirassol();

  const [content, setContent] = useState('');
  const [strikeLimit, setStrikeLimit] = useState(3);
  const [humanPause, setHumanPause] = useState(30);
  const [pauseHours, setPauseHours] = useState(6);
  const [publishOpen, setPublishOpen] = useState(false);
  const [note, setNote] = useState('');
  const [viewing, setViewing] = useState<GirassolVersion | null>(null);

  useEffect(() => {
    if (cfg) {
      setContent(cfg.draft_prompt ?? cfg.system_prompt ?? '');
      setStrikeLimit(cfg.strike_limit);
      setHumanPause(cfg.human_pause_minutes);
      setPauseHours(cfg.pause_hours);
    }
  }, [cfg]);

  if (roleLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (role !== 'admin' && role !== 'gestor') {
    return <Navigate to="/leads/dashboard" replace />;
  }

  const hasDraft = !!cfg && content !== cfg.system_prompt;

  const doPublish = () => {
    publish.mutate(
      { prompt: content, strike_limit: strikeLimit, human_pause_minutes: humanPause, pause_hours: pauseHours, note },
      { onSuccess: () => { setPublishOpen(false); setNote(''); } },
    );
  };

  const restore = (v: GirassolVersion) => {
    setContent(v.system_prompt);
    setViewing(null);
    setNote(`Restaurada da versão ${v.version}`);
    setPublishOpen(true);
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-2">
        <Flower2 className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Agente Girassol</h1>
        {cfg && (
          <Badge variant="secondary" className="ml-2">
            v{cfg.active_version} no ar
          </Badge>
        )}
        {hasDraft && <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">rascunho não publicado</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        Este é o cérebro do atendimento automático do WhatsApp (nº 48 9916-1174) — persona, regras de venda,
        suporte, retenção e anti-fraude. <strong>Editar aqui não muda nada</strong> até clicar em <strong>Publicar</strong>;
        aí o agente aplica sozinho em até 1 minuto, sem reiniciar nada.
      </p>

      <Tabs defaultValue="prompt" className="space-y-4">
        <TabsList>
          <TabsTrigger value="prompt" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Cérebro (prompt)</TabsTrigger>
          <TabsTrigger value="regras" className="gap-1.5"><SlidersHorizontal className="h-3.5 w-3.5" /> Regras numéricas</TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5"><History className="h-3.5 w-3.5" /> Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="prompt">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Instruções completas (Markdown)</CardTitle>
              <CardDescription>
                É o texto que o agente lê antes de cada conversa. Cuidado com as seções de
                anti-fraude e retenção — mudanças ali afetam dinheiro.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="h-96 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="font-mono text-sm min-h-[520px]"
                />
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {content.length} caracteres
                  {cfg && (
                    <> · v{cfg.active_version} publicada por {cfg.published_by_name || '—'} em {new Date(cfg.published_at).toLocaleString('pt-BR')}</>
                  )}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={saveDraft.isPending || !hasDraft}
                    onClick={() => saveDraft.mutate(content)}
                    className="gap-1.5"
                  >
                    {saveDraft.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Salvar rascunho
                  </Button>
                  <Button disabled={!hasDraft && !cfg?.draft_prompt} onClick={() => setPublishOpen(true)} className="gap-1.5">
                    <Rocket className="h-3.5 w-3.5" /> Publicar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regras">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Regras numéricas</CardTitle>
              <CardDescription>Publicam junto com o prompt (mesmo botão Publicar).</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Strikes até bloquear (anti-fraude)</label>
                <Input type="number" min={1} max={10} value={strikeLimit} onChange={(e) => setStrikeLimit(Number(e.target.value))} />
                <p className="mt-1 text-[11px] text-muted-foreground">Tentativas claras de golpe até o contato ser bloqueado e marcado.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Pausa quando humano responde (min)</label>
                <Input type="number" min={5} max={1440} value={humanPause} onChange={(e) => setHumanPause(Number(e.target.value))} />
                <p className="mt-1 text-[11px] text-muted-foreground">Alguém do time respondeu pelo número → bot silencia por este tempo.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Pausa pós-transferência (horas)</label>
                <Input type="number" min={1} max={72} value={pauseHours} onChange={(e) => setPauseHours(Number(e.target.value))} />
                <p className="mt-1 text-[11px] text-muted-foreground">Depois de abrir ticket humano, o bot não responde este contato pelo período.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Versões publicadas</CardTitle>
              <CardDescription>Restaurar abre o Publicar com o conteúdo antigo — o histórico nunca é apagado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(versions || []).map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                  <Badge variant={v.version === cfg?.active_version ? 'default' : 'secondary'}>v{v.version}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{v.note || 'Sem descrição'}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.created_by_name || '—'} · {new Date(v.created_at).toLocaleString('pt-BR')} · {v.system_prompt.length} chars
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1" onClick={() => setViewing(v)}>
                    <Eye className="h-3.5 w-3.5" /> Ver
                  </Button>
                  {v.version !== cfg?.active_version && (
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => restore(v)}>
                      <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                    </Button>
                  )}
                </div>
              ))}
              {(versions || []).length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma versão ainda.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Publicar */}
      <Dialog open={publishOpen} onOpenChange={(o) => !o && setPublishOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" /> Publicar nova versão</DialogTitle>
            <DialogDescription>
              O Girassol está <strong>em produção</strong> atendendo clientes reais. Ao publicar,
              a versão v{(cfg?.active_version || 0) + 1} entra no ar em até 1 minuto para as próximas conversas.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">O que mudou? (aparece no histórico)</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex.: nova regra de reembolso do Retiro" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPublishOpen(false)}>Cancelar</Button>
            <Button onClick={doPublish} disabled={publish.isPending} className="gap-1.5">
              {publish.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              Publicar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ver versão */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Versão {viewing?.version} — {viewing?.created_by_name || '—'}</DialogTitle>
            <DialogDescription>{viewing?.note || 'Sem descrição'} · {viewing && new Date(viewing.created_at).toLocaleString('pt-BR')}</DialogDescription>
          </DialogHeader>
          <pre className="text-xs font-mono whitespace-pre-wrap overflow-y-auto max-h-[60vh] rounded-lg border border-border p-3 bg-muted/30">
            {viewing?.system_prompt}
          </pre>
          <DialogFooter>
            {viewing && viewing.version !== cfg?.active_version && (
              <Button variant="outline" className="gap-1" onClick={() => restore(viewing)}>
                <RotateCcw className="h-3.5 w-3.5" /> Restaurar esta versão
              </Button>
            )}
            <Button variant="ghost" onClick={() => setViewing(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
