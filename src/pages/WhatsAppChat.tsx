import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { WhatsAppMessage, ReplyContext } from '@/hooks/useWhatsApp';
import { MessageCircle, Settings, Plus, Wifi, WifiOff, ArrowLeft } from 'lucide-react';
import { useWhatsAppInstances, useWhatsAppChats, useWhatsAppMessages, getInstanceDisplayName } from '@/hooks/useWhatsApp';
import { useWhatsAppMultiChats } from '@/hooks/useWhatsAppMultiChat';
import InstanceHub from '@/components/whatsapp/InstanceHub';
import ChatList from '@/components/whatsapp/ChatList';
import ChatThread from '@/components/whatsapp/ChatThread';
import ChatInput from '@/components/whatsapp/ChatInput';
import BotControlBar from '@/components/whatsapp/BotControlBar';
import ContactPanel from '@/components/whatsapp/ContactPanel';
import SalesCopilotPanel from '@/components/whatsapp/SalesCopilotPanel';
import SalesCopilotButton from '@/components/whatsapp/SalesCopilotButton';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const EMPTY_INSTANCES: import('@/hooks/useWhatsApp').WhatsAppInstance[] = [];

export default function WhatsAppChat() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { instances, loading: loadingInstances, refetch: refetchInstances } = useWhatsAppInstances();
  // Instância onde a IA (Girassol) atende — só nela o status IA↔humano faz sentido.
  const botInstanceId = instances.find(
    (i) => (i.instance_name || i.nickname || i.display_name || '').toUpperCase().includes('GIRASSOL'),
  )?.id;
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [selectedChatInstanceId, setSelectedChatInstanceId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const backRoute = useRef<string | null>(null);
  
  const [hubOpen, setHubOpen] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<WhatsAppMessage[]>([]);
  const [replyInstanceId, setReplyInstanceId] = useState<string | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotPrefill, setCopilotPrefill] = useState<string>('');
  const [replyingTo, setReplyingTo] = useState<ReplyContext | null>(null);

  // Reset reply context when chat changes
  useEffect(() => {
    setReplyingTo(null);
  }, [selectedPhone, selectedChatInstanceId]);

  // Auto-select instance: single → that instance, multiple → 'all'
  useEffect(() => {
    if (selectedInstanceId !== null || instances.length === 0) return;
    if (instances.length === 1) {
      setSelectedInstanceId(instances[0].id);
    } else {
      setSelectedInstanceId('all');
    }
  }, [instances, selectedInstanceId]);

  // Recover automatically when the selected instance was deleted or no longer exists
  useEffect(() => {
    if (selectedInstanceId === null || selectedInstanceId === 'all') return;

    const instanceStillExists = instances.some(instance => instance.id === selectedInstanceId);
    if (instanceStillExists) return;

    setSelectedPhone(null);
    setSelectedChatInstanceId(null);
    setReplyInstanceId(null);

    if (instances.length === 1) {
      setSelectedInstanceId(instances[0].id);
    } else if (instances.length > 1) {
      setSelectedInstanceId('all');
    } else {
      setSelectedInstanceId(null);
    }
  }, [instances, selectedInstanceId]);

  // Auto-open chat from query param ?phone= and capture ?from= for back navigation
  useEffect(() => {
    const phoneParam = searchParams.get('phone');
    const fromParam = searchParams.get('from');
    if (fromParam) {
      backRoute.current = fromParam;
    }
    if (phoneParam && !loadingInstances && instances.length > 0) {
      const cleanPhone = phoneParam.replace(/\D/g, '');
      setSelectedPhone(cleanPhone);
      if (instances.length === 1) {
        setSelectedInstanceId(instances[0].id);
      } else {
        setSelectedInstanceId('all');
      }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, loadingInstances, instances, setSearchParams]);

  const isAllMode = selectedInstanceId === 'all';

  useEffect(() => { setOptimisticMessages([]); }, [selectedPhone, selectedChatInstanceId]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setOptimisticMessages(prev => prev.filter(m =>
        now - new Date(m.created_at).getTime() < 60000
      ));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const selectedInstanceExists = selectedInstanceId !== null && selectedInstanceId !== 'all'
    ? instances.some(instance => instance.id === selectedInstanceId)
    : false;

  const singleInstanceId = isAllMode
    ? null
    : selectedInstanceExists
      ? selectedInstanceId
      : (instances[0]?.id || null);
  const activeInstanceData = instances.find(i => i.id === singleInstanceId);
  const isDisconnected = activeInstanceData ? activeInstanceData.status !== 'connected' : false;

  // For messages: if a specific chat instance is locked, use it; otherwise 'all' or single
  const effectiveInstanceId = selectedChatInstanceId
    ? selectedChatInstanceId
    : (isAllMode ? 'all' : singleInstanceId);

  const { chats: singleChats, loading: loadingSingleChats, refetch: refetchSingleChats } = useWhatsAppChats(singleInstanceId);
  const { chats: multiChats, loading: loadingMultiChats, refetch: refetchMultiChats } = useWhatsAppMultiChats(
    isAllMode ? instances : EMPTY_INSTANCES
  );

  const activeChats = isAllMode ? multiChats : singleChats;
  const loadingChats = isAllMode ? loadingMultiChats : loadingSingleChats;
  const refetchChats = isAllMode ? refetchMultiChats : refetchSingleChats;

  const { messages, loading: loadingMessages } = useWhatsAppMessages(effectiveInstanceId, selectedPhone);

  // Auto-select reply instance: most recent outbound message's instance, or first connected
  useEffect(() => {
    if (!isAllMode || !selectedPhone || instances.length === 0) {
      setReplyInstanceId(null);
      return;
    }
    // Find the most recent outbound message to determine default reply instance
    const lastOutbound = [...messages].reverse().find(m => m.direction === 'outbound');
    if (lastOutbound) {
      setReplyInstanceId(lastOutbound.instance_id);
    } else {
      // Default to first connected instance
      const connected = instances.find(i => i.status === 'connected');
      setReplyInstanceId(connected?.id || instances[0].id);
    }
  }, [isAllMode, selectedPhone, messages, instances]);

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
    setOptimisticMessages(prev =>
      prev.map(m => m.id === tempId ? { ...m, status } : m)
    );
  }, []);

  const handleSelectChat = useCallback((phone: string, instanceId?: string) => {
    setSelectedPhone(phone);
    // In 'all' mode, lock the chat to the instance it came from (composite identity)
    setSelectedChatInstanceId(isAllMode && instanceId ? instanceId : null);
  }, [isAllMode]);

  const selectedKey = selectedPhone
    ? (selectedChatInstanceId ? `${selectedChatInstanceId}__${selectedPhone}` : (singleInstanceId ? `${singleInstanceId}__${selectedPhone}` : selectedPhone))
    : null;

  const selectedChat = useMemo(
    () => activeChats.find(c => {
      if (selectedChatInstanceId) {
        return c.phone === selectedPhone && (c as any).instance_id === selectedChatInstanceId;
      }
      return c.phone === selectedPhone;
    }),
    [activeChats, selectedPhone, selectedChatInstanceId]
  );

  useEffect(() => {
    if (!selectedPhone || loadingMessages) return;
    refetchChats();
  }, [selectedPhone, loadingMessages, refetchChats]);

  const handleInstanceChange = (value: string) => {
    setSelectedInstanceId(value === 'all' ? 'all' : value);
    setSelectedPhone(null);
    setSelectedChatInstanceId(null);
    setReplyInstanceId(null);
  };

  if (loadingInstances) {
    return (
      <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-6">
        <div className="h-12 border-b border-border bg-card flex items-center px-3 gap-2 shrink-0">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">WhatsApp</span>
          <span className="text-xs text-muted-foreground animate-pulse ml-2">Conectando...</span>
        </div>
        <div className="flex-1 flex min-h-0">
          <div className="w-[280px] shrink-0 border-r border-border p-3 space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full animate-pulse bg-muted shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-24 rounded animate-pulse bg-muted" />
                  <div className="h-3 w-36 rounded animate-pulse bg-muted/60" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm animate-pulse">
            Carregando conversas...
          </div>
        </div>
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] -m-6 gap-4 text-center">
        <MessageCircle className="h-12 w-12 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">Nenhuma instância configurada</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Adicione uma instância UAZAPI para começar a usar o chat.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setHubOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Adicionar Instância
        </Button>
        <InstanceHub
          instances={instances}
          open={hubOpen}
          onOpenChange={setHubOpen}
          onRefetch={refetchInstances}
        />
      </div>
    );
  }

  const selectorValue = isAllMode ? 'all' : (singleInstanceId || '');

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-6">
      {/* Top bar */}
      <div className="h-12 border-b border-border bg-card flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          {backRoute.current && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title="Voltar ao Funil"
              onClick={() => navigate(backRoute.current!)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">WhatsApp</span>
          <Select value={selectorValue} onValueChange={handleInstanceChange}>
            <SelectTrigger className="h-7 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {instances.length > 1 && (
                <SelectItem value="all">
                  📋 Todas as instâncias
                </SelectItem>
              )}
              {instances.map(inst => (
                <SelectItem key={inst.id} value={inst.id}>
                  {getInstanceDisplayName(inst)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Status indicator (only in single mode) */}
          {!isAllMode && activeInstanceData && (
            <div className="flex items-center gap-1.5 ml-2">
              {activeInstanceData.profile_pic_url && (
                <img src={activeInstanceData.profile_pic_url} alt="" className="h-5 w-5 rounded-full object-cover" />
              )}
              {isDisconnected ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-6 gap-1 text-xs px-2"
                  onClick={() => setHubOpen(true)}
                >
                  <WifiOff className="h-3 w-3" />
                  Desconectado — Reconectar
                </Button>
              ) : (
                <span className="flex items-center gap-1 text-xs text-emerald-500">
                  <Wifi className="h-3 w-3" />
                  {activeInstanceData.display_name || ''}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedPhone && (
            <SalesCopilotButton onClick={() => setCopilotOpen(o => !o)} active={copilotOpen} />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setHubOpen(true)}
            title="Gerenciar Instâncias"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Main 3-column layout */}
      <div className="flex-1 flex min-h-0">
        <div className="w-[280px] shrink-0">
          <ChatList
            chats={activeChats}
            loading={loadingChats}
            selectedKey={selectedKey}
            onSelectChat={handleSelectChat}
            showInstanceBadge={isAllMode}
            botInstanceId={botInstanceId}
            currentInstanceId={singleInstanceId}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          <ChatThread
            messages={mergedMessages}
            loading={loadingMessages}
            phone={selectedPhone}
            instances={isAllMode ? instances : undefined}
            onReply={(msg) => setReplyingTo({
              id: msg.id,
              external_id: msg.message_id_external,
              text: msg.body || '',
              sender_name: msg.sender_name,
              from_me: msg.direction === 'outbound',
            })}
            instanceId={effectiveInstanceId || undefined}
            phoneForActions={selectedPhone || undefined}
          />
          {selectedPhone && botInstanceId && effectiveInstanceId === botInstanceId && (
            <BotControlBar phone={selectedPhone} />
          )}
          {selectedPhone && effectiveInstanceId && (
            <ChatInput
              instanceId={effectiveInstanceId}
              phone={selectedPhone}
              onOptimisticSend={handleOptimisticSend}
              onOptimisticUpdate={handleOptimisticUpdate}
              instances={isAllMode ? instances : undefined}
              replyInstanceId={replyInstanceId || undefined}
              onReplyInstanceChange={isAllMode ? (id) => setReplyInstanceId(id) : undefined}
              prefillText={copilotPrefill}
              onPrefillConsumed={() => setCopilotPrefill('')}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
            />
          )}
        </div>

        {copilotOpen ? (
          <SalesCopilotPanel
            open={copilotOpen}
            onClose={() => setCopilotOpen(false)}
            phone={selectedPhone}
            instanceId={effectiveInstanceId}
            onUseInInput={(t) => setCopilotPrefill(t)}
          />
        ) : (
          showPanel && (
            <div className="w-[280px] shrink-0 border-l border-border bg-card">
              <ContactPanel
                phone={selectedPhone}
                senderName={selectedChat?.contact_name || selectedChat?.sender_name || null}
                contactPicture={selectedChat?.contact_picture || null}
              />
            </div>
          )
        )}
      </div>

      <InstanceHub
        instances={instances}
        open={hubOpen}
        onOpenChange={setHubOpen}
        onRefetch={refetchInstances}
      />
    </div>
  );
}
