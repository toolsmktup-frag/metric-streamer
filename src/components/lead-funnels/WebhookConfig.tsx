import React, { useState } from 'react';
import { Copy, Check, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LeadFunnel } from '@/types/leadFunnels';

interface WebhookConfigProps {
  funnel: LeadFunnel;
}

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmJvY3BtcGh0ZnRxY2V6YWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODc4ODAsImV4cCI6MjA4ODU2Mzg4MH0.EpE1RwQhmk4C9YFdVjnJXp__cI8LPiic5dMqIMP1g8M";

const WebhookConfig: React.FC<WebhookConfigProps> = ({ funnel }) => {
  const [copied, setCopied] = useState<string | null>(null);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL || 'https://emfbocpmphtftqcezaib.supabase.co'}/functions/v1/webhook-lead`;

  const examplePayload = JSON.stringify(
    {
      event: 'signup',
      phone: '+5511999999999',
      email: 'lead@example.com',
      name: 'João Silva',
      utm_source: 'instagram',
      utm_medium: 'cpc',
      utm_campaign: 'lancamento-2026',
      metadata: { form_id: 'abc123' },
    },
    null,
    2
  );

  const curlExample = `curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "apikey: ${SUPABASE_ANON_KEY}" \\
  -H "X-Funnel-Token: ${funnel.webhook_token}" \\
  -d '${JSON.stringify({
    event: 'signup',
    phone: '+5511999999999',
    name: 'João Silva',
  })}'`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const CopyBtn = ({ text, label }: { text: string; label: string }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => copyToClipboard(text, label)}
      className="h-7 px-2"
    >
      {copied === label ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      {/* URL */}
      <div>
        <label className="text-sm font-semibold text-foreground">Webhook URL</label>
        <div className="mt-1 flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <code className="text-sm text-foreground flex-1 break-all">{webhookUrl}</code>
          <CopyBtn text={webhookUrl} label="url" />
        </div>
      </div>

      {/* API Key */}
      <div>
        <label className="text-sm font-semibold text-foreground">API Key (Header obrigatório)</label>
        <div className="mt-1 flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <code className="text-sm text-foreground flex-1 font-mono break-all">
            apikey: {SUPABASE_ANON_KEY}
          </code>
          <CopyBtn text={SUPABASE_ANON_KEY} label="apikey" />
        </div>
      </div>

      {/* Token */}
      <div>
        <label className="text-sm font-semibold text-foreground">Funnel Token (Header)</label>
        <div className="mt-1 flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <code className="text-sm text-foreground flex-1 font-mono break-all">
            X-Funnel-Token: {funnel.webhook_token}
          </code>
          <CopyBtn text={funnel.webhook_token} label="token" />
        </div>
      </div>

      {/* Example Payload */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Code className="h-4 w-4" /> Payload de Exemplo (JSON)
          </label>
          <CopyBtn text={examplePayload} label="payload" />
        </div>
        <pre className="mt-1 bg-muted rounded-lg p-3 text-xs overflow-x-auto text-foreground">
          {examplePayload}
        </pre>
      </div>

      {/* cURL */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-foreground">cURL de Teste</label>
          <CopyBtn text={curlExample} label="curl" />
        </div>
        <pre className="mt-1 bg-muted rounded-lg p-3 text-xs overflow-x-auto text-foreground whitespace-pre-wrap">
          {curlExample}
        </pre>
      </div>

      <div className="bg-accent/50 border border-border rounded-lg p-4">
        <h4 className="text-sm font-semibold text-foreground mb-2">Como integrar</h4>
        <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Copie a URL, a API Key e o Funnel Token acima</li>
          <li>No n8n/Zapier/Typebot, configure um HTTP POST para a URL</li>
          <li>Adicione o header <code className="text-foreground">apikey</code> com o valor da API Key</li>
          <li>Adicione o header <code className="text-foreground">X-Funnel-Token</code> com o valor do token</li>
          <li>Envie o body JSON com o campo <code className="text-foreground">event</code> + <code className="text-foreground">phone</code> ou <code className="text-foreground">email</code></li>
          <li>O lead será criado/atualizado automaticamente e movido conforme as regras de transição</li>
        </ol>
      </div>
    </div>
  );
};

export default WebhookConfig;
