import { useState, useMemo, useEffect, useCallback } from 'react';
import type { WhatsAppMessage } from '@/hooks/useWhatsApp';
import { MessageCircle, Settings, Plus, Wifi, WifiOff } from 'lucide-react';
import { useWhatsAppInstances, useWhatsAppChats, useWhatsAppMessages, getInstanceDisplayName } from '@/hooks/useWhatsApp';
import { useWhatsAppMultiChats } from '@/hooks/useWhatsAppMultiChat';
import InstanceManagement from '@/components/whatsapp/InstanceManagement';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

function AddInstanceDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name || !apiUrl || !apiToken) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
      if (!orgId) throw new Error('Organização não encontrada');

      const { error } = await (supabase as any).from('whatsapp_instances').insert({
        organization_id: orgId,
        instance_name: name,
        api_url: apiUrl.replace(/\/$/, ''),
        api_token: apiToken,
        phone_number: phone || null,
        status: 'disconnected',
      });

      if (error) throw error;

      const { data: instances } = await (supabase as any)
        .from('whatsapp_instances')
        .select('id')
        .eq('organization_id', orgId)
        .eq('instance_name', name)
        .single();

      if (instances?.id) {
        try {
          await supabase.functions.invoke('whatsapp-instance', {
            body: { instance_id: instances.id, action: 'set_webhook' },
          });
        } catch (e) {
          console.error('Auto webhook config failed:', e);
        }
      }

      toast.success('Instância adicionada!');
      setOpen(false);
      setName('');
      setApiUrl('');
      setApiToken('');
      setPhone('');
      onCreated();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Instância
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Instância WhatsApp</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome da instância *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Vendas" />
          </div>
          <div>
            <Label className="text-xs">URL da API UAZAPI *</Label>
            <Input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://api.uazapi.com/instance/xxx" />
          </div>
          <div>
            <Label className="text-xs">Token da API *</Label>
            <Input value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder="Seu token UAZAPI" type="password" />
          </div>
          <div>
            <Label className="text-xs">Número do WhatsApp</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="5511999999999" />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Salvando...' : 'Adicionar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function WhatsAppChat() {
  const { instances, loading: loadingInstances, refetch: refetchInstances } = useWhatsAppInstances();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  // Track which instance the selected chat belongs to (for multi-instance view)
  const [chatInstanceId, setChatInstanceId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [instanceMgmtOpen, setInstanceMgmtOpen] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<WhatsAppMessage[]>([]);

  const isAllMode = selectedInstanceId === 'all';

  // Clear optimistic messages when switching chats
  useEffect(() => {
    setOptimisticMessages([]);
  }, [selectedPhone]);

  // Failsafe: remove stale optimistic messages after 60s
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setOptimisticMessages(prev => prev.filter(m =>
        now - new Date(m.created_at).getTime() < 60000
      ));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // For single instance mode
  const singleInstanceId = isAllMode ? null : (selectedInstanceId || instances[0]?.id || null);
  const activeInstanceData = instances.find(i => i.id === singleInstanceId);
  const isDisconnected = activeInstanceData ? activeInstanceData.status !== 'connected' : false;

  // The effective instance for messages (either single mode or from selected chat in multi mode)
  const effectiveInstanceId = isAllMode ? chatInstanceId : singleInstanceId;

  const { chats: singleChats, loading: loadingSingleChats, refetch: refetchSingleChats } = useWhatsAppChats(singleInstanceId);
  const { chats: multiChats, loading: loadingMultiChats, refetch: refetchMultiChats } = useWhatsAppMultiChats(
    isAllMode ? instances : []
  );

  const activeChats = isAllMode ? multiChats : singleChats;
  const loadingChats = isAllMode ? loadingMultiChats : loadingSingleChats;
  const refetchChats = isAllMode ? refetchMultiChats : refetchSingleChats;

  const { messages, loading: loadingMessages } = useWhatsAppMessages(effectiveInstanceId, selectedPhone);

  // Merge real + optimistic messages
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
    if (instanceId) {
      setChatInstanceId(instanceId);
    }
  }, []);

  const selectedChat = useMemo(
    () => activeChats.find(c => c.phone === selectedPhone),
    [activeChats, selectedPhone]
  );

  useEffect(() => {
    if (!selectedPhone || loadingMessages) return;
    refetchChats();
  }, [selectedPhone, loadingMessages, refetchChats]);

  // Handle instance selector change
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
        <AddInstanceDialog onCreated={() => refetchInstances()} />
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
                  onClick={() => setInstanceMgmtOpen(true)}
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
          <AddInstanceDialog onCreated={() => { refetchInstances(); }} />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setInstanceMgmtOpen(true)}
            title="Gerenciar Instância"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Main 3-column layout */}
      <div className="flex-1 flex min-h-0">
        {/* Chat list */}
        <div className="w-[280px] shrink-0">
          <ChatList
            chats={activeChats}
            loading={loadingChats}
            selectedPhone={selectedPhone}
            onSelectChat={handleSelectChat}
            showInstanceBadge={isAllMode}
          />
        </div>

        {/* Thread */}
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

        {/* Contact panel */}
        {showPanel && (
          <div className="w-[280px] shrink-0 border-l border-border bg-card">
            <ContactPanel
              phone={selectedPhone}
              senderName={selectedChat?.sender_name || null}
            />
          </div>
        )}
      </div>

      <InstanceManagement
        instance={instances.find(i => i.id === (isAllMode ? chatInstanceId : singleInstanceId)) || null}
        instances={instances}
        open={instanceMgmtOpen}
        onClose={() => setInstanceMgmtOpen(false)}
        onInstanceDeleted={() => refetchInstances()}
      />
    </>
  );
}
