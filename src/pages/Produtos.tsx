import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Pencil, Package, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useProductsCatalog, useUpsertProductCatalog, useDeleteProductCatalog, type ProductCatalogItem, type CatalogRole } from '@/hooks/useProductsCatalog';
import type { PaymentPlatform } from '@/hooks/useFunnels';

const PLATFORMS: PaymentPlatform[] = ['ticto', 'guru', 'kiwify', 'hotmart', 'eduzz', 'youshop', 'outro'];
const ROLES: { value: CatalogRole; label: string }[] = [
  { value: 'front', label: 'Front-end' },
  { value: 'order_bump', label: 'Order Bump' },
  { value: 'upsell1', label: 'Upsell 1' },
  { value: 'upsell2', label: 'Upsell 2' },
  { value: 'upsell3', label: 'Upsell 3' },
  { value: 'downsell', label: 'Downsell' },
];

interface FormState {
  id?: string;
  product_id: string;
  platform: PaymentPlatform;
  display_name: string;
  product_name_contains: string;
  default_role: CatalogRole | '';
  recontact_days: string;
  notes: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  product_id: '',
  platform: 'outro',
  display_name: '',
  product_name_contains: '',
  default_role: '',
  recontact_days: '',
  notes: '',
  is_active: true,
};

const Produtos: React.FC = () => {
  const { data: items = [], isLoading } = useProductsCatalog(true);
  const upsert = useUpsertProductCatalog();
  const del = useDeleteProductCatalog();

  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter(p =>
      p.display_name.toLowerCase().includes(s) ||
      (p.product_id || '').toLowerCase().includes(s) ||
      p.product_name_contains.toLowerCase().includes(s) ||
      p.platform.toLowerCase().includes(s)
    );
  }, [items, search]);

  const openCreate = () => {
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (item: ProductCatalogItem) => {
    setForm({
      id: item.id,
      product_id: item.product_id || '',
      platform: item.platform,
      display_name: item.display_name,
      product_name_contains: item.product_name_contains,
      default_role: item.default_role || '',
      recontact_days: item.recontact_days?.toString() || '',
      notes: item.notes || '',
      is_active: item.is_active,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.display_name.trim()) {
      toast.error('Nome de exibição é obrigatório');
      return;
    }
    if (!form.product_name_contains.trim()) {
      toast.error('Preencha "Contém no nome" (usado pra casar a venda)');
      return;
    }
    try {
      await upsert.mutateAsync({
        id: form.id,
        product_id: form.product_id.trim() || null,
        platform: form.platform,
        display_name: form.display_name,
        product_name_contains: form.product_name_contains,
        default_role: form.default_role || null,
        recontact_days: form.recontact_days ? parseInt(form.recontact_days, 10) : null,
        notes: form.notes,
        is_active: form.is_active,
      });
      toast.success(form.id ? 'Produto atualizado' : 'Produto cadastrado');
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    }
  };

  const handleDelete = async (item: ProductCatalogItem) => {
    if (!confirm(`Inativar "${item.display_name}"? Ele deixará de aparecer nos seletores.`)) return;
    try {
      await del.mutateAsync(item.id);
      toast.success('Produto inativado');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao inativar');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" /> Catálogo de Produtos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastre produtos uma única vez aqui (upsells, bumps, e-mail, etc). Eles aparecem nos funis de leads e automações WhatsApp sem precisar criar um funil de tráfego.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Novo Produto
        </Button>
      </div>

      <div className="relative mb-3">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, ID ou plataforma..."
          className="pl-9"
        />
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Produto</th>
              <th className="text-left p-3">ID Plataforma</th>
              <th className="text-left p-3">Plataforma</th>
              <th className="text-left p-3">Papel</th>
              <th className="text-left p-3">Recontato</th>
              <th className="text-left p-3">Status</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">
                {search ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado. Clique em "Novo Produto".'}
              </td></tr>
            )}
            {filtered.map(item => (
              <tr key={item.id} className="border-t border-border hover:bg-muted/30">
                <td className="p-3">
                  <div className="font-medium">{item.display_name}</div>
                  <div className="text-xs text-muted-foreground">Contém: {item.product_name_contains}</div>
                </td>
                <td className="p-3 font-mono text-xs">{item.product_id || '—'}</td>
                <td className="p-3 capitalize">{item.platform}</td>
                <td className="p-3">{item.default_role ? ROLES.find(r => r.value === item.default_role)?.label : '—'}</td>
                <td className="p-3">{item.recontact_days ? `${item.recontact_days}d` : '—'}</td>
                <td className="p-3">
                  {item.is_active
                    ? <Badge variant="secondary">Ativo</Badge>
                    : <Badge variant="outline">Inativo</Badge>}
                </td>
                <td className="p-3 text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {item.is_active && (
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar produto' : 'Novo produto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome de exibição *</Label>
              <Input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Ex: 3 Potes RevitaSoul" />
            </div>
            <div>
              <Label>Contém no nome * <span className="text-xs text-muted-foreground">(usado pra casar a venda)</span></Label>
              <Input value={form.product_name_contains} onChange={e => setForm(f => ({ ...f, product_name_contains: e.target.value }))} placeholder="Ex: 3 potes" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>ID do produto na plataforma</Label>
                <Input value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))} placeholder="opcional" />
              </div>
              <div>
                <Label>Plataforma</Label>
                <Select value={form.platform} onValueChange={(v) => setForm(f => ({ ...f, platform: v as PaymentPlatform }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Papel padrão</Label>
                <Select value={form.default_role || '__none'} onValueChange={(v) => setForm(f => ({ ...f, default_role: v === '__none' ? '' : v as CatalogRole }))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">—</SelectItem>
                    {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dias de recontato</Label>
                <Input type="number" min={1} value={form.recontact_days} onChange={e => setForm(f => ({ ...f, recontact_days: e.target.value }))} placeholder="opcional" />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Produtos;
