import React, { useState } from 'react';
import { Copy, Info, RefreshCw, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSyncMeta, useMetaSyncStatus } from '@/hooks/useMetaData';

const BASE_URL = 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1';

type Platform = 'guru' | 'ticto' | 'eduzz' | 'youshop';

const PLATFORMS: { key: Platform; label: string; icon: string }[] = [
  { key: 'guru',  label: 'Guru',  icon: '🟣' },
  { key: 'ticto', label: 'Ticto', icon: '🟢' },
  { key: 'eduzz', label: 'Eduzz', icon: '🔵' },
  { key: 'youshop', label: 'YouShop', icon: '🟡' },
];

const PLATFORM_INFO: Record<Platform, {
  hasWebhook: boolean;
  endpoint?: string;
  globalNote: string;
  funnelNote?: string;
  setupSteps: string[];
}> = {
  guru: {
    hasWebhook: true,
    endpoint: 'guru-webhook',
    globalNote: 'Sem token → venda vai para o Resumo Geral sem vínculo de funil.',
    funnelNote: 'Para vincular a um funil específico, adicione ?token=TOKEN_DO_FUNIL (configurado em Funis → Configurar).',
    setupSteps: [
      'Acesse o produto no painel da Guru',
      'Vá em Configurações → Integrações → Webhook',
      'Cole a URL abaixo no campo de webhook',
      'Salve e faça um teste de ping — a venda aparece automaticamente no Resumo Geral',
    ],
  },
  ticto: {
    hasWebhook: true,
    endpoint: 'ticto-webhook',
    globalNote: 'Sem token → venda vai para o Resumo Geral sem vínculo de funil.',
    funnelNote: 'Para vincular a um funil específico, adicione ?token=TOKEN_DO_FUNIL (configurado em Funis → Configurar).',
    setupSteps: [
      'Acesse o produto no painel da Ticto',
      'Vá em Configurações → Postback / Webhook',
      'Cole a URL abaixo e selecione os eventos: Venda Aprovada, Reembolso, Chargeback',
      'Salve — as próximas vendas aparecem automaticamente no Resumo Geral',
    ],
  },
  eduzz: {
    hasWebhook: true,
    endpoint: 'eduzz-webhook',
    globalNote: 'Sem token → venda vai para o Resumo Geral sem vínculo de funil.',
    funnelNote: 'Para vincular a um funil específico, adicione ?token=TOKEN_DO_FUNIL (configurado em Funis → Configurar).',
    setupSteps: [
      'Acesse o produto no painel da Eduzz',
      'Vá em Configurações → Postback / Webhook de Vendas',
      'Cole a URL abaixo e selecione os eventos: Venda Aprovada, Reembolso, Chargeback',
      'Salve — as próximas vendas aparecem automaticamente no Resumo Geral',
      'Para dados históricos, use também Importar Dados → Eduzz (CSV)',
    ],
  },
  youshop: {
    hasWebhook: true,
    endpoint: 'youshop-webhook',
    globalNote: 'A YouShop exige o token do funil na URL: sem ?token=... o webhook é rejeitado (401). Gere o token em Funis → Configurar → Plataformas → YouShop.',
    funnelNote: 'Use sempre a URL com ?token=TOKEN_DO_FUNIL (Funis → Configurar). Um webhook por funil.',
    setupSteps: [
      'No painel da YouShop, vá em Ferramentas → Webhooks → "Novo webhook"',
      'Formato do Webhook: YouShop · Tipo de webhook: Produto',
      'URL: cole a URL do funil com ?token=... (Funis → Configurar → Plataformas)',
      'Produtos: selecione os produtos do funil (ou "Enviar para todos produtos")',
      'Eventos: Pedido → Pix Gerado, Pix Pago, Boleto Gerado, Boleto Pago, Cartão de Crédito Pago, Pago (todos), Cancelado · Jornada → Carrinho Abandonado',
      'Opções: deixe ligados "nome", "telefone" e "e-mail" do cliente',
      'Salve e use "Testar Webhook" — o payload fica registrado em webhook_audit (source = youshop) para conferência',
    ],
  },
};

function CopyField({ value }: { value: string }) {
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono text-foreground"
      />
      <button
        onClick={() => { navigator.clipboard.writeText(value); toast.success('URL copiada!'); }}
        className="rounded-lg border border-border px-3 py-2 hover:bg-muted transition-colors"
        title="Copiar"
      >
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
}

