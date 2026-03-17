import React, { useState } from 'react';
import { Copy, Info } from 'lucide-react';
import { toast } from 'sonner';

const BASE_URL = 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1';

type Platform = 'guru' | 'ticto' | 'eduzz';

const PLATFORMS: { key: Platform; label: string; icon: string }[] = [
  { key: 'guru',  label: 'Guru',  icon: '🟣' },
  { key: 'ticto', label: 'Ticto', icon: '🟢' },
  { key: 'eduzz', label: 'Eduzz', icon: '🔵' },
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
