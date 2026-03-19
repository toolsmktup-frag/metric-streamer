import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link2, Package } from 'lucide-react';
import { toast } from 'sonner';
import type { LeadFunnelProduct } from '@/hooks/useLeadFunnelProducts';
import type { LeadProductMapping } from '@/hooks/useLeadProductMappings';

interface ProductMappingConfigProps {
  distinctProducts: string[];
  leadFunnelProducts: LeadFunnelProduct[];
  existingMappings: LeadProductMapping[];
  onSave: (mappings: { raw_product_name: string; lead_funnel_product_id: string }[]) => void;
  saving?: boolean;
  loading?: boolean;
}

const ProductMappingConfig: React.FC<ProductMappingConfigProps> = ({
  distinctProducts,
  leadFunnelProducts,
  existingMappings,
  onSave,
  saving,
  loading,
}) => {
  // Map raw_product_name -> lead_funnel_product_id
  const [localMappings, setLocalMappings] = useState<Record<string, string>>({});

  useEffect(() => {
    const map: Record<string, string> = {};
    for (const m of existingMappings) {
      map[m.raw_product_name] = m.lead_funnel_product_id;
    }
    setLocalMappings(map);
  }, [existingMappings]);

  const handleChange = (rawName: string, productId: string) => {
    setLocalMappings(prev => {
      if (productId === 'none') {
        const next = { ...prev };
        delete next[rawName];
        return next;
      }
      return { ...prev, [rawName]: productId };
    });
  };

  const handleSave = () => {
    const mappings = Object.entries(localMappings).map(([raw_product_name, lead_funnel_product_id]) => ({
      raw_product_name,
      lead_funnel_product_id,
    }));
    onSave(mappings);
  };

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        Carregando produtos dos leads...
      </div>
    );
  }

  if (distinctProducts.length === 0) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <Link2 className="h-5 w-5" /> Vincular Produtos dos Leads
        </h3>
        <p className="text-sm text-muted-foreground py-4">
          Nenhum produto encontrado nos metadados dos leads deste funil. Os leads precisam ter o campo <code>product_name</code> nos metadados.
        </p>
      </div>
    );
  }

  const mappedCount = Object.keys(localMappings).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Link2 className="h-5 w-5" /> Vincular Produtos dos Leads
        </h3>
        <span className="text-sm text-muted-foreground">
          {mappedCount}/{distinctProducts.length} vinculados
        </span>
      </div>

      <p className="text-sm text-muted-foreground mb-3">
        Vincule os nomes reais dos produtos (vindos dos leads) aos produtos configurados acima para ativar o recontato.
      </p>

      <div className="space-y-2">
        {distinctProducts.map(rawName => (
          <div key={rawName} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
            <Package className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm flex-1 truncate" title={rawName}>
              {rawName}
            </span>
            <Select
              value={localMappings[rawName] || 'none'}
              onValueChange={v => handleChange(rawName, v)}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Vincular a..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sem vínculo —</SelectItem>
                {leadFunnelProducts.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.display_name || p.product_name_contains}
                    {p.recontact_days ? ` (${p.recontact_days}d)` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <Button onClick={handleSave} className="mt-3" disabled={saving}>
        {saving ? 'Salvando...' : 'Salvar Vínculos'}
      </Button>
    </div>
  );
};

export default ProductMappingConfig;