function MetaSyncCard() {
  const syncMeta = useSyncMeta();
  const { data: syncStatus } = useMetaSyncStatus();
  const isRunning = syncStatus?.status === 'running' &&
    !!syncStatus?.started_at &&
    (Date.now() - new Date(syncStatus.started_at).getTime()) < 5 * 60 * 1000;
  const isSyncing = syncMeta.isPending || isRunning;

  const handleSync = (fullSync: boolean) => {
    toast.info(fullSync ? 'Sincronização completa (30 dias) iniciada...' : 'Sincronizando hoje + ontem...');
    syncMeta.mutate({ full_sync: fullSync }, {
      onSuccess: (data: any) => {
        if (data?.records_synced > 0) toast.success(`Sync OK! ${data.records_synced} registros`);
        else toast.warning('Sync concluído mas nenhum registro retornado. Veja o status abaixo.');
      },
      onError: (err: any) => toast.error(`Erro no sync: ${err.message}`),
    });
  };

  const lastFinished = syncStatus?.finished_at ? new Date(syncStatus.finished_at) : null;
  const status = syncStatus?.status;

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <span>🔵</span> Meta Ads (Facebook / Instagram)
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Sincroniza campanhas, conjuntos, anúncios e métricas das suas contas conectadas.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => handleSync(false)}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar agora'}
          </button>
          <button
            onClick={() => handleSync(true)}
            disabled={isSyncing}
            title="Últimos 30 dias completos"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card text-muted-foreground px-3 py-2 text-xs font-medium hover:text-foreground disabled:opacity-50"
          >
            30d
          </button>
        </div>
      </div>

      {syncStatus && (
        <div className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${
          status === 'failed' ? 'border-destructive/40 bg-destructive/5 text-destructive' :
          status === 'running' ? 'border-border bg-muted/40 text-muted-foreground' :
          'border-border bg-muted/40 text-muted-foreground'
        }`}>
          {status === 'failed' ? <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> :
           status === 'running' ? <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin" /> :
           <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />}
          <div className="flex-1 min-w-0">
            <div className="font-medium">
              {status === 'failed' && 'Última sincronização falhou'}
              {status === 'running' && 'Sincronização em andamento'}
              {status === 'completed' && `Última sync OK — ${syncStatus.records_synced ?? 0} registros`}
            </div>
            {lastFinished && (
              <div className="text-xs opacity-80 mt-0.5">
                {lastFinished.toLocaleString('pt-BR')}
              </div>
            )}
            {syncStatus.error && (
              <div className="text-xs mt-1 break-words font-mono">
                {syncStatus.error}
              </div>
            )}
            {status === 'failed' && syncStatus.error?.includes('190') && (
              <div className="text-xs mt-2 text-foreground">
                ⚠️ Token Meta expirado. Gere um novo em developers.facebook.com e atualize o secret <code className="font-mono">META_ACCESS_TOKEN</code> no Supabase.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Integracoes() {
  const [platform, setPlatform] = useState<Platform>('guru');
  const info = PLATFORM_INFO[platform];
  const globalUrl = info.endpoint ? `${BASE_URL}/${info.endpoint}` : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure webhooks para receber vendas automaticamente no Resumo Geral
        </p>
      </div>

      <MetaSyncCard />

      {/* Seletor de plataforma */}
      <div className="flex gap-3 flex-wrap">
        {PLATFORMS.map(p => (
          <button
            key={p.key}
            onClick={() => setPlatform(p.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
              platform === p.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            <span>{p.icon}</span>
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* URLs do Webhook */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-5">
          <h3 className="font-semibold text-foreground">
            {info.hasWebhook ? 'URLs do Webhook' : 'Importação via Planilha'}
          </h3>

          {info.hasWebhook && globalUrl ? (
            <div className="space-y-4">
              {/* URL Global */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  URL Global — Resumo Geral (sem funil)
                </label>
                <CopyField value={globalUrl} />
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {info.globalNote}
                </p>
              </div>

              {/* URL com token */}
              {info.funnelNote && (
                <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    URL com Funil (opcional)
                  </p>
                  <code className="block text-xs font-mono text-foreground break-all">
                    {globalUrl}?token=<span className="text-primary">TOKEN_DO_FUNIL</span>
                  </code>
                  <p className="text-xs text-muted-foreground">
                    {info.funnelNote}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">{info.globalNote}</p>
              <a
                href="/importar"
                className="inline-block mt-3 text-sm text-primary hover:underline font-medium"
              >
                Ir para Importar Dados →
              </a>
            </div>
          )}
        </div>

        {/* Passo a passo */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <h3 className="font-semibold text-foreground">Como configurar</h3>
          <ol className="space-y-3">
            {info.setupSteps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Nota sobre funis */}
      {info.hasWebhook && (
        <div className="rounded-lg border border-border bg-card p-4 flex gap-3">
          <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <strong className="text-foreground">Produtos dentro de funis:</strong> configure o webhook
            diretamente na página do funil (Funis → Configurar → aba Webhook). Lá o token já está
            pré-preenchido e a venda é automaticamente atribuída ao funil correto.
          </div>
        </div>
      )}
    </div>
  );
}
