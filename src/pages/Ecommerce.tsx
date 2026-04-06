import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase as _supabase } from '@/integrations/supabase/client';
const supabase = _supabase as any;
import { dayStartISO, dayEndISO } from '@/lib/dateUtils';
import { Button } from '@/components/ui/button';
import { SkeletonCard } from '@/components/dashboard/SkeletonCard';
import {
  Package, FlaskConical, Hammer, History, Plus, Pencil, Trash2,
  AlertTriangle, CheckCircle, XCircle, X, Save, Tag,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  sku: string | null;
  active: boolean;
  current_stock: number;
  min_stock_alert: number;
  stock_potes: number;
  min_potes: number;
  stock_etiquetas: number;
  min_etiquetas: number;
  created_at: string;
}

interface OfferMapping {
  id: string;
  product_id: string;
  platform: string;
  offer_name: string;
  quantity: number;
  external_product_id: string | null;
}

interface CostConfig {
  id: string;
  product_id: string;
  sale_price: number;
  platform_fee_pct: number;
  shipping_admin_cost: number;
  tax_pct: number;
  cost_supplement: number;
  cost_bottle: number;
  cost_label: number;
}

interface Movement {
  id: string;
  product_id: string;
  type: string;
  quantity: number;
  source: string;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
  physical_products?: { name: string };
}

// ─── Helpers ─────────────────────────────────────────────────────
function stockStatus(current: number, min: number): 'ok' | 'warning' | 'critical' {
  if (current <= 0) return 'critical';
  if (current <= min) return 'warning';
  return 'ok';
}

