import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Sparkles, Brain, Shield, MessageSquareQuote, Copy, ArrowDown, Square, Loader2, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useSalesCopilot, type CopilotAction, type OfferMode } from '@/hooks/useSalesCopilot';
import { useActiveSalesScript } from '@/hooks/useSalesScripts';
import { useSalesOffers } from '@/hooks/useSalesOffers';
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
  // offerSelection: 'auto' | 'ignore' | <offer_id>
  const [offerSelection, setOfferSelection] = useState<string>('auto');
  const { run, cancel, output, isStreaming, reset } = useSalesCopilot();
  const { data: script } = useActiveSalesScript();
  const { data: offers } = useSalesOffers();
  const { data: role } = useCurrentUserRole();
  const navigate = useNavigate();

  const storageKey = useMemo(
    () => (phone && instanceId ? `copilot-offer-mode:${instanceId}:${phone}` : null),
    [phone, instanceId]
  );

  // Restaura escolha por conversa
  useEffect(() => {
    if (!storageKey) {
      setOfferSelection('auto');
      return;
    }
    const saved = localStorage.getItem(storageKey);
    setOfferSelection(saved || 'auto');
  }, [storageKey]);

  const persistSelection = (value: string) => {
    setOfferSelection(value);
    if (storageKey) localStorage.setItem(storageKey, value);
  };

  const activeOffers = (offers || []).filter((o) => o.status === 'active');
  const selectedOffer = activeOffers.find((o) => o.id === offerSelection);
  const focusBadgeLabel =
    offerSelection === 'ignore'
      ? 'Suporte (sem ofertas)'
      : selectedOffer
        ? `Foco: ${selectedOffer.name}`
        : null;

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
    const offerMode: OfferMode =
      offerSelection === 'auto' ? 'auto' : offerSelection === 'ignore' ? 'ignore' : 'specific';
    run({
      action,
      phone,
      instance_id: instanceId,
      custom_question: action === 'objection' || action === 'ask' ? customQuestion.trim() : undefined,
      offer_mode: offerMode,
      offer_id: offerMode === 'specific' ? offerSelection : undefined,
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
    <>
      {/* Backdrop só em telas estreitas */}
      <div
        className="fixed inset-0 bg-background/40 backdrop-blur-[1px] z-40 lg:hidden"
        onClick={onClose}
      />
      <div
        className="
          fixed right-0 top-0 bottom-0 z-50 w-[92vw] max-w-[420px]
          lg:static lg:w-[380px] lg:z-auto
          shrink-0 border-l border-border bg-card flex flex-col h-full shadow-2xl lg:shadow-none
        "
      >
      {/* Header */}
      <div className="h-12 px-3 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <span className="font-semibold text-sm shrink-0">Copiloto</span>
          {focusBadgeLabel && (
            <Badge variant="secondary" className="h-5 text-[10px] px-1.5 gap-1 truncate max-w-[180px]">
              <Target className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{focusBadgeLabel}</span>
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
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

        {/* Foco da oferta */}
        <div className="px-3 pt-2 pb-1 shrink-0">
          <div className="flex items-center gap-2">
            <Target className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Foco da oferta
            </span>
          </div>
          <Select value={offerSelection} onValueChange={persistSelection}>
            <SelectTrigger className="h-8 mt-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto" className="text-xs">
                Automático (IA decide)
              </SelectItem>
              <SelectItem value="ignore" className="text-xs">
                Ignorar ofertas (suporte/pós-venda)
              </SelectItem>
              {activeOffers.length > 0 && (
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Forçar oferta específica
                </div>
              )}
              {activeOffers.map((o) => (
                <SelectItem key={o.id} value={o.id} className="text-xs">
                  {o.is_featured ? '⭐ ' : ''}{o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {offerSelection !== 'auto' && (
            <button
              onClick={() => persistSelection('auto')}
              className="text-[10px] text-muted-foreground hover:text-foreground mt-1 underline"
            >
              voltar pro automático
            </button>
          )}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as CopilotAction)} className="flex flex-col px-3 shrink-0">
          <TabsList className="grid grid-cols-4 h-9 shrink-0">
            {(Object.keys(ACTION_LABELS) as CopilotAction[]).map((k) => {
              const Icon = ACTION_LABELS[k].icon;
              return (
                <TabsTrigger key={k} value={k} className="text-[11px] px-1 gap-1 data-[state=active]:font-semibold">
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{ACTION_LABELS[k].label.split(' ')[0]}</span>
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
    </>
  );
}
