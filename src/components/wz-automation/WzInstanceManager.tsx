import React, { useState } from 'react';
import { Wifi, Smartphone, Settings, Plus, Pencil, Trash2, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWhatsAppInstances, getInstanceDisplayName } from '@/hooks/useWhatsApp';
import { useWzInstances, useCreateWzInstance, useUpdateWzInstance, useDeleteWzInstance } from '@/hooks/useWzInstances';
import InstanceHub from '@/components/whatsapp/InstanceHub';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

export default function WzInstanceManager({ embedded = false }: { embedded?: boolean }) {
  const { instances: chatInstances, loading: chatLoading, refetch } = useWhatsAppInstances();
  const { data: manualInstances = [], isLoading: manualLoading } = useWzInstances();
  const createMutation = useCreateWzInstance();
  const updateMutation = useUpdateWzInstance();
  const deleteMutation = useDeleteWzInstance();

  const [hubOpen, setHubOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formKey, setFormKey] = useState('');

  const loading = chatLoading || manualLoading;

  const openNew = () => { setEditingId(null); setFormName(''); setFormUrl(''); setFormKey(''); setFormOpen(true); };
  const openEdit = (inst: any) => { setEditingId(inst.id); setFormName(inst.name); setFormUrl(inst.api_url); setFormKey(inst.api_key); setFormOpen(true); };

  const handleSave = async () => {
    if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, name: formName, api_url: formUrl, api_key: formKey });
    } else {
      await createMutation.mutateAsync({ name: formName, api_url: formUrl, api_key: formKey });
    }
    setFormOpen(false);
  };

  return (
    <div className={embedded ? 'space-y-6' : 'p-6 space-y-6 max-w-4xl mx-auto'}>
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Instâncias WhatsApp</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Instâncias do Chat e manuais — usadas nas automações
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" /> Instância Manual
            </Button>
            <Button onClick={() => setHubOpen(true)} className="gap-2">
              <Settings className="h-4 w-4" /> Gerenciar Chat
            </Button>
          </div>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Instância Manual
          </Button>
          <Button onClick={() => setHubOpen(true)} className="gap-2">
            <Settings className="h-4 w-4" /> Gerenciar Chat
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-20 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (chatInstances.length === 0 && manualInstances.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Wifi className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Nenhuma instância</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Conecte uma instância no Chat ou adicione uma manualmente.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" /> Instância Manual
            </Button>
            <Button onClick={() => setHubOpen(true)} className="gap-2">
              <Settings className="h-4 w-4" /> Gerenciar Chat
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Chat Instances */}
          {chatInstances.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Instâncias do Chat</h2>
              {chatInstances.map(inst => {
                const isConnected = inst.status === 'connected';
                return (
                  <div key={inst.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
                    <div className="relative shrink-0">
                      {inst.profile_pic_url ? (
                        <img src={inst.profile_pic_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <Smartphone className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${isConnected ? 'bg-emerald-500' : 'bg-destructive'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{getInstanceDisplayName(inst)}</h3>
                      <p className="text-xs text-muted-foreground truncate">{inst.phone_number || inst.instance_name}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">Chat</Badge>
                    <Badge variant={isConnected ? 'default' : 'destructive'} className="text-xs">
                      {isConnected ? 'Conectado' : 'Desconectado'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}

          {/* Manual Instances */}
          {manualInstances.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Instâncias Manuais</h2>
              {manualInstances.map(inst => (
                <div key={inst.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Server className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{inst.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">{inst.api_url}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">Manual</Badge>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(inst)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(inst.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <InstanceHub instances={chatInstances} open={hubOpen} onOpenChange={setHubOpen} onRefetch={refetch} />

      {/* Manual instance form dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Instância Manual' : 'Nova Instância Manual'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Minha instância" />
            </div>
            <div className="space-y-2">
              <Label>URL da API</Label>
              <Input value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="https://api.example.com" />
            </div>
            <div className="space-y-2">
              <Label>Token / API Key</Label>
              <Input value={formKey} onChange={e => setFormKey(e.target.value)} placeholder="seu-token-aqui" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!formName.trim() || !formUrl.trim() || !formKey.trim()}>
              {editingId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
