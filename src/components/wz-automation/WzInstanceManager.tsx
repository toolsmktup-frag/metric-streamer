import React, { useState } from 'react';
import { Plus, Wifi, WifiOff, Pencil, Trash2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useWzInstances, useCreateWzInstance, useUpdateWzInstance, useDeleteWzInstance, testWzInstanceConnection } from '@/hooks/useWzInstances';
import type { WzInstance } from '@/types/wz-automation';
import { toast } from 'sonner';

export default function WzInstanceManager({ embedded = false }: { embedded?: boolean }) {
  const { data: instances = [], isLoading } = useWzInstances();
  const createInstance = useCreateWzInstance();
  const updateInstance = useUpdateWzInstance();
  const deleteInstance = useDeleteWzInstance();

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', api_url: '', api_key: '' });
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean>>({});

  const openNew = () => {
    setEditId(null);
    setForm({ name: '', api_url: '', api_key: '' });
    setModalOpen(true);
  };

  const openEdit = (inst: WzInstance) => {
    setEditId(inst.id);
    setForm({ name: inst.name, api_url: inst.api_url, api_key: inst.api_key });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.api_url.trim() || !form.api_key.trim()) {
      toast.error('Preencha todos os campos');
      return;
    }
    if (editId) {
      await updateInstance.mutateAsync({ id: editId, ...form });
    } else {
      await createInstance.mutateAsync(form);
    }
    setModalOpen(false);
  };

  const handleTest = async (inst: WzInstance) => {
    setTesting(inst.id);
    const ok = await testWzInstanceConnection(inst.api_url, inst.api_key);
    setTestResults(prev => ({ ...prev, [inst.id]: ok }));
    setTesting(null);
    if (ok) {
      toast.success(`${inst.name}: Conexão OK`);
      updateInstance.mutate({ id: inst.id, status: 'connected' });
    } else {
      toast.error(`${inst.name}: Falha na conexão`);
      updateInstance.mutate({ id: inst.id, status: 'disconnected' });
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Instâncias UAZAPI</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie as conexões WhatsApp usadas nas automações
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Instância
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-20 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : instances.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Wifi className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Nenhuma instância</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Cadastre uma instância UAZAPI para usar nas automações.
          </p>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Cadastrar Instância
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {instances.map(inst => (
            <div
              key={inst.id}
              className="rounded-xl border border-border bg-card p-4 flex items-center gap-4"
            >
              {/* Status dot */}
              <div className={`h-3 w-3 rounded-full flex-shrink-0 ${
                inst.status === 'connected' ? 'bg-emerald-500' : 'bg-red-400'
              }`} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground">{inst.name}</h3>
                <p className="text-xs text-muted-foreground truncate">{inst.api_url}</p>
              </div>

              {/* Status badge */}
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                inst.status === 'connected'
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : 'bg-red-500/10 text-red-500'
              }`}>
                {inst.status === 'connected' ? 'Conectado' : 'Desconectado'}
              </span>

              {/* Test result */}
              {testResults[inst.id] !== undefined && (
                testResults[inst.id]
                  ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  : <XCircle className="h-5 w-5 text-red-500" />
              )}

              {/* Actions */}
              <Button
                variant="outline"
                size="sm"
                disabled={testing === inst.id}
                onClick={() => handleTest(inst)}
              >
                {testing === inst.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Testar'
                )}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => openEdit(inst)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(inst.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Instância' : 'Nova Instância'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder='Ex: "WhatsApp Guru"'
              />
            </div>
            <div className="space-y-2">
              <Label>URL da API</Label>
              <Input
                value={form.api_url}
                onChange={e => setForm(f => ({ ...f, api_url: e.target.value }))}
                placeholder="https://minha-uazapi.com"
              />
            </div>
            <div className="space-y-2">
              <Label>API Key / Token</Label>
              <Input
                type="password"
                value={form.api_key}
                onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                placeholder="Token de acesso"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createInstance.isPending || updateInstance.isPending}>
              {(createInstance.isPending || updateInstance.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover instância?</AlertDialogTitle>
            <AlertDialogDescription>
              Fluxos que usam esta instância deixarão de funcionar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteInstance.mutate(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
