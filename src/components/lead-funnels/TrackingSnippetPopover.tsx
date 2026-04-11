import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Code, Copy, Check, Loader2, CircleCheck, CircleX } from 'lucide-react';
import { toast } from 'sonner';

interface TrackingSnippetPopoverProps {
  funnelId: string;
  stageId: string;
  stageName: string;
  pageUrl: string;
}

const ENDPOINT = 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1/track-event';
const TRACKER_SRC = 'https://metric-streamer.lovable.app/tracking/tracker.js';

const TrackingSnippetPopover: React.FC<TrackingSnippetPopoverProps> = ({
  funnelId,
  stageId,
  stageName,
  pageUrl,
}) => {
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

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
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor_id: crypto.randomUUID(),
          event: 'tracking_test',
          funnel_id: funnelId,
          stage_id: stageId,
          page_url: pageUrl,
          timestamp: new Date().toISOString(),
        }),
      });
      setTestResult(res.ok ? 'success' : 'error');
      if (res.ok) {
        toast.success('Tracking funcionando!');
      } else {
        toast.error(`Erro: ${res.status}`);
      }
    } catch {
      setTestResult('error');
      toast.error('Não foi possível conectar ao endpoint');
    } finally {
      setTesting(false);
    }
  };

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

          <div className="flex items-center gap-2">
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
              ) : null}
              Testar
            </Button>

            {testResult === 'success' && (
              <span className="text-xs text-emerald-500 font-medium">✅ Funcionando</span>
            )}
            {testResult === 'error' && (
              <span className="text-xs text-destructive font-medium">❌ Falhou</span>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TrackingSnippetPopover;
