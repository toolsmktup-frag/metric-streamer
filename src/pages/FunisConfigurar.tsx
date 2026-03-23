import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFunnels, useCreateFunnel, useUpdateFunnel, useDeleteFunnel, useUpsertFunnelProducts, type Funnel, type FunnelProduct } from '@/hooks/useFunnels';
import { useDistinctProductNames } from '@/hooks/useDistinctProductNames';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Save, X, Copy, Check, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ROLE_OPTIONS = [
  { value: 'front', label: 'Front-end' },
  { value: 'order_bump', label: 'Order Bump' },
  { value: 'upsell1', label: 'Upsell 1' },
  { value: 'upsell2', label: 'Upsell 2' },
  { value: 'upsell3', label: 'Upsell 3' },
  { value: 'downsell', label: 'Downsell' },
];

const PLATFORM_OPTIONS = [
  { value: 'ticto', label: 'Ticto' },
  { value: 'guru', label: 'Guru' },
  { value: 'kiwify', label: 'Kiwify' },
  { value: 'hotmart', label: 'Hotmart' },
  { value: 'eduzz', label: 'Eduzz' },
  { value: 'outro', label: 'Outro' },
];

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];

interface ProductRow {
  id?: string;
  product_name_contains: string;
  role: FunnelProduct['role'];
  display_name: string;
  recontact_days: number | null;
}

interface FunnelFormData {
  name: string;
  description: string;
  color: string;
  meta_account_id: string;
  platform: Funnel['platform'];
}

function emptyForm(): FunnelFormData {
  return { name: '', description: '', color: '#6366f1', meta_account_id: '', platform: 'ticto' };
}

const SUPABASE_FUNCTIONS_URL = 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1';

function WebhookUrl({ token, platform }: { token: string; platform: string }) {
  const [copied, setCopied] = useState(false);
  const functionName = platform === 'guru' ? 'guru-webhook' : platform === 'eduzz' ? 'eduzz-webhook' : 'ticto-webhook';
  const url = `${SUPABASE_FUNCTIONS_URL}/${functionName}?token=${token}`;

  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">URL do Webhook</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded font-mono truncate" title={url}>{url}</code>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Cole esta URL no campo de webhook da plataforma de pagamento.</p>
    </div>
  );
}