function StatusIcon({ status }: { status: 'ok' | 'warning' | 'critical' }) {
  if (status === 'ok') return <CheckCircle className="h-4 w-4 text-kpi-positive" />;
  if (status === 'warning') return <AlertTriangle className="h-4 w-4 text-kpi-warning" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

function StatusBadge({ status, label }: { status: 'ok' | 'warning' | 'critical'; label: string }) {
  const colors = {
    ok: 'text-kpi-positive bg-kpi-positive/10 border-kpi-positive/20',
    warning: 'text-kpi-warning bg-kpi-warning/10 border-kpi-warning/20',
    critical: 'text-destructive bg-destructive/10 border-destructive/20',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${colors[status]}`}>
      <StatusIcon status={status} />
      {label}
    </span>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────
function useProducts() {
  return useQuery({
    queryKey: ['physical_products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('physical_products')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Product[];
    },
  });
}

function useOfferMappings() {
  return useQuery({
    queryKey: ['offer_mappings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_offer_mappings')
        .select('*')
        .order('offer_name');
      if (error) throw error;
      return data as OfferMapping[];
    },
  });
}

function useCostConfigs() {
  return useQuery({
    queryKey: ['product_cost_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('product_cost_config').select('*');
      if (error) throw error;
      return data as CostConfig[];
    },
  });
}

function useMovements() {
  return useQuery({
    queryKey: ['inventory_movements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*, physical_products(name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Movement[];
    },
  });
}

function useDailySalesRate() {
  return useQuery({
    queryKey: ['daily_sales_rate_ecommerce'],
    queryFn: async () => {
      const nowBRT = new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
      const dateTo = nowBRT.toISOString().split('T')[0];
      const d30 = new Date(nowBRT); d30.setDate(d30.getDate() - 29);
      const dateFrom = d30.toISOString().split('T')[0];

      const { data: mappings } = await supabase
        .from('product_offer_mappings')
        .select('product_id, offer_name, quantity');

      const { data: salesData } = await supabase
        .from('v_all_sales')
        .select('product_name')
        .eq('status', 'authorized')
        .gte('purchased_at', dayStartISO(dateFrom))
        .lte('purchased_at', dayEndISO(dateTo));

      const allSales = salesData || [];
      const mappingMap: Record<string, { product_id: string; quantity: number }> = {};
      for (const m of mappings || []) {
        mappingMap[m.offer_name.toLowerCase()] = { product_id: m.product_id, quantity: m.quantity };
      }

      const unitsSold: Record<string, number> = {};
      for (const sale of allSales) {
        const key = (sale.product_name || '').toLowerCase();
        const match = mappingMap[key];
        if (match) {
          unitsSold[match.product_id] = (unitsSold[match.product_id] || 0) + match.quantity;
        }
      }

      const dailyRate: Record<string, number> = {};
      for (const [pid, total] of Object.entries(unitsSold)) {
        dailyRate[pid] = total / 30;
      }
      return dailyRate;
    },
  });
}

// ─── Overview Tab ─────────────────────────────────────────────────
function OverviewTab() {
  const { data: products = [], isLoading } = useProducts();
  const { data: costConfigs = [] } = useCostConfigs();
  const { data: dailyRate = {} } = useDailySalesRate();
  const qc = useQueryClient();

  const [entradaModal, setEntradaModal] = useState<{ product: Product; field: 'produto' | 'potes' | 'etiquetas' } | null>(null);
  const [entradaQty, setEntradaQty] = useState('');
  const [entradaNotes, setEntradaNotes] = useState('');
  const [producaoModal, setProducaoModal] = useState<Product | null>(null);
  const [producaoQty, setProducaoQty] = useState('');
  const [producaoNotes, setProducaoNotes] = useState('');

  const entradaMutation = useMutation({
    mutationFn: async ({ product, field, qty, notes }: { product: Product; field: 'produto' | 'potes' | 'etiquetas'; qty: number; notes: string }) => {
      if (field === 'produto') {
        const { error: mvErr } = await supabase.from('inventory_movements').insert({
          product_id: product.id, type: 'in', quantity: qty, source: 'manual', notes: notes || null,
        });
        if (mvErr) throw mvErr;
        const { error } = await supabase
          .from('physical_products')
          .update({ current_stock: product.current_stock + qty, updated_at: new Date().toISOString() })
          .eq('id', product.id);
        if (error) throw error;
      } else if (field === 'potes') {
        const { error } = await supabase
          .from('physical_products')
          .update({ stock_potes: product.stock_potes + qty, updated_at: new Date().toISOString() })
          .eq('id', product.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('physical_products')
          .update({ stock_etiquetas: product.stock_etiquetas + qty, updated_at: new Date().toISOString() })
          .eq('id', product.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['physical_products'] });
      qc.invalidateQueries({ queryKey: ['inventory_movements'] });
      setEntradaModal(null);
      setEntradaQty('');
      setEntradaNotes('');
    },
  });

  const producaoMutation = useMutation({
    mutationFn: async ({ product, qty, notes }: { product: Product; qty: number; notes: string }) => {
      const maxProd = Math.min(product.stock_potes, product.stock_etiquetas);
      const finalQty = Math.min(qty, maxProd);
      if (finalQty <= 0) throw new Error('Sem insumos suficientes para produzir');

      const { error: upErr } = await supabase.from('physical_products').update({
        current_stock: product.current_stock + finalQty,
        stock_potes: product.stock_potes - finalQty,
        stock_etiquetas: product.stock_etiquetas - finalQty,
        updated_at: new Date().toISOString(),
      }).eq('id', product.id);
      if (upErr) throw upErr;

      const { error: mvErr } = await supabase.from('inventory_movements').insert({
        product_id: product.id, type: 'production', quantity: finalQty,
        source: 'Produção manual', reference_id: `PROD-${Date.now()}`,
        notes: notes || `Produção de ${finalQty} unidades`,
      });
      if (mvErr) throw mvErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['physical_products'] });
      qc.invalidateQueries({ queryKey: ['inventory_movements'] });
      setProducaoModal(null);
      setProducaoQty('');
      setProducaoNotes('');
    },
  });

  if (isLoading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[0, 1].map(i => <SkeletonCard key={i} />)}
    </div>
  );

  if (products.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <Package className="h-10 w-10 opacity-30" />
      <p className="text-sm">Nenhum produto cadastrado.</p>
      <p className="text-xs">Vá até a aba "Produtos" para cadastrar.</p>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {products.filter(p => p.active).map(p => {
          const statusProduto = stockStatus(p.current_stock, p.min_stock_alert);
          const statusPotes = stockStatus(p.stock_potes, p.min_potes);
          const statusEtiquetas = stockStatus(p.stock_etiquetas, p.min_etiquetas);
          const rate = dailyRate[p.id] || 0;
          const daysLeft = rate > 0 ? Math.floor(p.current_stock / rate) : null;
          const cfg = costConfigs.find(c => c.product_id === p.id);
          const totalCOGS = (cfg?.cost_supplement || 0) + (cfg?.cost_bottle || 0) + (cfg?.cost_label || 0) + (cfg?.shipping_admin_cost || 0);
          const afterFeePrice = cfg ? cfg.sale_price * (1 - cfg.platform_fee_pct / 100) : 0;
          const netMargin = cfg ? afterFeePrice * (1 - cfg.tax_pct / 100) - totalCOGS : 0;

          const hasCritical = statusProduto === 'critical' || statusPotes === 'critical' || statusEtiquetas === 'critical';
          const hasWarning = statusProduto === 'warning' || statusPotes === 'warning' || statusEtiquetas === 'warning';
          const borderColor = hasCritical ? 'border-destructive/30' : hasWarning ? 'border-kpi-warning/30' : 'border-kpi-positive/30';
          const bgColor = hasCritical ? 'bg-destructive/5' : hasWarning ? 'bg-kpi-warning/5' : 'bg-kpi-positive/5';

          return (
            <div key={p.id} className={`rounded-lg border p-4 space-y-3 ${borderColor} ${bgColor}`}>
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm">{p.name}</p>
                  {p.sku && <p className="text-xs text-muted-foreground">SKU: {p.sku}</p>}
                </div>
                {daysLeft !== null && (
                  <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                    ~{daysLeft} dias de estoque
                  </span>
                )}
              </div>

              {/* Stock grid */}
              <div className="grid grid-cols-3 gap-2">
                {/* Produto acabado */}
                <button
                  onClick={() => setEntradaModal({ product: p, field: 'produto' })}
                  className="rounded-md bg-card border border-border p-2 text-center hover:border-primary/50 transition-colors group"
                >
                  <div className="flex justify-center mb-1"><StatusIcon status={statusProduto} /></div>
                  <p className="text-lg font-bold">{p.current_stock}</p>
                  <p className="text-xs text-muted-foreground">produto</p>
                  <p className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">+ entrada</p>
                </button>

                {/* Potes */}
                <button
                  onClick={() => setEntradaModal({ product: p, field: 'potes' })}
                  className="rounded-md bg-card border border-border p-2 text-center hover:border-primary/50 transition-colors group"
                >
                  <div className="flex justify-center mb-1"><StatusIcon status={statusPotes} /></div>
                  <p className="text-lg font-bold">{p.stock_potes}</p>
                  <p className="text-xs text-muted-foreground">potes</p>
                  <p className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">+ entrada</p>
                </button>

                {/* Etiquetas */}
                <button
                  onClick={() => setEntradaModal({ product: p, field: 'etiquetas' })}
                  className="rounded-md bg-card border border-border p-2 text-center hover:border-primary/50 transition-colors group"
                >
                  <div className="flex justify-center mb-1"><StatusIcon status={statusEtiquetas} /></div>
                  <p className="text-lg font-bold">{p.stock_etiquetas}</p>
                  <p className="text-xs text-muted-foreground">etiquetas</p>
                  <p className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">+ entrada</p>
                </button>
              </div>

              {/* Produzível */}
              {(() => {
                const produzivel = Math.min(p.stock_potes, p.stock_etiquetas);
                return (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      <Hammer className="h-3 w-3 inline mr-1" />
                      Produzível: <strong className="text-foreground">{produzivel} un</strong>
                    </span>
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      disabled={produzivel <= 0}
                      onClick={() => setProducaoModal(p)}>
                      <Hammer className="h-3 w-3 mr-1" />Registrar Produção
                    </Button>
                  </div>
                );
              })()}

              {/* Alertas */}
              <div className="flex flex-wrap gap-1.5">
                {statusProduto !== 'ok' && (
                  <StatusBadge status={statusProduto} label={`Produto: ${p.current_stock}/${p.min_stock_alert} un`} />
                )}
                {statusPotes !== 'ok' && (
                  <StatusBadge status={statusPotes} label={`Potes: ${p.stock_potes}/${p.min_potes}`} />
                )}
                {statusEtiquetas !== 'ok' && (
                  <StatusBadge status={statusEtiquetas} label={`Etiquetas: ${p.stock_etiquetas}/${p.min_etiquetas}`} />
                )}
              </div>

              {/* Margem */}
              {netMargin > 0 && (
                <p className="text-xs text-muted-foreground">
                  Margem líquida: <span className="font-semibold text-kpi-positive">R${netMargin.toFixed(2)}/un</span>
                  {cfg && <span> · Venda: R${cfg.sale_price.toFixed(2)}</span>}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal entrada */}
      {entradaModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">
                Entrada de {entradaModal.field === 'produto' ? 'produto acabado' : entradaModal.field} — {entradaModal.product.name}
              </h3>
              <button onClick={() => setEntradaModal(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Quantidade</label>
                <input type="number" min="1" value={entradaQty}
                  onChange={e => setEntradaQty(e.target.value)}
                  className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Ex: 500" autoFocus />
              </div>
              {entradaModal.field === 'produto' && (
                <div>
                  <label className="text-xs text-muted-foreground">Observação (opcional)</label>
                  <input type="text" value={entradaNotes}
                    onChange={e => setEntradaNotes(e.target.value)}
                    className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Ex: Lote #42" />
                </div>
              )}
            </div>
            <Button className="w-full" disabled={!entradaQty || entradaMutation.isPending}
              onClick={() => entradaMutation.mutate({
                product: entradaModal.product,
                field: entradaModal.field,
                qty: parseInt(entradaQty),
                notes: entradaNotes,
              })}>
              {entradaMutation.isPending ? 'Salvando...' : 'Confirmar Entrada'}
            </Button>
            {entradaMutation.isError && (
              <p className="text-xs text-destructive">❌ {(entradaMutation.error as Error)?.message}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Products Tab ─────────────────────────────────────────────────
function ProductsTab() {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useProducts();
  const { data: allMappings = [] } = useOfferMappings();
  const { data: costConfigs = [] } = useCostConfigs();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);

  const emptyForm = { name: '', sku: '', min_stock_alert: '50', current_stock: '0', stock_potes: '0', min_potes: '50', stock_etiquetas: '0', min_etiquetas: '50' };
  const emptyCost = { sale_price: '', platform_fee_pct: '', shipping_admin_cost: '', tax_pct: '', cost_supplement: '', cost_bottle: '', cost_label: '' };

  const [form, setForm] = useState(emptyForm);
  const [costForm, setCostForm] = useState(emptyCost);
  const [newMapping, setNewMapping] = useState({ offer_name: '', quantity: '1', platform: 'both', external_product_id: '' });

  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const productPayload = {
        name: form.name,
        sku: form.sku || null,
        min_stock_alert: parseInt(form.min_stock_alert),
        stock_potes: parseInt(form.stock_potes || '0'),
        min_potes: parseInt(form.min_potes || '50'),
        stock_etiquetas: parseInt(form.stock_etiquetas || '0'),
        min_etiquetas: parseInt(form.min_etiquetas || '50'),
        updated_at: new Date().toISOString(),
      };

      let productId = editProduct?.id;

      if (editProduct) {
        const { error } = await supabase.from('physical_products').update({
          ...productPayload,
          current_stock: parseInt(form.current_stock || '0'),
        }).eq('id', editProduct.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('physical_products')
          .insert({ ...productPayload, user_id: user.id, current_stock: parseInt(form.current_stock) })
          .select().single();
        if (error) throw error;
        productId = data.id;
      }

      if (productId) {
        const hasCost = costForm.sale_price || costForm.cost_supplement || costForm.cost_bottle || costForm.cost_label;
        if (hasCost) {
          const costPayload = {
            product_id: productId,
            sale_price: parseFloat(costForm.sale_price || '0'),
            platform_fee_pct: parseFloat(costForm.platform_fee_pct || '0'),
            shipping_admin_cost: parseFloat(costForm.shipping_admin_cost || '0'),
            tax_pct: parseFloat(costForm.tax_pct || '0'),
            cost_supplement: parseFloat(costForm.cost_supplement || '0'),
            cost_bottle: parseFloat(costForm.cost_bottle || '0'),
            cost_label: parseFloat(costForm.cost_label || '0'),
            updated_at: new Date().toISOString(),
          };
          const { error: ce } = await supabase.from('product_cost_config')
            .upsert(costPayload, { onConflict: 'product_id' });
          if (ce) throw ce;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['physical_products'] });
      qc.invalidateQueries({ queryKey: ['product_cost_config'] });
      qc.invalidateQueries({ queryKey: ['daily_sales_rate_ecommerce'] });
      setShowForm(false);
      setEditProduct(null);
      setForm(emptyForm);
      setCostForm(emptyCost);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('physical_products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['physical_products'] }),
  });

  const addMappingMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase.from('product_offer_mappings').insert({
        product_id: productId, offer_name: newMapping.offer_name,
        quantity: parseInt(newMapping.quantity), platform: newMapping.platform,
        external_product_id: newMapping.external_product_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offer_mappings'] });
      setNewMapping({ offer_name: '', quantity: '1', platform: 'both', external_product_id: '' });
    },
  });

  const deleteMappingMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('product_offer_mappings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offer_mappings'] }),
  });

  function openEdit(p: Product) {
    const cfg = costConfigs.find(c => c.product_id === p.id);
    setEditProduct(p);
    setForm({
      name: p.name, sku: p.sku || '',
      min_stock_alert: String(p.min_stock_alert),
      current_stock: String(p.current_stock),
      stock_potes: String(p.stock_potes),
      min_potes: String(p.min_potes),
      stock_etiquetas: String(p.stock_etiquetas),
      min_etiquetas: String(p.min_etiquetas),
    });
    setCostForm({
      sale_price: cfg ? String(cfg.sale_price) : '',
      platform_fee_pct: cfg ? String(cfg.platform_fee_pct) : '',
      shipping_admin_cost: cfg ? String(cfg.shipping_admin_cost) : '',
      tax_pct: cfg ? String(cfg.tax_pct) : '',
      cost_supplement: cfg ? String(cfg.cost_supplement) : '',
      cost_bottle: cfg ? String(cfg.cost_bottle) : '',
      cost_label: cfg ? String(cfg.cost_label) : '',
    });
    setShowForm(true);
  }

  function openNew() {
    setEditProduct(null);
    setForm(emptyForm);
    setCostForm(emptyCost);
    setShowForm(true);
  }

  if (isLoading) return <div className="space-y-3">{[0,1].map(i => <SkeletonCard key={i} />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1.5" />Novo Produto
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{editProduct ? 'Editar produto' : 'Novo produto'}</h3>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4" /></button>
          </div>

          {/* Dados básicos */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Nome do produto *</label>
              <input className={`${inputCls} mt-1`} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Articulabem" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">SKU</label>
              <input className={`${inputCls} mt-1`} value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="ART-001" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{editProduct ? 'Produto acabado (estoque atual)' : 'Produto acabado (estoque inicial)'}</label>
              <input type="number" className={`${inputCls} mt-1`} value={form.current_stock}
                onChange={e => setForm(f => ({ ...f, current_stock: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Alerta mínimo — produto (un)</label>
              <input type="number" className={`${inputCls} mt-1`} value={form.min_stock_alert}
                onChange={e => setForm(f => ({ ...f, min_stock_alert: e.target.value }))} />
            </div>
          </div>

          {/* Potes & Etiquetas */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Estoque de Insumos</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Potes em estoque</label>
                <input type="number" className={`${inputCls} mt-1`} value={form.stock_potes}
                  onChange={e => setForm(f => ({ ...f, stock_potes: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Alerta mínimo — potes</label>
                <input type="number" className={`${inputCls} mt-1`} value={form.min_potes}
                  onChange={e => setForm(f => ({ ...f, min_potes: e.target.value }))} placeholder="50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Etiquetas em estoque</label>
                <input type="number" className={`${inputCls} mt-1`} value={form.stock_etiquetas}
                  onChange={e => setForm(f => ({ ...f, stock_etiquetas: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Alerta mínimo — etiquetas</label>
                <input type="number" className={`${inputCls} mt-1`} value={form.min_etiquetas}
                  onChange={e => setForm(f => ({ ...f, min_etiquetas: e.target.value }))} placeholder="50" />
              </div>
            </div>
          </div>

          {/* Custos & Preço */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Custos & Preço</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Preço de venda (R$)</label>
                <input type="number" className={`${inputCls} mt-1`} value={costForm.sale_price}
                  onChange={e => setCostForm(f => ({ ...f, sale_price: e.target.value }))} placeholder="127.00" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Taxa plataforma (%)</label>
                <input type="number" className={`${inputCls} mt-1`} value={costForm.platform_fee_pct}
                  onChange={e => setCostForm(f => ({ ...f, platform_fee_pct: e.target.value }))} placeholder="10" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Imposto médio (%)</label>
                <input type="number" className={`${inputCls} mt-1`} value={costForm.tax_pct}
                  onChange={e => setCostForm(f => ({ ...f, tax_pct: e.target.value }))} placeholder="6" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Frete / admin (R$)</label>
                <input type="number" className={`${inputCls} mt-1`} value={costForm.shipping_admin_cost}
                  onChange={e => setCostForm(f => ({ ...f, shipping_admin_cost: e.target.value }))} placeholder="8.00" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Custo do suplemento (R$)</label>
                <input type="number" className={`${inputCls} mt-1`} value={costForm.cost_supplement}
                  onChange={e => setCostForm(f => ({ ...f, cost_supplement: e.target.value }))} placeholder="25.00" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Custo do pote (R$)</label>
                <input type="number" className={`${inputCls} mt-1`} value={costForm.cost_bottle}
                  onChange={e => setCostForm(f => ({ ...f, cost_bottle: e.target.value }))} placeholder="4.50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Custo da etiqueta (R$)</label>
                <input type="number" className={`${inputCls} mt-1`} value={costForm.cost_label}
                  onChange={e => setCostForm(f => ({ ...f, cost_label: e.target.value }))} placeholder="1.20" />
              </div>
            </div>
          </div>

          <Button className="w-full" disabled={!form.name || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            <Save className="h-4 w-4 mr-1.5" />
            {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
          {saveMutation.isError && (
            <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              ❌ {(saveMutation.error as Error)?.message}
            </p>
          )}
          {saveMutation.isSuccess && (
            <p className="text-xs text-kpi-positive bg-kpi-positive/10 border border-kpi-positive/20 rounded-lg px-3 py-2">
              ✅ Produto salvo com sucesso!
            </p>
          )}
        </div>
      )}

      {/* Product list */}
      {products.map(p => {
        const mappings = allMappings.filter(m => m.product_id === p.id);
        const cfg = costConfigs.find(c => c.product_id === p.id);
        const isExpanded = expanded === p.id;
        const statusPotes = stockStatus(p.stock_potes, p.min_potes);
        const statusEtiquetas = stockStatus(p.stock_etiquetas, p.min_etiquetas);

        return (
          <div key={p.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium text-sm">{p.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{p.current_stock} un acabadas</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className={`text-xs flex items-center gap-0.5 ${statusPotes === 'ok' ? 'text-muted-foreground' : statusPotes === 'warning' ? 'text-kpi-warning' : 'text-destructive'}`}>
                      <StatusIcon status={statusPotes} />
                      {p.stock_potes} potes
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className={`text-xs flex items-center gap-0.5 ${statusEtiquetas === 'ok' ? 'text-muted-foreground' : statusEtiquetas === 'warning' ? 'text-kpi-warning' : 'text-destructive'}`}>
                      <StatusIcon status={statusEtiquetas} />
                      {p.stock_etiquetas} etiquetas
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                  onClick={() => { if (confirm(`Deletar ${p.name}?`)) deleteMutation.mutate(p.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setExpanded(isExpanded ? null : p.id)}>
                  <Tag className="h-3.5 w-3.5" />
                  <span className="text-xs ml-1">Ofertas</span>
                </Button>
              </div>
            </div>

            {/* Custos resumo */}
            {cfg && (
              <div className="border-t border-border/50 px-4 py-2 bg-muted/10 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Venda: <strong className="text-foreground">R${cfg.sale_price}</strong></span>
                <span>Suplemento: <strong className="text-foreground">R${cfg.cost_supplement}</strong></span>
                <span>Pote: <strong className="text-foreground">R${cfg.cost_bottle}</strong></span>
                <span>Etiqueta: <strong className="text-foreground">R${cfg.cost_label}</strong></span>
                {(() => {
                  const cogs = cfg.cost_supplement + cfg.cost_bottle + cfg.cost_label + cfg.shipping_admin_cost;
                  const net = cfg.sale_price * (1 - cfg.platform_fee_pct / 100) * (1 - cfg.tax_pct / 100) - cogs;
                  return net > 0 ? <span className="text-kpi-positive font-semibold">Margem: R${net.toFixed(2)}</span> : null;
                })()}
              </div>
            )}

            {/* Ofertas (mapeamento) */}
            {isExpanded && (
              <div className="border-t border-border px-4 py-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Ofertas — matching automático com vendas
                </p>
                <div className="space-y-1">
                  {mappings.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">Nenhuma oferta mapeada.</p>
                  )}
                  {mappings.map(m => (
                    <div key={m.id} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-1.5 text-xs">
                      <span>
                        {m.external_product_id && <span className="font-mono text-muted-foreground mr-1">[{m.external_product_id}]</span>}
                        "{m.offer_name}"
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">→ {m.quantity} un · {m.platform}</span>
                        <button onClick={() => deleteMappingMutation.mutate(m.id)} className="text-destructive/60 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <input className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                    value={newMapping.external_product_id} onChange={e => setNewMapping(n => ({ ...n, external_product_id: e.target.value }))}
                    placeholder='ID do produto' />
                  <input className="flex-1 min-w-[180px] rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    value={newMapping.offer_name} onChange={e => setNewMapping(n => ({ ...n, offer_name: e.target.value }))}
                    placeholder='Nome exato na plataforma (fallback)' />
                  <input type="number" min="1" className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none"
                    value={newMapping.quantity} onChange={e => setNewMapping(n => ({ ...n, quantity: e.target.value }))} placeholder="Qtd" />
                  <select className="rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none"
                    value={newMapping.platform} onChange={e => setNewMapping(n => ({ ...n, platform: e.target.value }))}>
                    <option value="both">Ambas</option>
                    <option value="guru">Guru</option>
                    <option value="ticto">Ticto</option>
                    <option value="eduzz">Eduzz</option>
                  </select>
                  <Button size="sm" disabled={(!newMapping.offer_name && !newMapping.external_product_id) || addMappingMutation.isPending}
                    onClick={() => addMappingMutation.mutate(p.id)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {addMappingMutation.isError && (
                  <p className="text-xs text-destructive">❌ {(addMappingMutation.error as Error)?.message}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Assembly Tab ─────────────────────────────────────────────────
function AssemblyTab() {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();

  const [selectedProduct, setSelectedProduct] = useState('');
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');

  const product = products.find(p => p.id === selectedProduct);
  const qtyNum = parseInt(qty) || 0;

  const assembleMutation = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error('Produto não selecionado');
      const batchRef = `PROD-${Date.now()}`;

      // Desconta potes e etiquetas
      const { error: pe } = await supabase.from('physical_products').update({
        stock_potes: Math.max(0, product.stock_potes - qtyNum),
        stock_etiquetas: Math.max(0, product.stock_etiquetas - qtyNum),
        current_stock: product.current_stock + qtyNum,
        updated_at: new Date().toISOString(),
      }).eq('id', product.id);
      if (pe) throw pe;

      // Registra movimento
      const { error: me } = await supabase.from('inventory_movements').insert({
        product_id: product.id, type: 'production', quantity: qtyNum,
        source: 'production', reference_id: batchRef, notes: notes || null,
      });
      if (me) throw me;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['physical_products'] });
      qc.invalidateQueries({ queryKey: ['inventory_movements'] });
      setQty('');
      setNotes('');
    },
  });

  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="max-w-lg space-y-4">
      <p className="text-sm text-muted-foreground">
        Registre a montagem de um lote: o sistema deduz potes e etiquetas do estoque e adiciona ao produto acabado.
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Produto</label>
          <select className={`${inputCls} mt-1`} value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
            <option value="">Selecione...</option>
            {products.filter(p => p.active).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {selectedProduct && (
          <div>
            <label className="text-xs text-muted-foreground">Quantidade a montar</label>
            <input type="number" min="1" className={`${inputCls} mt-1`} value={qty}
              onChange={e => setQty(e.target.value)} placeholder="Ex: 100" />
          </div>
        )}

        {product && qtyNum > 0 && (
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resumo da montagem</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Potes usados</span>
                <span className={product.stock_potes >= qtyNum ? 'text-kpi-positive' : 'text-destructive font-medium'}>
                  -{qtyNum} → {product.stock_potes - qtyNum} restantes
                  {product.stock_potes < qtyNum && ' ⚠️ insuficiente'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Etiquetas usadas</span>
                <span className={product.stock_etiquetas >= qtyNum ? 'text-kpi-positive' : 'text-destructive font-medium'}>
                  -{qtyNum} → {product.stock_etiquetas - qtyNum} restantes
                  {product.stock_etiquetas < qtyNum && ' ⚠️ insuficiente'}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-border font-medium">
                <span>Produto acabado</span>
                <span className="text-kpi-positive">+{qtyNum} → {product.current_stock + qtyNum} unidades</span>
              </div>
            </div>
          </div>
        )}

        {selectedProduct && (
          <div>
            <label className="text-xs text-muted-foreground">Observação (opcional)</label>
            <input className={`${inputCls} mt-1`} value={notes}
              onChange={e => setNotes(e.target.value)} placeholder="Ex: Lote #12" />
          </div>
        )}

        <Button className="w-full" disabled={!selectedProduct || !qty || assembleMutation.isPending}
          onClick={() => assembleMutation.mutate()}>
          <Hammer className="h-4 w-4 mr-1.5" />
          {assembleMutation.isPending ? 'Registrando...' : 'Registrar Montagem'}
        </Button>
        {assembleMutation.isError && (
          <p className="text-xs text-destructive">❌ {(assembleMutation.error as Error)?.message}</p>
        )}
        {assembleMutation.isSuccess && (
          <p className="text-xs text-kpi-positive">✅ Montagem registrada com sucesso.</p>
        )}
      </div>
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────
function HistoryTab() {
  const { data: movements = [], isLoading } = useMovements();

  const typeLabel: Record<string, string> = {
    in: '📦 Entrada', out: '📤 Saída', adjustment: '✏️ Ajuste', production: '🔨 Montagem',
  };
  const sourceLabel: Record<string, string> = {
    manual: 'Manual', ticto_sale: 'Venda Ticto', guru_sale: 'Venda Guru', production: 'Montagem',
  };

  if (isLoading) return <SkeletonCard />;

  if (movements.length === 0) return (
    <p className="text-sm text-muted-foreground py-8 text-center">Nenhum movimento registrado.</p>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="text-left py-2 pr-4">Data</th>
            <th className="text-left py-2 pr-4">Produto</th>
            <th className="text-left py-2 pr-4">Tipo</th>
            <th className="text-right py-2 pr-4">Qtd</th>
            <th className="text-left py-2 pr-4">Origem</th>
            <th className="text-left py-2">Observação</th>
          </tr>
        </thead>
        <tbody>
          {movements.map(m => (
            <tr key={m.id} className="border-b border-border/50 hover:bg-muted/20">
              <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                {new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="py-2 pr-4 font-medium">{(m as any).physical_products?.name || '—'}</td>
              <td className="py-2 pr-4">{typeLabel[m.type] || m.type}</td>
              <td className={`py-2 pr-4 text-right font-medium ${m.quantity > 0 ? 'text-kpi-positive' : 'text-destructive'}`}>
                {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
              </td>
              <td className="py-2 pr-4 text-xs text-muted-foreground">{sourceLabel[m.source] || m.source}</td>
              <td className="py-2 text-xs text-muted-foreground">{m.notes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
type Tab = 'overview' | 'products' | 'assembly' | 'history';

export default function Ecommerce() {
  const [tab, setTab] = useState<Tab>('overview');

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'overview',  label: 'Visão Geral', icon: Package },
    { key: 'products',  label: 'Produtos',    icon: FlaskConical },
    { key: 'assembly',  label: 'Montagem',    icon: Hammer },
    { key: 'history',   label: 'Movimentos',  icon: History },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Ecommerce</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Controle de estoque, insumos e custos dos suplementos físicos
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'overview'  && <OverviewTab />}
        {tab === 'products'  && <ProductsTab />}
        {tab === 'assembly'  && <AssemblyTab />}
        {tab === 'history'   && <HistoryTab />}
      </div>
    </div>
  );
}
