import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type CopilotAction = 'suggest' | 'analyze' | 'objection' | 'ask';

interface RunArgs {
  action: CopilotAction;
  phone: string;
  instance_id: string;
  custom_question?: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL || 'https://emfbocpmphtftqcezaib.supabase.co'}/functions/v1/sales-copilot`;

export function useSalesCopilot() {
  const [output, setOutput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const run = useCallback(async (args: RunArgs) => {
    cancel();
    setOutput('');
    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sessão expirada');
        setIsStreaming(false);
        return;
      }

      let resp: Response;
      try {
        resp = await fetch(CHAT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(args),
          signal: controller.signal,
        });
      } catch (netErr: any) {
        if (netErr?.name === 'AbortError') {
          setIsStreaming(false);
          return;
        }
        console.error('[useSalesCopilot] network error:', netErr);
        toast.error('Sem conexão com o copiloto. Tente novamente em alguns segundos.');
        setIsStreaming(false);
        return;
      }

      if (!resp.ok) {
        let msg = 'Erro no copiloto';
        try {
          const err = await resp.json();
          msg = err.error || msg;
        } catch {
          try { msg = (await resp.text()) || msg; } catch {}
        }
        if (resp.status === 429) toast.error('Limite de uso atingido. Aguarde um instante.');
        else if (resp.status === 402) toast.error('Créditos de IA esgotados.');
        else if (resp.status === 401) toast.error('Sessão expirada. Faça login de novo.');
        else if (resp.status === 502) toast.error('Gateway de IA indisponível. Tente de novo.');
        else toast.error(msg);
        setIsStreaming(false);
        return;
      }

      if (!resp.body) {
        toast.error('Sem resposta do servidor');
        setIsStreaming(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let acc = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            streamDone = true;
            break;
          }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              acc += content;
              setOutput(acc);
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              acc += content;
              setOutput(acc);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('[useSalesCopilot] error:', e);
        toast.error(e.message || 'Erro inesperado');
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [cancel]);

  const reset = useCallback(() => {
    setOutput('');
  }, []);

  return { run, cancel, reset, output, isStreaming };
}