export default function FunisConfigurar() {
  const [searchParams] = useSearchParams();
  const { data: funnels = [], isLoading } = useFunnels();
  const createFunnel = useCreateFunnel();
  const updateFunnel = useUpdateFunnel();
  const deleteFunnel = useDeleteFunnel();
  const upsertProducts = useUpsertFunnelProducts();
  const { toast } = useToast();

  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<FunnelFormData>(emptyForm());
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Abre automaticamente o formulário de edição se vier ?editar=id na URL
  useEffect(() => {
    const editarId = searchParams.get('editar');
    if (editarId && funnels.length > 0 && editingId === null) {
      const funnel = funnels.find(f => f.id === editarId);
      if (funnel) startEdit(funnel);
    }
  }, [searchParams, funnels]);

  function startNew() {
    setEditingId('new');
    setForm(emptyForm());
    setProducts([]);
  }

  function startEdit(funnel: Funnel) {
    setEditingId(funnel.id);
    setForm({
      name: funnel.name,
      description: funnel.description || '',
      color: funnel.color,
      meta_account_id: funnel.meta_account_id || '',
      platform: funnel.platform,
    });
    setProducts((funnel.funnel_products || []).map(fp => ({
      id: fp.id,
      product_name_contains: fp.product_name_contains,
      role: fp.role,
      display_name: fp.display_name || '',
      recontact_days: fp.recontact_days,
    })));
  }

  function cancelEdit() {
    setEditingId(null);
    setConfirmDelete(false);
  }

  async function handleDelete() {
    if (!editingId || editingId === 'new') return;
    try {
      await deleteFunnel.mutateAsync(editingId);
      toast({ title: 'Funil excluído com sucesso!' });
      setEditingId(null);
      setConfirmDelete(false);
    } catch (err) {
      toast({ title: 'Erro ao excluir', description: String(err), variant: 'destructive' });
    }
  }

  function addProduct() {
    setProducts(p => [...p, { product_name_contains: '', role: 'front', display_name: '', recontact_days: null }]);
  }

  function removeProduct(idx: number) {
    setProducts(p => p.filter((_, i) => i !== idx));
  }

  function updateProduct(idx: number, field: keyof ProductRow, value: string) {
    setProducts(p => p.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }

    try {
      let funnelId: string;

      if (editingId === 'new') {
        const created = await createFunnel.mutateAsync({
          name: form.name,
          description: form.description || null,
          color: form.color,
          meta_account_id: form.meta_account_id || null,
          platform: form.platform,
        });
        funnelId = created.id;
      } else {
        await updateFunnel.mutateAsync({
          id: editingId!,
          name: form.name,
          description: form.description || null,
          color: form.color,
          meta_account_id: form.meta_account_id || null,
          platform: form.platform,
        });
        funnelId = editingId!;
      }

      const validProducts = products.filter(p => p.product_name_contains.trim());
      await upsertProducts.mutateAsync({
        funnelId,
        products: validProducts.map(p => ({
          product_name_contains: p.product_name_contains.trim(),
          role: p.role,
          display_name: p.display_name.trim() || null,
          recontact_days: p.recontact_days,
        })),
      });

      toast({ title: 'Funil salvo com sucesso!' });
      setEditingId(null);
    } catch (err) {
      toast({ title: 'Erro ao salvar', description: String(err), variant: 'destructive' });
    }
  }

  if (isLoading) return <div className="text-muted-foreground p-8">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gerenciar Funis</h1>
        {!editingId && (
          <Button onClick={startNew} size="sm">
            <Plus className="h-4 w-4 mr-2" /> Novo Funil
          </Button>
        )}
      </div>

      {/* Formulário de criação/edição */}
      {editingId && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">{editingId === 'new' ? 'Novo Funil' : 'Editar Funil'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Nome e cor */}
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-1">
                <Label>Nome do Funil</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Guia de Tinturas" />
              </div>
              <div className="space-y-1">
                <Label>Cor</Label>
                <div className="flex gap-1.5">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`h-7 w-7 rounded-full border-2 transition-all ${form.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-1">
              <Label>Descrição <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Funil principal de lançamento..." />
            </div>

            {/* Plataforma e conta Meta */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Plataforma de Pagamento</Label>
                <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v as Funnel['platform'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>ID(s) da Conta Meta <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Input value={form.meta_account_id} onChange={e => setForm(f => ({ ...f, meta_account_id: e.target.value }))} placeholder="283978142234803, 120214567890123" />
                <p className="text-xs text-muted-foreground">Separe múltiplas contas por vírgula. Sem "act_".</p>
              </div>
            </div>

            {/* Produtos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Produtos do Funil</Label>
                <Button variant="ghost" size="sm" onClick={addProduct}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                O <strong>fragmento</strong> é buscado dentro do nome do produto via ILIKE. O campo <strong>Dias</strong> define após quantos dias da compra o lead deve ser recontactado (ex: 1 pote = 25 dias).
              </p>
              <div className="space-y-2">
                {products.map((p, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Input
                      className="flex-1"
                      placeholder="Fragmento do nome (ex: TINTURA)"
                      value={p.product_name_contains}
                      onChange={e => updateProduct(idx, 'product_name_contains', e.target.value)}
                    />
                    <Select value={p.role} onValueChange={v => updateProduct(idx, 'role', v)}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      className="w-40"
                      placeholder="Nome amigável"
                      value={p.display_name}
                      onChange={e => updateProduct(idx, 'display_name', e.target.value)}
                    />
                    <Input
                      className="w-20"
                      type="number"
                      placeholder="Dias"
                      title="Dias para recontato após compra"
                      value={p.recontact_days ?? ''}
                      onChange={e => {
                        const val = e.target.value ? parseInt(e.target.value, 10) : null;
                        setProducts(prev => prev.map((row, i) => i === idx ? { ...row, recontact_days: val } : row));
                      }}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeProduct(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {products.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">Nenhum produto. Clique em "Adicionar" para configurar.</p>
                )}
              </div>
            </div>

            {/* Ações */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={createFunnel.isPending || updateFunnel.isPending}>
                <Save className="h-4 w-4 mr-2" /> Salvar
              </Button>
              <Button variant="outline" onClick={cancelEdit}>
                <X className="h-4 w-4 mr-2" /> Cancelar
              </Button>
            </div>

            {/* Zona de exclusão — só aparece ao editar um funil existente */}
            {editingId !== 'new' && (
              <div className="mt-4 pt-4 border-t border-destructive/20">
                {!confirmDelete ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir funil
                  </Button>
                ) : (
                  <div className="flex items-center gap-3 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2.5">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                    <span className="text-sm text-destructive flex-1">Tem certeza? Esta ação não pode ser desfeita.</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDelete}
                      disabled={deleteFunnel.isPending}
                    >
                      Confirmar exclusão
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lista de funis existentes */}
      <div className="space-y-3">
        {funnels.map(funnel => (
          <Card key={funnel.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="h-4 w-4 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: funnel.color }} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{funnel.name}</span>
                      <Badge variant="outline" className="text-xs">{funnel.platform}</Badge>
                      {funnel.meta_account_id && (
                        <Badge variant="secondary" className="text-xs font-mono">{funnel.meta_account_id}</Badge>
                      )}
                    </div>
                    {funnel.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{funnel.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(funnel.funnel_products || []).map(fp => (
                        <Badge key={fp.id} variant="secondary" className="text-xs">
                          {fp.display_name || fp.product_name_contains} — {ROLE_OPTIONS.find(r => r.value === fp.role)?.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => startEdit(funnel)} disabled={editingId !== null}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                </Button>
              </div>

              <div className="mt-3 pt-3 border-t border-border">
                <WebhookUrl token={funnel.webhook_token} platform={funnel.platform} />
              </div>
            </CardContent>
          </Card>
        ))}

        {funnels.length === 0 && !editingId && (
          <Card>
            <CardContent className="pt-6 pb-6 text-center">
              <p className="text-muted-foreground text-sm">Nenhum funil configurado ainda.</p>
              <Button className="mt-3" size="sm" onClick={startNew}>
                <Plus className="h-4 w-4 mr-2" /> Criar primeiro funil
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
