import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  useFunnels,
  useCreateFunnel,
  useUpdateFunnel,
  useDeleteFunnel,
  useUpsertFunnelProducts,
  useAddFunnelPlatform,
  useDeleteFunnelPlatform,
  useRegenerateFunnelPlatformToken,
  type Funnel,
  type FunnelProduct,
  type FunnelPlatform,
  type PaymentPlatform,
} from '@/hooks/useFunnels';
import { useDistinctProductNames } from '@/hooks/useDistinctProductNames';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Save, X, Copy, Check, AlertTriangle, RefreshCw, Plug } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ROLE_OPTIONS = [
  { value: 'front', label: 'Front-end' },
  { value: 'order_bump', label: 'Order Bump' },
  { value: 'upsell1', label: 'Upsell 1' },
  { value: 'upsell2', label: 'Upsell 2' },
  { value: 'upsell3', label: 'Upsell 3' },
  { value: 'downsell', label: 'Downsell' },
];

const PLATFORM_OPTIONS: { value: PaymentPlatform; label: string }[] = [
  { value: 'ticto', label: 'Ticto' },
  { value: 'guru', label: 'Guru' },
  { value: 'kiwify', label: 'Kiwify' },
  { value: 'hotmart', label: 'Hotmart' },
  { value: 'eduzz', label: 'Eduzz' },
  { value: 'outro', label: 'Outro' },
];

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];

const SUPABASE_FUNCTIONS_URL = 'https://emfbocpmphtftqcezaib.supabase.co/functions/v1';

function webhookUrlFor(platform: PaymentPlatform, token: string) {
  const fn =
    platform === 'guru'
      ? 'guru-webhook'
      : platform === 'eduzz'
      ? 'eduzz-webhook'
      : 'ticto-webhook';
  return `${SUPABASE_FUNCTIONS_URL}/${fn}?token=${token}`;
}

interface ProductRow {
  id?: string;
  product_id: string;
  product_name_contains: string;
  role: FunnelProduct['role'];
  display_name: string;
  recontact_days: number | null;
  /** '' = todas, 'ticto' | 'guru' | etc */
  platform: '' | PaymentPlatform;
}

interface FunnelFormData {
  name: string;
  description: string;
  color: string;
  meta_account_id: string;
  /** Só usado ao CRIAR um funil novo (vira a 1ª funnel_platform). Ignorado em edição. */
  initial_platform: PaymentPlatform;
}

function emptyForm(): FunnelFormData {
  return { name: '', description: '', color: '#6366f1', meta_account_id: '', initial_platform: 'ticto' };
}

