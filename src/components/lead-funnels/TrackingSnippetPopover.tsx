import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Code, Copy, Check, Loader2, CircleCheck, CircleX, Search, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface TrackingSnippetPopoverProps {
  funnelId: string;
  stageId: string;
  stageName: string;
  pageUrl: string;
}

const ENDPOINT = 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1/track-event';
const TRACKER_SRC = 'https://metric-streamer.lovable.app/tracking/tracker.js?v=1.2';

interface SnippetChecks {
  found: boolean;
  endpoint_ok: boolean;
  stage_ok: boolean;
  funnel_ok: boolean;
  in_head: boolean;
}

const TrackingSnippetPopover: React.FC<TrackingSnippetPopoverProps> = ({
  funnelId,
  stageId,
  stageName,
  pageUrl,
}) => {
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | 'no_events' | null>(null);
  const [eventCount, setEventCount] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<SnippetChecks | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const snippet = `<script src="${TRACKER_SRC}"
        data-endpoint="${ENDPOINT}"
        data-funnel-id="${funnelId}"
        data-stage-id="${stageId}"
        defer></script>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success('Snippet copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Erro ao copiar');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setEventCount(null);
    try {
      const { data, error, count } = await (supabase as any)
        .from('clicks')
        .select('id', { count: 'exact', head: false })
        .eq('stage_id', stageId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('[TrackingTest] Query error:', error);
        setTestResult('error');
        toast.error(`Erro ao consultar: ${error.message}`);
        return;
      }

      const total = count ?? 0;
      setEventCount(total);

      if (total > 0) {
        setTestResult('success');
        toast.success(`Tracking ativo! ${total} evento${total > 1 ? 's' : ''} registrado${total > 1 ? 's' : ''}.`);
      } else {
        setTestResult('no_events');
        toast.info('Nenhum evento encontrado ainda. Acesse a página com o snippet instalado para gerar o primeiro pageview.');
      }
    } catch {
      setTestResult('error');
      toast.error('Não foi possível verificar os eventos');
    } finally {
      setTesting(false);
    }
  };

  const handleVerifyInstallation = async () => {
    if (!pageUrl) {
      toast.warning('Configure a URL da página nesta etapa antes de verificar.');
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    setVerifyError(null);
    try {
      const { data, error } = await supabase.functions.invoke('verify-tracking-snippet', {
        body: { url: pageUrl, funnel_id: funnelId, stage_id: stageId },
      });

      if (error) {
        setVerifyError('Erro ao chamar verificação');
        toast.error('Erro ao verificar instalação');
        return;
      }

      if (data.error === 'page_unreachable') {
        setVerifyError('Página inacessível — verifique a URL');
        toast.error('Não foi possível acessar a página');
        return;
      }

      if (data.checks) {
        setVerifyResult(data.checks);
        if (data.checks.found && data.checks.endpoint_ok && data.checks.stage_ok) {
          toast.success('Snippet instalado corretamente!');
        } else if (!data.checks.found) {
          toast.warning('Snippet não encontrado na página');
        } else {
          toast.warning('Snippet encontrado, mas com problemas');
        }
      }
    } catch {
      setVerifyError('Falha na verificação');
      toast.error('Erro inesperado');
    } finally {
      setVerifying(false);
    }
  };

  const CheckItem = ({ ok, label, warn }: { ok: boolean; label: string; warn?: boolean }) => (
    <div className="flex items-center gap-1.5 text-xs">
      {ok ? (
        <CircleCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
      ) : warn ? (
        <CircleX className="h-3.5 w-3.5 text-amber-500 shrink-0" />
      ) : (
        <CircleX className="h-3.5 w-3.5 text-destructive shrink-0" />
      )}
      <span className={ok ? 'text-emerald-600' : warn ? 'text-amber-600' : 'text-destructive'}>
        {label}
      </span>
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="shrink-0" title="Snippet de tracking">
          <Code className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px]" side="top" align="end">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm text-foreground mb-1">
              Tracking — {stageName}
            </h4>
            <p className="text-xs text-muted-foreground">
              Cole este snippet no <code className="bg-muted px-1 rounded">&lt;head&gt;</code> da página:
            </p>
          </div>

          <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono text-foreground">
            {snippet}
          </pre>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>

            <Button variant="outline" size="sm" onClick={handleTest} disabled={testing} className="gap-1.5">
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : testResult === 'success' ? (
                <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
              ) : testResult === 'error' ? (
                <CircleX className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              Verificar eventos
            </Button>

            {pageUrl && (
              <Button variant="outline" size="sm" onClick={handleVerifyInstallation} disabled={verifying} className="gap-1.5">
                {verifying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Globe className="h-3.5 w-3.5" />
                )}
                Verificar instalação
              </Button>
            )}
          </div>

          {/* Event check results */}
          {testResult === 'success' && eventCount !== null && (
            <span className="text-xs text-emerald-500 font-medium block">
              ✅ {eventCount} evento{eventCount > 1 ? 's' : ''} encontrado{eventCount > 1 ? 's' : ''}
            </span>
          )}
          {testResult === 'no_events' && (
            <span className="text-xs text-amber-500 font-medium block">
              ⚠️ Nenhum evento ainda — acesse a página para gerar
            </span>
          )}
          {testResult === 'error' && (
            <span className="text-xs text-destructive font-medium block">❌ Erro na verificação</span>
          )}

          {/* Installation verification results */}
          {verifyError && (
            <div className="bg-destructive/10 rounded-md p-2 text-xs text-destructive font-medium">
              ❌ {verifyError}
            </div>
          )}

          {verifyResult && (
            <div className="bg-muted rounded-md p-2.5 space-y-1.5">
              <p className="text-xs font-medium text-foreground mb-1">Diagnóstico da página:</p>
              <CheckItem ok={verifyResult.found} label="Snippet tracker.js encontrado" />
              <CheckItem ok={verifyResult.endpoint_ok} label="Endpoint correto" />
              <CheckItem ok={verifyResult.stage_ok} label="Stage ID correto" />
              <CheckItem ok={verifyResult.funnel_ok} label="Funnel ID correto" />
              <CheckItem ok={verifyResult.in_head} label="Snippet no <head>" warn={!verifyResult.in_head && verifyResult.found} />
            </div>
          )}

          {!pageUrl && (
            <p className="text-xs text-amber-500">
              ⚠️ Configure a URL da página nesta etapa para habilitar a verificação de instalação.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TrackingSnippetPopover;
