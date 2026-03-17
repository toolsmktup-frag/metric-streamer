import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DateRangePicker from '@/components/dashboard/DateRangePicker';
import { SkeletonCard } from '@/components/dashboard/SkeletonCard';
import {
  Bot, Send, CheckCircle, AlertTriangle, XCircle, Lightbulb,
  Loader2, RefreshCw, Clock, MessageSquare, BarChart3, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface DailyAnalysis {
  successes: string;
  bottlenecks: string;
  alerts: string;
  suggestions: string;
  analysis_date: string;
  created_at: string;
  constraint_of_day?: string;
  ltv_cac_ratio?: string;
}

async function callAiAgent(action: string, messages?: ChatMessage[], observation?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Você precisa estar logado.');

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/ai-agent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ action, messages, observation }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error || 'Erro na chamada da API');
  }
  return res.json();
}

function useTodayAnalysis() {
  const nowBRT = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
  const today = nowBRT.toISOString().split('T')[0];
  return useQuery({
    queryKey: ['daily-analysis', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_analyses')
        .select('*')
        .eq('analysis_date', today)
        .maybeSingle();
      if (error) throw error;
      return data as DailyAnalysis | null;
    },
    staleTime: 60 * 1000,
  });
}

// ─── Chat Tab ───
function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('role, content')
        .order('created_at', { ascending: true });
      if (data && data.length > 0) {
        setMessages(data as ChatMessage[]);
      }
      setHistoryLoaded(true);
    };
    loadHistory();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const saveMessage = async (role: 'user' | 'assistant', content: string) => {
    await supabase.from('chat_messages').insert({ role, content });
  };

  const handleClearHistory = async () => {
    await supabase.from('chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setMessages([]);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: text };
    const newMessages: ChatMessage[] = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    await saveMessage('user', text);
    try {
      const result = await callAiAgent('chat', newMessages);
      const assistantContent = result.response;
      setMessages(prev => [...prev, { role: 'assistant', content: assistantContent }]);
      await saveMessage('assistant', assistantContent);
    } catch (err: any) {
      const errContent = `❌ Erro: ${err.message}`;
      setMessages(prev => [...prev, { role: 'assistant', content: errContent }]);
      await saveMessage('assistant', errContent);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)]">
      {/* Header with clear button */}
      {messages.length > 0 && (
        <div className="flex justify-end pb-2">
          <Button variant="ghost" size="sm" onClick={handleClearHistory} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Limpar histórico
          </Button>
        </div>
      )}
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
            <Bot className="h-12 w-12 opacity-30" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">Olá! Sou seu assistente estratégico.</p>
              <p className="text-xs max-w-md text-center">
                Tenho acesso completo ao seu negócio: tráfego Meta, vendas Guru + Ticto, segmentação RFM de clientes e análise de coortes LTV.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {[
                'Qual meu melhor produto esse mês?',
                'Como está meu ROAS hoje?',
                'Quais clientes devo reativar?',
                'Qual segmento RFM precisa de atenção?',
                'Qual campanha está com CPA mais alto?',
                'Como está o LTV dos clientes novos?',
                'Onde o funil está quebrando?',
                'Qual produto tem mais upsell?',
                'Qual meu ROAS líquido real (após reembolsos)?',
                'Qual é o constraint principal do negócio hoje?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="px-3 py-1.5 rounded-full border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-lg px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analisando dados...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Aviso de limite de histórico */}
      {messages.length >= 25 && (
        <div className="text-xs text-kpi-warning bg-kpi-warning/10 border border-kpi-warning/30 rounded-lg px-3 py-2 mb-2">
          ⚠️ Histórico quase cheio ({messages.length}/30 mensagens). Limpe o histórico para continuar conversando.
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border pt-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Pergunte sobre tráfego, vendas, clientes, RFM, LTV..."
            className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={loading}
          />
          <Button onClick={handleSend} disabled={loading || !input.trim()} size="default">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Analysis Card ───
function AnalysisCard({ icon: Icon, title, content, colorClass }: {
  icon: any; title: string; content: string | null; colorClass: string;
}) {
  return (
    <div className={`rounded-lg border p-4 ${colorClass}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-card">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      {content ? (
        <div className="prose prose-sm max-w-none dark:prose-invert text-sm [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">Gere uma análise para ver os dados aqui.</p>
      )}
    </div>
  );
}

// ─── Daily Analysis Tab ───
function DailyAnalysisTab() {
  const queryClient = useQueryClient();
  const { data: analysis, isLoading } = useTodayAnalysis();
  const [observation, setObservation] = useState('');

  const generateMutation = useMutation({
    mutationFn: () => callAiAgent('daily_analysis', undefined, observation.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-analysis'] });
    },
  });

  const displayData = generateMutation.data?.analysis || analysis;
  const lastUpdate = analysis?.created_at
    ? new Date(analysis.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            {lastUpdate && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Última análise: {lastUpdate}
              </div>
            )}
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando análise...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Gerar Análise
              </>
            )}
          </Button>
        </div>
        <div>
          <textarea
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="Observação opcional: ex. 'Analise apenas os últimos 3 dias', 'Foque na campanha 226', 'Compare desempenho de Pix vs Cartão'..."
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none h-16"
          />
        </div>
      </div>

      {generateMutation.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Erro: {(generateMutation.error as Error).message}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <>
        {/* Constraint do dia + LTV:CAC */}
        {(displayData?.constraint_of_day || displayData?.ltv_cac_ratio) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayData?.constraint_of_day && (
              <div className="rounded-lg border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-900/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-orange-600 dark:text-orange-400 font-bold text-sm uppercase">🎯 Constraint do Dia</span>
                </div>
                <p className="text-sm text-foreground font-medium">{displayData.constraint_of_day}</p>
              </div>
            )}
            {displayData?.ltv_cac_ratio && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-blue-600 dark:text-blue-400 font-bold text-sm uppercase">📊 LTV:CAC Ratio</span>
                </div>
                <p className="text-sm text-foreground font-medium">{displayData.ltv_cac_ratio}</p>
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnalysisCard
            icon={CheckCircle}
            title="✅ O que está funcionando"
            content={displayData?.successes || null}
            colorClass="border-kpi-positive/30 bg-kpi-positive/5"
          />
          <AnalysisCard
            icon={AlertTriangle}
            title="⚠️ Gargalos identificados"
            content={displayData?.bottlenecks || null}
            colorClass="border-kpi-warning/30 bg-kpi-warning/5"
          />
          <AnalysisCard
            icon={XCircle}
            title="🔴 Alertas críticos"
            content={displayData?.alerts || null}
            colorClass="border-destructive/30 bg-destructive/5"
          />
          <AnalysisCard
            icon={Lightbulb}
            title="💡 Sugestões de ação"
            content={displayData?.suggestions || null}
            colorClass="border-primary/30 bg-primary/5"
          />
        </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ───
export default function AgenteIA() {
  const [tab, setTab] = useState<'chat' | 'analysis'>('chat');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agente IA</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Assistente estratégico — tráfego, clientes, LTV, RFM e muito mais</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setTab('chat')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            tab === 'chat'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Chat
        </button>
        <button
          onClick={() => setTab('analysis')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            tab === 'analysis'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Análise Diária
        </button>
      </div>

      {tab === 'chat' ? <ChatTab /> : <DailyAnalysisTab />}
    </div>
  );
}