// ────────────────────────────────────────────────────────────
// Webhook URL row (com cópia)
// ────────────────────────────────────────────────────────────
function WebhookUrlRow({ platform, token }: { platform: PaymentPlatform; token: string }) {
  const [copied, setCopied] = useState(false);
  const url = webhookUrlFor(platform, token);

  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded font-mono truncate" title={url}>
        {url}
      </code>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copy}>
        {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Plataformas conectadas (multi)
// ────────────────────────────────────────────────────────────
function PlatformsManager({
  funnelId,
  platforms,
}: {
  funnelId: string;
  platforms: FunnelPlatform[];
}) {
  const addPlatform = useAddFunnelPlatform();
  const deletePlatform = useDeleteFunnelPlatform();
  const regenToken = useRegenerateFunnelPlatformToken();
  const { toast } = useToast();

  const usedPlatforms = new Set(platforms.map((p) => p.platform));
  const availableToAdd = PLATFORM_OPTIONS.filter((o) => !usedPlatforms.has(o.value));
  const [adding, setAdding] = useState<PaymentPlatform | ''>('');

  async function handleAdd(value: PaymentPlatform) {
    try {
      await addPlatform.mutateAsync({ funnelId, platform: value });
      toast({ title: 'Plataforma adicionada' });
      setAdding('');
    } catch (err) {
      toast({ title: 'Erro ao adicionar plataforma', description: String(err), variant: 'destructive' });
    }
  }

  async function handleRegen(p: FunnelPlatform) {
    if (!confirm('Gerar um novo token irá invalidar o webhook atual desta plataforma. Continuar?')) return;
    try {
      await regenToken.mutateAsync({ id: p.id, funnelId });
      toast({ title: 'Token regenerado — atualize na plataforma de pagamento.' });
    } catch (err) {
      toast({ title: 'Erro ao regenerar', description: String(err), variant: 'destructive' });
    }
  }

  async function handleDelete(p: FunnelPlatform) {
    if (!confirm(`Remover ${p.platform} deste funil? O webhook deixará de funcionar.`)) return;
    try {
      await deletePlatform.mutateAsync({ id: p.id, funnelId });
      toast({ title: 'Plataforma removida' });
    } catch (err) {
      toast({ title: 'Erro ao remover', description: String(err), variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Plug className="h-4 w-4" /> Plataformas conectadas
        </Label>
        {availableToAdd.length > 0 && (
          <Select value={adding} onValueChange={(v) => handleAdd(v as PaymentPlatform)}>
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue placeholder="+ Adicionar plataforma" />
            </SelectTrigger>
            <SelectContent>
              {availableToAdd.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Cada plataforma tem seu próprio webhook. As vendas de todas elas são unificadas neste funil
        (KPIs, Resumo, CRM Analytics, Campanhas).
      </p>

      {platforms.length === 0 && (
        <p className="text-xs text-muted-foreground italic">Nenhuma plataforma conectada ainda.</p>
      )}

      <div className="space-y-3">
        {platforms.map((p) => (
          <div key={p.id} className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-xs uppercase">
                {p.platform}
              </Badge>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Regenerar token"
                  onClick={() => handleRegen(p)}
                  disabled={regenToken.isPending}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  title="Remover plataforma"
                  onClick={() => handleDelete(p)}
                  disabled={deletePlatform.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <WebhookUrlRow platform={p.platform} token={p.webhook_token} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Editor de produtos (com filtro por plataforma)
// ────────────────────────────────────────────────────────────
function ProductsEditor({
  products,
  funnelId,
  availablePlatforms,
  onAdd,
  onRemove,
  onUpdate,
  onUpdateRecontact,
}: {
  products: ProductRow[];
  funnelId: string | null;
  availablePlatforms: PaymentPlatform[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onUpdate: (idx: number, field: keyof ProductRow, value: string) => void;
  onUpdateRecontact: (idx: number, val: number | null) => void;
}) {
  useDistinctProductNames(funnelId); // mantém warm cache

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Produtos do Funil</Label>
        <Button variant="ghost" size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Informe o <strong>ID do produto</strong>, o <strong>papel</strong>, um <strong>nome amigável</strong>,
        os <strong>dias de recontato</strong> e a <strong>plataforma</strong> (deixe "Todas" se o ID for igual em todas).
      </p>
      <div className="space-y-2">
        {products.map((p, idx) => (
          <div key={idx} className="flex gap-2 items-center flex-wrap">
            <Input
              className="w-32"
              placeholder="ID do produto"
              value={p.product_id}
              onChange={(e) => onUpdate(idx, 'product_id', e.target.value)}
            />
            <Select value={p.role} onValueChange={(v) => onUpdate(idx, 'role', v)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="flex-1 min-w-[140px]"
              placeholder="Nome amigável"
              value={p.display_name}
              onChange={(e) => onUpdate(idx, 'display_name', e.target.value)}
            />
            <Input
              className="w-16"
              type="number"
              placeholder="Dias"
              title="Dias para recontato após compra"
              value={p.recontact_days ?? ''}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value, 10) : null;
                onUpdateRecontact(idx, val);
              }}
            />
            <Select
              value={p.platform || 'all'}
              onValueChange={(v) => onUpdate(idx, 'platform', v === 'all' ? '' : v)}
            >
              <SelectTrigger className="w-28" title="Plataforma onde este ID se aplica">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(availablePlatforms.length ? availablePlatforms : PLATFORM_OPTIONS.map((o) => o.value)).map((pf) => (
                  <SelectItem key={pf} value={pf}>{pf}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onRemove(idx)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {products.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">Nenhum produto. Clique em "Adicionar" para configurar.</p>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Página principal
// ────────────────────────────────────────────────────────────
export default function FunisConfigurar() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const focusedEditId = searchParams.get('editar');
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

  const editingFunnel = editingId && editingId !== 'new' ? funnels.find((f) => f.id === editingId) : null;
  const editingPlatforms: FunnelPlatform[] = editingFunnel?.funnel_platforms || [];

  useEffect(() => {
    const editarId = searchParams.get('editar');
    if (editarId && funnels.length > 0 && editingId === null) {
      const funnel = funnels.find((f) => f.id === editarId);
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
    const firstPlatform = funnel.funnel_platforms?.[0]?.platform ?? 'ticto';
    setForm({
      name: funnel.name,
      description: funnel.description || '',
      color: funnel.color,
      meta_account_id: funnel.meta_account_id || '',
      initial_platform: firstPlatform,
    });
    setProducts(
      (funnel.funnel_products || []).map((fp) => ({
        id: fp.id,
        product_id: fp.product_id || '',
        product_name_contains: fp.product_name_contains,
        role: fp.role,
        display_name: fp.display_name || '',
        recontact_days: fp.recontact_days,
        platform: (fp.platform as PaymentPlatform) || '',
      })),
    );
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
    setProducts((p) => [
      ...p,
      { product_id: '', product_name_contains: '', role: 'front', display_name: '', recontact_days: null, platform: '' },
    ]);
  }

  function removeProduct(idx: number) {
    setProducts((p) => p.filter((_, i) => i !== idx));
  }

  function updateProduct(idx: number, field: keyof ProductRow, value: string) {
    setProducts((p) => p.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
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
          initial_platform: form.initial_platform,
        });
        funnelId = created.id;
      } else {
        await updateFunnel.mutateAsync({
          id: editingId!,
          name: form.name,
          description: form.description || null,
          color: form.color,
          meta_account_id: form.meta_account_id || null,
        });
        funnelId = editingId!;
      }

      const validProducts = products.filter((p) => p.product_id.trim() || p.product_name_contains.trim());
      await upsertProducts.mutateAsync({
        funnelId,
        products: validProducts.map((p) => ({
          product_id: p.product_id.trim() || null,
          product_name_contains: p.product_name_contains.trim() || p.display_name.trim() || p.product_id.trim(),
          role: p.role,
          display_name: p.display_name.trim() || null,
          recontact_days: p.recontact_days,
          platform: p.platform || null,
        })),
      });

      toast({ title: 'Funil salvo com sucesso!' });
      setEditingId(null);
    } catch (err) {
      toast({ title: 'Erro ao salvar', description: String(err), variant: 'destructive' });
    }
  }

  if (isLoading) return <div className="text-muted-foreground p-8">Carregando...</div>;

  const platformsForProducts: PaymentPlatform[] = editingPlatforms.length
    ? editingPlatforms.map((p) => p.platform)
    : [form.initial_platform];

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

      {editingId && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">{editingId === 'new' ? 'Novo Funil' : 'Editar Funil'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-1">
                <Label>Nome do Funil</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Guia de Tinturas" />
              </div>
              <div className="space-y-1">
                <Label>Cor</Label>
                <div className="flex gap-1.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setForm((f) => ({ ...f, color: c }))}
                      className={`h-7 w-7 rounded-full border-2 transition-all ${form.color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Descrição <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Funil principal de lançamento..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {editingId === 'new' && (
                <div className="space-y-1">
                  <Label>Plataforma Inicial</Label>
                  <Select value={form.initial_platform} onValueChange={(v) => setForm((f) => ({ ...f, initial_platform: v as PaymentPlatform }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORM_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Cria o 1º webhook. Depois você adiciona mais plataformas abaixo.
                  </p>
                </div>
              )}
              <div className="space-y-1">
                <Label>ID(s) da Conta Meta <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Input value={form.meta_account_id} onChange={(e) => setForm((f) => ({ ...f, meta_account_id: e.target.value }))} placeholder="283978142234803, 120214567890123" />
                <p className="text-xs text-muted-foreground">Separe múltiplas contas por vírgula. Sem "act_".</p>
              </div>
            </div>

            {/* Plataformas conectadas — só aparece após salvar (precisa do funnelId) */}
            {editingId !== 'new' && (
              <div className="pt-2 border-t border-border">
                <PlatformsManager funnelId={editingId} platforms={editingPlatforms} />
              </div>
            )}

            <div className="pt-2 border-t border-border">
              <ProductsEditor
                products={products}
                funnelId={editingId !== 'new' ? editingId : null}
                availablePlatforms={platformsForProducts}
                onAdd={addProduct}
                onRemove={removeProduct}
                onUpdate={updateProduct}
                onUpdateRecontact={(idx, val) => setProducts((prev) => prev.map((row, i) => (i === idx ? { ...row, recontact_days: val } : row)))}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={createFunnel.isPending || updateFunnel.isPending}>
                <Save className="h-4 w-4 mr-2" /> Salvar
              </Button>
              <Button variant="outline" onClick={cancelEdit}>
                <X className="h-4 w-4 mr-2" /> Cancelar
              </Button>
            </div>

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

      {/* Lista de funis */}
      <div className="space-y-3">
        {funnels.map((funnel) => {
          const platforms = funnel.funnel_platforms || [];
          const platformList: { platform: PaymentPlatform; token: string; id?: string }[] =
            platforms.map((p) => ({ platform: p.platform, token: p.webhook_token, id: p.id }));

          return (
            <Card key={funnel.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="h-4 w-4 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: funnel.color }} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{funnel.name}</span>
                        {platformList.map((p) => (
                          <Badge key={p.platform} variant="outline" className="text-xs">
                            {p.platform}
                          </Badge>
                        ))}
                        {funnel.meta_account_id && (
                          <Badge variant="secondary" className="text-xs font-mono">{funnel.meta_account_id}</Badge>
                        )}
                      </div>
                      {funnel.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{funnel.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(funnel.funnel_products || []).map((fp) => (
                          <Badge key={fp.id} variant="secondary" className="text-xs">
                            {fp.display_name || fp.product_name_contains} — {ROLE_OPTIONS.find((r) => r.value === fp.role)?.label}
                            {fp.platform ? ` · ${fp.platform}` : ''}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => startEdit(funnel)} disabled={editingId !== null}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                  </Button>
                </div>

                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <Label className="text-xs text-muted-foreground">Webhooks ativos</Label>
                  {platformList.map((p) => (
                    <div key={p.platform} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase shrink-0 w-16 justify-center">
                        {p.platform}
                      </Badge>
                      <WebhookUrlRow platform={p.platform} token={p.token} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}

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
