import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Settings, Plus, Wifi, WifiOff, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { WhatsAppInstance } from '@/hooks/useWhatsApp';
import { getInstanceDisplayName } from '@/hooks/useWhatsApp';
import InstanceManagement from '@/components/whatsapp/InstanceManagement';

interface InstanceHubProps {
  instances: WhatsAppInstance[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefetch: () => void;
}

function AddInstanceForm({ onCreated }: { onCreated: (instanceId?: string) => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Digite um nome para a instância');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-instance', {
        body: { action: 'create_instance', instance_name: name.trim() },
      });

      if (error) throw new Error(error.message || 'Falha ao criar instância');
      if (data?.error) throw new Error(data.error);

      toast.success('Instância criada! Escaneie o QR Code para conectar.');
      setName('');
      onCreated(data?.instance?.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center gap-2 mb-4">
        <Plus className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold text-foreground">Nova Instância</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        A instância será criada automaticamente. Após criar, escaneie o QR Code para conectar.
      </p>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Nome da instância *</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex: Vendas, Suporte, Marketing"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? 'Criando instância...' : 'Criar Instância'}
        </Button>
      </div>
    </div>
  );
}

export default function InstanceHub({ instances, open, onOpenChange, onRefetch }: InstanceHubProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Auto-select first instance when opening (only if not showing add form)
  useEffect(() => {
    if (open && instances.length > 0 && !selectedId && !showAddForm) {
      setSelectedId(instances[0].id);
    }
  }, [open, instances, selectedId, showAddForm]);

  // Reset state when closing
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setShowAddForm(false);
    }
  }, [open]);

  const selectedInstance = instances.find(i => i.id === selectedId) || null;

  const handleAddClick = () => {
    setSelectedId(null);
    setShowAddForm(true);
  };

  const handleInstanceCreated = (newInstanceId?: string) => {
    setShowAddForm(false);
    onRefetch();
    if (newInstanceId) setSelectedId(newInstanceId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Gerenciar Instâncias
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Left sidebar - instance list */}
          <div className="w-[220px] shrink-0 border-r border-border flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {instances.map(inst => {
                  const isActive = selectedId === inst.id && !showAddForm;
                  const isConnected = inst.status === 'connected';
                  return (
                    <button
                      key={inst.id}
                      onClick={() => { setSelectedId(inst.id); setShowAddForm(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-left transition-colors ${
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted/50 text-foreground'
                      }`}
                    >
                      <div className="relative shrink-0">
                        {inst.profile_pic_url ? (
                          <img src={inst.profile_pic_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <Smartphone className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${
                          isConnected ? 'bg-emerald-500' : 'bg-destructive'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {getInstanceDisplayName(inst)}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {inst.phone_number || inst.instance_name}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
            <div className="p-2 border-t border-border shrink-0">
              <Button
                variant={showAddForm ? 'default' : 'outline'}
                size="sm"
                className="w-full gap-1.5"
                onClick={handleAddClick}
              >
                <Plus className="h-3.5 w-3.5" />
                Nova Instância
              </Button>
            </div>
          </div>

          {/* Right panel - detail/add form */}
          <ScrollArea className="flex-1">
            <div className="p-6">
              {showAddForm ? (
                <AddInstanceForm onCreated={handleInstanceCreated} />
              ) : selectedInstance ? (
                <InstanceManagement
                  instance={selectedInstance}
                  instances={instances}
                  onInstanceDeleted={() => {
                    setSelectedId(instances.find(i => i.id !== selectedInstance.id)?.id || null);
                    onRefetch();
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Selecione uma instância
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
