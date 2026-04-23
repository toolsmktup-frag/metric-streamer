import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Sparkles, Brain, Shield, MessageSquareQuote, Copy, ArrowDown, Square, Loader2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSalesCopilot, type CopilotAction } from '@/hooks/useSalesCopilot';
import { useActiveSalesScript } from '@/hooks/useSalesScripts';
import { useCurrentUserRole } from '@/hooks/useCurrentUserRole';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  phone: string | null;
  instanceId: string | null;
  onUseInInput?: (text: string) => void;
}

const ACTION_LABELS: Record<CopilotAction, { label: string; icon: any; hint: string }> = {
  suggest: { label: 'Sugerir resposta', icon: Sparkles, hint: 'Gera 2-3 variações alinhadas ao script.' },
  analyze: { label: 'Analisar', icon: Brain, hint: 'Temperatura, objeções e próximo passo (modelo mais profundo).' },
  objection: { label: 'Objeção', icon: Shield, hint: 'Cole a objeção e receba contornos.' },
  ask: { label: 'Perguntar', icon: MessageSquareQuote, hint: 'Pergunta livre sobre o cliente.' },
};

export default function SalesCopilotPanel({ open, onClose, phone, instanceId, onUseInInput }: Props) {
  const [tab, setTab] = useState<CopilotAction>('suggest');
  const [customQuestion, setCustomQuestion] = useState('');
  const { run, cancel, output, isStreaming, reset } = useSalesCopilot();
  const { data: script } = useActiveSalesScript();
  const { data: role } = useCurrentUserRole();
  const navigate = useNavigate();

  if (!open) return null;

  const canEditScript = role === 'admin' || role === 'gestor';

  const handleRun = (action: CopilotAction) => {
    if (!phone || !instanceId) {
      toast.error('Selecione uma conversa primeiro');
      return;
    }
    if ((action === 'objection' || action === 'ask') && !customQuestion.trim()) {
      toast.error(action === 'objection' ? 'Cole a objeção do cliente' : 'Escreva sua pergunta');
      return;
    }
    setTab(action);
    run({
      action,
      phone,
      instance_id: instanceId,
      custom_question: action === 'objection' || action === 'ask' ? customQuestion.trim() : undefined,
    });
  };

  const copyAll = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    toast.success('Copiado');
  };

  const sendToInput = () => {
    if (!output || !onUseInInput) return;
    // Try to extract just the most useful chunk: first non-empty paragraph that doesn't look like a heading
    const cleaned = output
      .replace(/^#{1,6}\s.*$/gm, '')
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean)[0] || output;
    onUseInInput(cleaned);
    toast.success('Pré-preenchido no input');
  };

  return (
    <div className="w-[380px] shrink-0 border-l border-border bg-card flex flex-col h-full">
      {/* Header */}
      <div className="h-12 px-3 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Copiloto de Vendas</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col min-h-0">
        {!script?.content && (
          <div className="m-3 p-2 text-xs rounded-md bg-muted text-muted-foreground">
            Nenhum script de vendas configurado.{' '}
            {canEditScript ? (
              <button
                onClick={() => navigate('/configuracoes/copiloto-vendas')}
                className="underline text-primary hover:opacity-80"
              >
                Configurar agora
              </button>
            ) : (
              'Peça pro admin configurar.'
            )}
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as CopilotAction)} className="flex-1 flex flex-col min-h-0 px-3">
          <TabsList className="grid grid-cols-4 h-9 shrink-0">
            {(Object.keys(ACTION_LABELS) as CopilotAction[]).map((k) => {
              const Icon = ACTION_LABELS[k].icon;
              return (
                <TabsTrigger key={k} value={k} className="text-xs px-1 gap-1">
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{ACTION_LABELS[k].label.split(' ')[0]}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {(Object.keys(ACTION_LABELS) as CopilotAction[]).map((k) => (
            <TabsContent key={k} value={k} className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">{ACTION_LABELS[k].hint}</p>
              {(k === 'objection' || k === 'ask') && (
                <Textarea
                  placeholder={
                    k === 'objection'
                      ? 'Ex: "Tô achando caro, vou pensar..."'
                      : 'Ex: "Como respondo se ele perguntar sobre parcelamento?"'
                  }
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
              )}
              <Button
                size="sm"
                className="w-full"
                onClick={() => handleRun(k)}
                disabled={isStreaming || !phone}
              >
                {isStreaming && tab === k ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    {ACTION_LABELS[k].label}
                  </>
                )}
              </Button>
            </TabsContent>
          ))}
        </Tabs>

        {/* Output */}
        <div className="flex-1 min-h-0 flex flex-col mt-2 border-t border-border">
          <div className="px-3 py-2 flex items-center justify-between shrink-0">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Sugestão
            </span>
            <div className="flex items-center gap-1">
              {isStreaming && (
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={cancel}>
                  <Square className="h-3 w-3" /> Parar
                </Button>
              )}
              {output && !isStreaming && (
                <>
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={copyAll} title="Copiar tudo">
                    <Copy className="h-3 w-3" />
                  </Button>
                  {onUseInInput && (
                    <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={sendToInput} title="Usar no input">
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={reset}>
                    Limpar
                  </Button>
                </>
              )}
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="px-3 pb-4">
              {output ? (
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed
                  prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground
                  prose-li:text-foreground prose-code:text-foreground">
                  <ReactMarkdown>{output}</ReactMarkdown>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground italic py-6 text-center">
                  {phone ? 'Escolha uma ação acima' : 'Selecione uma conversa pra começar'}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
