import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Link2, Package } from 'lucide-react';
import { toast } from 'sonner';
import type { LeadFunnelProduct } from '@/hooks/useLeadFunnelProducts';
import type { FunnelProduct } from '@/hooks/useFunnels';

interface ProductRow {
  id?: string;
  source_funnel_product_id: string | null;
  product_name_contains: string;
  display_name: string;
  recontact_days: number | null;
}

interface FunnelProductsConfigProps {
  products: LeadFunnelProduct[];
  catalogProducts: FunnelProduct[];
  onSave: (products: Omit<LeadFunnelProduct, 'id' | 'lead_funnel_id' | 'created_at'>[]) => void;
  saving?: boolean;
}

const FunnelProductsConfig: React.FC<FunnelProductsConfigProps> = ({
  products,
  catalogProducts,
  onSave,
  saving,
}) => {
  const [localProducts, setLocalProducts] = useState<ProductRow[]>([]);

  useEffect(() => {
    setLocalProducts(
      products.map(p => ({
        id: p.id,
        source_funnel_product_id: p.source_funnel_product_id,
        product_name_contains: p.product_name_contains,
        display_name: p.display_name || '',
        recontact_days: p.recontact_days,
      }))
    );
  }, [products]);

  const addProduct = () => {
    setLocalProducts(prev => [
      ...prev,
      { source_funnel_product_id: null, product_name_contains: '', display_name: '', recontact_days: null },
    ]);
  };

  const syncFromCatalog = (idx: number, catalogId: string) => {
    const cat = catalogProducts.find(c => c.id === catalogId);
    if (!cat) return;
    setLocalProducts(prev =>
      prev.map((p, i) =>
        i === idx
          ? {
              ...p,
              source_funnel_product_id: cat.id,
              product_name_contains: cat.product_name_contains,
              display_name: cat.display_name || '',
              recontact_days: cat.recontact_days,
            }
          : p
      )
    );
  };

  const updateProduct = (idx: number, field: keyof ProductRow, value: string | number | null) => {
    setLocalProducts(prev =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );
  };

  const removeProduct = (idx: number) => {
    setLocalProducts(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    const valid = localProducts.every(p => p.product_name_contains.trim());
    if (!valid) {
      toast.error('Todos os produtos precisam ter um identificador de nome');
      return;
    }
    onSave(
      localProducts.map(p => ({
        source_funnel_product_id: p.source_funnel_product_id,
        product_name_contains: p.product_name_contains.trim(),
        display_name: p.display_name.trim() || null,
        recontact_days: p.recontact_days,
      }))
    );
  };

  // Products from catalog not yet linked
  const availableCatalog = catalogProducts.filter(
    cp => !localProducts.some(lp => lp.source_funnel_product_id === cp.id)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Package className="h-5 w-5" />
          Produtos &amp; Recontato
        </h3>
        <div className="flex gap-2">
          {availableCatalog.length > 0 && (
            <Select onValueChange={(v) => {
              const cat = catalogProducts.find(c => c.id === v);
              if (!cat) return;
              setLocalProducts(prev => [
                ...prev,
                {
                  source_funnel_product_id: cat.id,
                  product_name_contains: cat.product_name_contains,
                  display_name: cat.display_name || '',
                  recontact_days: cat.recontact_days,
                },
              ]);
            }}>
              <SelectTrigger className="w-auto gap-1.5">
                <Link2 className="h-4 w-4" />
                <SelectValue placeholder="Importar do catálogo" />
              </SelectTrigger>
              <SelectContent>
                {availableCatalog.map(cp => (
                  <SelectItem key={cp.id} value={cp.id}>
                    {cp.display_name || cp.product_name_contains}
                    {cp.recontact_days ? ` (${cp.recontact_days}d)` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={addProduct}>
            <Plus className="h-4 w-4 mr-1" /> Produto
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Configure os produtos deste funil e defina os dias para recontato (recompra). 
        Você pode importar do catálogo de funis de tráfego ou criar avulso.
      </p>

      <div className="space-y-2">
        {localProducts.map((prod, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
            {prod.source_funnel_product_id && (
              <Link2 className="h-4 w-4 text-primary shrink-0" title="Vinculado ao catálogo" />
            )}
            <Input
              value={prod.product_name_contains}
              onChange={e => updateProduct(idx, 'product_name_contains', e.target.value)}
              placeholder="Contém no nome (ex: 1 pote)"
              className="flex-1"
            />
            <Input
              value={prod.display_name}
              onChange={e => updateProduct(idx, 'display_name', e.target.value)}
              placeholder="Nome exibido (opcional)"
              className="flex-1"
            />
            <Input
              type="number"
              min={1}
              value={prod.recontact_days ?? ''}
              onChange={e => {
                const val = e.target.value ? parseInt(e.target.value, 10) : null;
                updateProduct(idx, 'recontact_days', val);
              }}
              placeholder="Dias"
              title="Dias para recontato após compra"
              className="w-20"
            />
            <Button variant="ghost" size="icon" onClick={() => removeProduct(idx)} className="shrink-0">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}

        {localProducts.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">
            Nenhum produto configurado. Adicione produtos para ativar a contagem regressiva de recontato.
          </p>
        )}
      </div>

      {localProducts.length > 0 && (
        <Button onClick={handleSave} className="mt-3" disabled={saving}>
          Salvar Produtos
        </Button>
      )}
    </div>
  );
};

export default FunnelProductsConfig;
