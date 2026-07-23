import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, X } from 'lucide-react';
import ChatThread from '@/components/whatsapp/ChatThread';
import ChatInput from '@/components/whatsapp/ChatInput';
import { useWhatsAppInstances, useWhatsAppMessages, type WhatsAppMessage } from '@/hooks/useWhatsApp';
import { useLeadByPhone } from '@/hooks/useLeadByPhone';
import { brCanonicalPhone } from '@/lib/phone';

interface LeadWhatsAppPreviewProps {
  /** Telefone cru vindo do card (pode estar formatado / com DDI torto) */
  phone: string | null;
  open: boolean;
  onClose: () => void;
  /** Abrir o chat completo em /whatsapp — recebe o telefone canônico */
  onOpenFull: (phone: string) => void;
}

/**
 * Mini pop-up (modal central) disparado pelo ícone de WhatsApp do card do funil.
 * Mostra o preview da conversa (últimas mensagens em TODAS as instâncias que o
 * usuário enxerga) e permite responder ali mesmo, sem sair do funil. Reusa
 * ChatThread + ChatInput da tela cheia; a instância de resposta é a da última
 * mensagem enviada (senão a 1ª conectada), como no WhatsAppChat.
 */
export default function LeadWhatsAppPreview({ phone, open, onClose, onOpenFull }: LeadWhatsAppPreviewProps) {
  const canonical = useMemo(() => (phone ? brCanonicalPhone(phone) : null), [phone]);
  const { instances } = useWhatsAppInstances();
  const { messages, loading } = useWhatsAppMessages(open ? 'all' : null, open ? canonical : null);
  const { data: lead } = useLeadByPhone(open ? canonical : null);

  // --- Mensagem otimista (mesmo padrão do WhatsAppChat) ---
  const [optimisticMessages, setOptimisticMessages] = useState<WhatsAppMessage[]>([]);
  useEffect(() => { if (!open) setOptimisticMessages([]); }, [open, canonical]);

  const mergedMessages = useMemo(() => {
    const realIds = new Set(messages.map(m => m.id));
    const norm = (s: string | null | undefined) => (s || '').trim();
    const filtered = optimisticMessages.filter(opt => {
      if (realIds.has(opt.id)) return false;
      return !messages.some(
        real => real.direction === 'outbound' &&
          norm(real.body) === norm(opt.body) &&
          real.phone === opt.phone &&
          Math.abs(new Date(real.created_at).getTime() - new Date(opt.created_at).getTime()) < 30000
      );
    });
    return [...messages, ...filtered];
  }, [messages, optimisticMessages]);

  const handleOptimisticSend = useCallback((msg: WhatsAppMessage) => {
    setOptimisticMessages(prev => [...prev, msg]);
  }, []);
  const handleOptimisticUpdate = useCallback((tempId: string, status: string) => {
    setOptimisticMessages(prev => prev.map(m => m.id === tempId ? { ...m, status } : m));
  }, []);

  // --- Instância de resposta: última outbound, senão a 1ª conectada ---
  const [replyInstanceId, setReplyInstanceId] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !canonical || instances.length === 0) { setReplyInstanceId(null); return; }
    const lastOutbound = [...messages].reverse().find(m => m.direction === 'outbound');
    if (lastOutbound) {
      setReplyInstanceId(lastOutbound.instance_id);
    } else {
      const connected = instances.find(i => i.status === 'connected');
      setReplyInstanceId(connected?.id || instances[0].id);
    }
  }, [open, canonical, messages, instances]);

  const isOfficial = instances.find(i => i.id === replyInstanceId)?.channel === 'official';
  const sendInstanceId = replyInstanceId || instances[0]?.id;

  if (!open || !canonical) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* [&>button]:hidden esconde o X pequeno embutido do DialogContent — usamos o nosso, mais óbvio */}
      <DialogContent className="w-[92vw] max-w-[440px] p-0 gap-0 overflow-hidden [&>button]:hidden">
        <div className="flex min-w-0 flex-col">
          {/* Cabeçalho */}
          <div className="flex min-w-0 items-center gap-2 border-b border-border px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-sm font-semibold">{lead?.name || canonical}</DialogTitle>
              <p className="truncate text-xs text-muted-foreground">{canonical}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
              onClick={() => onOpenFull(canonical)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir chat
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Conversa */}
          <div className="flex h-[52vh] max-h-[420px] min-h-[260px] min-w-0 flex-col overflow-hidden">
            {!loading && mergedMessages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                Sem conversa ainda com este lead.<br />Escreva abaixo pra iniciar.
              </div>
            ) : (
              <ChatThread
                messages={mergedMessages}
                loading={loading}
                phone={canonical}
                instances={instances}
                instanceId={replyInstanceId || undefined}
                phoneForActions={canonical}
              />
            )}
          </div>

          {/* Resposta */}
          {sendInstanceId && (
            <div className="min-w-0 overflow-hidden">
              <ChatInput
                instanceId={sendInstanceId}
                phone={canonical}
                isOfficial={isOfficial}
                instances={instances}
                replyInstanceId={replyInstanceId || undefined}
                onReplyInstanceChange={setReplyInstanceId}
                onOptimisticSend={handleOptimisticSend}
                onOptimisticUpdate={handleOptimisticUpdate}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
