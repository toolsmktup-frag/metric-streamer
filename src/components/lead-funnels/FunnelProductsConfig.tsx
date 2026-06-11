import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Link2, Package, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { LeadFunnelProduct } from '@/hooks/useLeadFunnelProducts';
import type { FunnelProduct } from '@/hooks/useFunnels';
import type { LeadFunnelStage } from '@/types/leadFunnels';

interface ProductRow {
  id?: string;
  source_funnel_product_id: string | null;
  product_name_contains: string;
  display_name: string;
  recontact_days: number | null;
  pot_duration_days: number | null;
  reminder_days_before: number | null;
  auto_move_stage_id: string | null;
  auto_move_from_stage_id: string | null;
}

/** recontato = duração do estoque − antecedência (mín. 1). Igual ao trigger do banco. */
const calcRecontact = (duration: number | null, reminder: number | null): number | null => {
  if (duration == null || reminder == null) return null;
  return Math.max(duration - reminder, 1);
};

interface FunnelProductsConfigProps {
  products: LeadFunnelProduct[];
  catalogProducts: FunnelProduct[];
  stages: LeadFunnelStage[];
  onSave: (products: Partial<Pick<LeadFunnelProduct, 'id'>> & Omit<LeadFunnelProduct, 'id' | 'lead_funnel_id' | 'created_at'>[]) => void;
  saving?: boolean;
  onBulkMoveOverdue?: () => void;
  bulkMoving?: boolean;
}

const FunnelProductsConfig: React.FC<FunnelProductsConfigProps> = ({
  products,
  catalogProducts,
  stages,
  onSave,
  saving,
  onBulkMoveOverdue,
  bulkMoving,
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
        pot_duration_days: p.pot_duration_days,
        reminder_days_before: p.reminder_days_before,
        auto_move_stage_id: p.auto_move_stage_id,
        auto_move_from_stage_id: p.auto_move_from_stage_id,
      }))
    );
  }, [products]);

  // Default origem = etapa de compra aprovada: o lead fica ali contando o prazo de recompra.
  const purchaseApprovedStage = stages.find(stage => {
    const name = stage.name.toLowerCase();
    return name.includes('compra') && name.includes('aprovad');
  });
  const defaultFromStageId = purchaseApprovedStage?.id ?? (stages.length > 0 ? stages[0].id : null);

  const addProduct = () => {
    setLocalProducts(prev => [
      ...prev,
      {
        source_funnel_product_id: null,
        product_name_contains: '',
        display_name: '',
        recontact_days: null,
        pot_duration_days: null,
        reminder_days_before: null,
        auto_move_stage_id: null,
        auto_move_from_stage_id: defaultFromStageId,
      },
    ]);
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
        ...(p.id ? { id: p.id } : {}),
        source_funnel_product_id: p.source_funnel_product_id,
        product_name_contains: p.product_name_contains.trim(),
        display_name: p.display_name.trim() || null,
        // recontact_days é recalculado pelo trigger do banco a partir de duração − antecedência
        recontact_days: calcRecontact(p.pot_duration_days, p.reminder_days_before),
        pot_duration_days: p.pot_duration_days,
        reminder_days_before: p.reminder_days_before,
        auto_move_stage_id: p.auto_move_stage_id,
        auto_move_from_stage_id: p.auto_move_from_stage_id,
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
          {onBulkMoveOverdue && localProducts.some(p => p.auto_move_stage_id && p.recontact_days) && (
            <Button
              variant="outline"
              size="sm"
              onClick={onBulkMoveOverdue}
              disabled={bulkMoving}
              className="gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${bulkMoving ? 'animate-spin' : ''}`} />
              Atualizar Funil
            </Button>
          )}
          {availableCatalog.length > 0 && (
            <Select onValueChange={(v) => {
              const cat = catalogProducts.find(c => c.id === v);
              if (!cat) return;
              const isStandalone = String(cat.id).startsWith('catalog:');
              setLocalProducts(prev => [
                ...prev,
                {
                  // produtos avulsos do catálogo não têm FK pra funnel_products
                  source_funnel_product_id: isStandalone ? null : cat.id,
                  product_name_contains: cat.product_name_contains,
                  display_name: cat.display_name || '',
                  recontact_days: cat.recontact_days,
                  pot_duration_days: null,
                  reminder_days_before: null,
                  auto_move_stage_id: null,
                  auto_move_from_stage_id: defaultFromStageId,
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
        Configure <strong>quanto tempo o estoque dura</strong> (nº de potes × 30 dias) e <strong>quantos dias antes</strong> de
        acabar recontatar. O sistema soma as compras do cliente e calcula o dia certo automaticamente. Só move se o lead ainda
        estiver na etapa de origem, preservando negociações em andamento.
      </p>

      <div className="space-y-2">
        {localProducts.map((prod, idx) => (
          <div key={idx} className="bg-muted/50 rounded-lg p-2 space-y-2">
            <div className="flex items-center gap-2">
              {prod.source_funnel_product_id && (
                <span title="Vinculado ao catálogo"><Link2 className="h-4 w-4 text-primary shrink-0" /></span>
              )}
              <Input
                value={prod.product_name_contains}
                onChange={e => updateProduct(idx, 'product_name_contains', e.target.value)}
                placeholder="Rótulo (ex: 3 potes / 90 dias)"
                className="flex-1"
              />
              <Input
                value={prod.display_name}
                onChange={e => updateProduct(idx, 'display_name', e.target.value)}
                placeholder="Nome exibido (opcional)"
                className="flex-1"
              />
              <Button variant="ghost" size="icon" onClick={() => removeProduct(idx)} className="shrink-0">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Estoque dura</span>
              <Input
                type="number"
                min={1}
                value={prod.pot_duration_days ?? ''}
                onChange={e => updateProduct(idx, 'pot_duration_days', e.target.value ? parseInt(e.target.value, 10) : null)}
                placeholder="90"
                title="Quantos dias o estoque dura (nº de potes × 30)"
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">dias · avisar</span>
              <Input
                type="number"
                min={0}
                value={prod.reminder_days_before ?? ''}
                onChange={e => updateProduct(idx, 'reminder_days_before', e.target.value ? parseInt(e.target.value, 10) : null)}
                placeholder="15"
                title="Quantos dias antes de o estoque acabar recontatar"
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">
                antes →{' '}
                <strong className="text-foreground">
                  {calcRecontact(prod.pot_duration_days, prod.reminder_days_before) ?? '—'}d
                </strong>{' '}
                após a compra
              </span>
              <Select
                value={prod.auto_move_from_stage_id || 'none'}
                onValueChange={v => updateProduct(idx, 'auto_move_from_stage_id', v === 'none' ? null : v)}
              >
                <SelectTrigger className="w-40" title="Só move o lead se ele estiver nesta etapa">
                  <SelectValue placeholder="De: etapa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">De: qualquer etapa</SelectItem>
                  {stages.map(s => (
                    <SelectItem key={s.id} value={s.id}>De: {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={prod.auto_move_stage_id || 'none'}
                onValueChange={v => updateProduct(idx, 'auto_move_stage_id', v === 'none' ? null : v)}
              >
                <SelectTrigger className="w-44" title="Mover lead vencido para esta etapa">
                  <SelectValue placeholder="Para: etapa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem auto-mover</SelectItem>
                  {stages.map(s => (
                    <SelectItem key={s.id} value={s.id}>Para: {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
