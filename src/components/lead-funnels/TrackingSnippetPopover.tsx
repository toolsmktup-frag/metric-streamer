import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Code, Copy, Check, Loader2, CircleCheck, CircleX, Search } from 'lucide-react';
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
      // Query real events from clicks table for this stage_id
      const { data, error, count } = await supabase
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

            {testResult === 'success' && eventCount !== null && (
              <span className="text-xs text-emerald-500 font-medium">
                ✅ {eventCount} evento{eventCount > 1 ? 's' : ''} encontrado{eventCount > 1 ? 's' : ''}
              </span>
            )}
            {testResult === 'no_events' && (
              <span className="text-xs text-amber-500 font-medium">
                ⚠️ Nenhum evento ainda — acesse a página para gerar
              </span>
            )}
            {testResult === 'error' && (
              <span className="text-xs text-destructive font-medium">❌ Erro na verificação</span>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TrackingSnippetPopover;
