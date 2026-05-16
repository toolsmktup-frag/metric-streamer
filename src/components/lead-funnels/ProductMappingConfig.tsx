import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Link2, Package, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Lightbulb } from 'lucide-react';
import type { LeadFunnelProduct } from '@/hooks/useLeadFunnelProducts';
import type { LeadProductMapping, CrossFunnelMapping } from '@/hooks/useLeadProductMappings';
import { useAllLeadProductMappings } from '@/hooks/useLeadProductMappings';

interface ProductMappingConfigProps {
  distinctProducts: string[];
  leadFunnelProducts: LeadFunnelProduct[];
  existingMappings: LeadProductMapping[];
  onSave: (mappings: { raw_product_name: string; lead_funnel_product_id: string }[]) => void;
  saving?: boolean;
  loading?: boolean;
  funnelId?: string;
}

const ProductMappingConfig: React.FC<ProductMappingConfigProps> = ({
  distinctProducts,
  leadFunnelProducts,
  existingMappings,
  onSave,
  saving,
  loading,
  funnelId,
}) => {
  const [localMappings, setLocalMappings] = useState<Record<string, string>>({});
  const [unmappedOpen, setUnmappedOpen] = useState(true);
  const [mappedOpen, setMappedOpen] = useState(false);

  const { data: crossFunnelMap } = useAllLeadProductMappings(funnelId);

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

  const unmapped = distinctProducts.filter(name => !localMappings[name]);
  const mapped = distinctProducts.filter(name => !!localMappings[name]);

  const renderProductRow = (rawName: string) => {
    const crossMappings = crossFunnelMap?.[rawName] || [];
    return (
      <div key={rawName} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
        <Package className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm truncate block" title={rawName}>
            {rawName}
          </span>
          {crossMappings.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {crossMappings.map((cm, i) => (
                <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                  Também em: {cm.funnel_name}
                </Badge>
              ))}
            </div>
          )}
        </div>
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
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Link2 className="h-5 w-5" /> Vincular Produtos dos Leads
        </h3>
        <span className="text-sm text-muted-foreground">
          {mapped.length}/{distinctProducts.length} vinculados
        </span>
      </div>

      <p className="text-sm text-muted-foreground mb-3">
        Vincule os nomes reais dos produtos (vindos dos leads) aos produtos configurados acima para ativar o recontato.
      </p>

      <div className="space-y-3">
        {/* Unmapped section */}
        {unmapped.length > 0 && (
          <Collapsible open={unmappedOpen} onOpenChange={setUnmappedOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/15 transition-colors">
              {unmappedOpen ? <ChevronDown className="h-4 w-4 text-amber-600" /> : <ChevronRight className="h-4 w-4 text-amber-600" />}
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Sem vínculo ({unmapped.length})
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              {unmapped.map(renderProductRow)}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Mapped section */}
        {mapped.length > 0 && (
          <Collapsible open={mappedOpen} onOpenChange={setMappedOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/15 transition-colors">
              {mappedOpen ? <ChevronDown className="h-4 w-4 text-emerald-600" /> : <ChevronRight className="h-4 w-4 text-emerald-600" />}
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Vinculados ({mapped.length})
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              {mapped.map(renderProductRow)}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      <Button onClick={handleSave} className="mt-3" disabled={saving}>
        {saving ? 'Salvando...' : 'Salvar Vínculos'}
      </Button>
    </div>
  );
};

export default ProductMappingConfig;
