import { useState, useMemo, useEffect, useCallback } from 'react';
import type { WhatsAppMessage } from '@/hooks/useWhatsApp';
import { MessageCircle, Settings, Plus, Wifi, WifiOff } from 'lucide-react';
import { useWhatsAppInstances, useWhatsAppChats, useWhatsAppMessages } from '@/hooks/useWhatsApp';
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

      // Auto-configure webhook for the new instance
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
  const [showPanel, setShowPanel] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [instanceMgmtOpen, setInstanceMgmtOpen] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<WhatsAppMessage[]>([]);

  // Auto-select first instance
  const activeInstance = selectedInstanceId || instances[0]?.id || null;
  const activeInstanceData = instances.find(i => i.id === activeInstance);
  const isDisconnected = activeInstanceData?.status !== 'connected';

  const { chats, loading: loadingChats, refetch: refetchChats } = useWhatsAppChats(activeInstance);
  const { messages, loading: loadingMessages } = useWhatsAppMessages(activeInstance, selectedPhone);

  // Merge real + optimistic messages, removing optimistic once real arrives
  const mergedMessages = useMemo(() => {
    const realIds = new Set(messages.map(m => m.id));
    // Remove optimistic msgs that have a matching real msg (same body+direction+phone within 30s)
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

  const selectedChat = useMemo(
    () => chats.find(c => c.phone === selectedPhone),
    [chats, selectedPhone]
  );

  useEffect(() => {
    if (!selectedPhone || loadingMessages) return;
    refetchChats();
  }, [selectedPhone, loadingMessages, refetchChats]);

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

  return wrapWithSidebar(
    <>
      {/* Top bar */}
      <div className="h-12 border-b border-border bg-card flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">WhatsApp</span>
          {instances.length > 1 && (
            <Select value={activeInstance || ''} onValueChange={v => { setSelectedInstanceId(v); setSelectedPhone(null); }}>
              <SelectTrigger className="h-7 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {instances.map(inst => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.display_name || inst.instance_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Status indicator */}
          {activeInstanceData && (
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
            chats={chats}
            loading={loadingChats}
            selectedPhone={selectedPhone}
            onSelectChat={setSelectedPhone}
          />
        </div>

        {/* Thread */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          <ChatThread
            messages={messages}
            loading={loadingMessages}
            phone={selectedPhone}
          />
          {selectedPhone && activeInstance && (
            <ChatInput instanceId={activeInstance} phone={selectedPhone} />
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
        instance={instances.find(i => i.id === activeInstance) || null}
        open={instanceMgmtOpen}
        onClose={() => setInstanceMgmtOpen(false)}
        onInstanceDeleted={() => refetchInstances()}
      />
    </>
  );
}
