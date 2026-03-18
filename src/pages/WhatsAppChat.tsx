import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { WhatsAppMessage } from '@/hooks/useWhatsApp';
import { MessageCircle, Settings, Plus, Wifi, WifiOff } from 'lucide-react';
import { useWhatsAppInstances, useWhatsAppChats, useWhatsAppMessages, getInstanceDisplayName } from '@/hooks/useWhatsApp';
import { useWhatsAppMultiChats } from '@/hooks/useWhatsAppMultiChat';
import InstanceHub from '@/components/whatsapp/InstanceHub';
import ChatList from '@/components/whatsapp/ChatList';
import ChatThread from '@/components/whatsapp/ChatThread';
import ChatInput from '@/components/whatsapp/ChatInput';
import ContactPanel from '@/components/whatsapp/ContactPanel';
import AppSidebar from '@/components/layout/AppSidebar';
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

export default function WhatsAppChat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { instances, loading: loadingInstances, refetch: refetchInstances } = useWhatsAppInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<WhatsAppMessage[]>([]);
  const [replyInstanceId, setReplyInstanceId] = useState<string | null>(null);

  // Auto-open chat from query param ?phone=
  useEffect(() => {
    const phoneParam = searchParams.get('phone');
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

  useEffect(() => { setOptimisticMessages([]); }, [selectedPhone]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setOptimisticMessages(prev => prev.filter(m =>
        now - new Date(m.created_at).getTime() < 60000
      ));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const singleInstanceId = isAllMode ? null : (selectedInstanceId || instances[0]?.id || null);
  const activeInstanceData = instances.find(i => i.id === singleInstanceId);
  const isDisconnected = activeInstanceData ? activeInstanceData.status !== 'connected' : false;

  // For messages: in "all" mode pass 'all', otherwise use the single instance
  const effectiveInstanceId = isAllMode ? 'all' : singleInstanceId;

  const { chats: singleChats, loading: loadingSingleChats, refetch: refetchSingleChats } = useWhatsAppChats(singleInstanceId);
  const { chats: multiChats, loading: loadingMultiChats, refetch: refetchMultiChats } = useWhatsAppMultiChats(
    isAllMode ? instances : []
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
    const filtered = optimisticMessages.filter(opt => {
      if (realIds.has(opt.id)) return false;
      return !messages.some(
        real => real.direction === 'outbound' &&
          real.body === opt.body &&
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
    if (instanceId) setChatInstanceId(instanceId);
  }, []);

  const selectedChat = useMemo(
    () => activeChats.find(c => c.phone === selectedPhone),
    [activeChats, selectedPhone]
  );

  useEffect(() => {
    if (!selectedPhone || loadingMessages) return;
    refetchChats();
  }, [selectedPhone, loadingMessages, refetchChats]);

  const handleInstanceChange = (value: string) => {
    setSelectedInstanceId(value === 'all' ? 'all' : value);
    setSelectedPhone(null);
    setChatInstanceId(null);
  };

  const wrapWithSidebar = (content: React.ReactNode) => (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {content}
      </div>
    </div>
  );

  if (loadingInstances) {
    return wrapWithSidebar(
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (instances.length === 0) {
    return wrapWithSidebar(
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
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

  return wrapWithSidebar(
    <>
      {/* Top bar */}
      <div className="h-12 border-b border-border bg-card flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
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

      {/* Main 3-column layout */}
      <div className="flex-1 flex min-h-0">
        <div className="w-[280px] shrink-0">
          <ChatList
            chats={activeChats}
            loading={loadingChats}
            selectedPhone={selectedPhone}
            onSelectChat={handleSelectChat}
            showInstanceBadge={isAllMode}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          <ChatThread
            messages={mergedMessages}
            loading={loadingMessages}
            phone={selectedPhone}
          />
          {selectedPhone && effectiveInstanceId && (
            <ChatInput
              instanceId={effectiveInstanceId}
              phone={selectedPhone}
              onOptimisticSend={handleOptimisticSend}
              onOptimisticUpdate={handleOptimisticUpdate}
            />
          )}
        </div>

        {showPanel && (
          <div className="w-[280px] shrink-0 border-l border-border bg-card">
            <ContactPanel
              phone={selectedPhone}
              senderName={selectedChat?.sender_name || null}
            />
          </div>
        )}
      </div>

      <InstanceHub
        instances={instances}
        open={hubOpen}
        onOpenChange={setHubOpen}
        onRefetch={refetchInstances}
      />
    </>
  );
}
