import React, { useState, useMemo } from 'react';
import { X, Search, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAllFunnelProducts, type FunnelProductOption } from '@/hooks/useAllFunnelProducts';

const roleLabels: Record<string, string> = {
  front: 'Front-end',
  order_bump: 'Bump',
  upsell1: 'Upsell 1',
  upsell2: 'Upsell 2',
  upsell3: 'Upsell 3',
  downsell: 'Downsell',
};

interface WzProductSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  customLabels?: Record<string, string>;
  onCustomLabelsChange?: (labels: Record<string, string>) => void;
}

export default function WzProductSelector({ selectedIds, onChange, label = 'Filtrar por produto(s)', customLabels = {}, onCustomLabelsChange }: WzProductSelectorProps) {
  const { data: products = [], isLoading } = useAllFunnelProducts();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [manualId, setManualId] = useState('');
  const [manualName, setManualName] = useState('');

  // Group products by funnel
  const grouped = useMemo(() => {
    const map = new Map<string, FunnelProductOption[]>();
    for (const p of products) {
      const key = `${p.funnel_name} (${p.platform})`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [products]);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return grouped;
    const s = search.toLowerCase();
    const result = new Map<string, FunnelProductOption[]>();
    for (const [key, prods] of grouped) {
      const filtered = prods.filter(p =>
        (p.product_id && p.product_id.toLowerCase().includes(s)) ||
        p.product_name_contains.toLowerCase().includes(s) ||
        (p.display_name && p.display_name.toLowerCase().includes(s)) ||
        key.toLowerCase().includes(s)
      );
      if (filtered.length > 0) result.set(key, filtered);
    }
    return result;
  }, [grouped, search]);

  const getProductLabel = (id: string) => {
    const p = products.find(pr => pr.product_id === id);
    if (p) return `${p.product_id} — ${p.display_name || p.product_name_contains}`;
    if (customLabels[id]) return `${id} — ${customLabels[id]}`;
    return id;
  };

  const toggleProduct = (productId: string) => {
    if (!productId) return;
    if (selectedIds.includes(productId)) {
      onChange(selectedIds.filter(i => i !== productId));
    } else {
      onChange([...selectedIds, productId]);
    }
  };

  const addManual = () => {
    const id = manualId.trim();
    const name = manualName.trim();
    if (id && !selectedIds.includes(id)) {
      onChange([...selectedIds, id]);
      if (name && onCustomLabelsChange) {
        onCustomLabelsChange({ ...customLabels, [id]: name });
      }
    }
    setManualId('');
    setManualName('');
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>

      {/* Selected chips */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedIds.map(id => (
            <Badge key={id} variant="secondary" className="text-[10px] gap-1 pr-1">
              {getProductLabel(id)}
              <button
                type="button"
                className="ml-0.5 hover:text-destructive"
                onClick={() => onChange(selectedIds.filter(i => i !== id))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full text-xs h-8 gap-1 border-dashed justify-start">
            <Search className="h-3 w-3" />
            {selectedIds.length === 0 ? 'Selecionar produtos...' : 'Adicionar produto...'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <div className="p-2 border-b border-border">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou ID..."
              className="h-8 text-xs"
              autoFocus
            />
          </div>

          <div className="max-h-[240px] overflow-y-auto p-1">
            {isLoading && <p className="text-xs text-muted-foreground p-2">Carregando...</p>}

            {!isLoading && filteredGroups.size === 0 && (
              <p className="text-xs text-muted-foreground p-2">Nenhum produto encontrado</p>
            )}

            {[...filteredGroups.entries()].map(([group, prods]) => (
              <div key={group}>
                <p className="text-[10px] font-semibold text-muted-foreground px-2 pt-2 pb-1 uppercase tracking-wider">
                  {group}
                </p>
                {prods.map(p => {
                  const pid = p.product_id || p.id;
                  const isSelected = selectedIds.includes(pid);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`w-full text-left px-2 py-1.5 text-xs rounded-sm hover:bg-accent flex items-center gap-2 ${isSelected ? 'bg-accent/50' : ''}`}
                      onClick={() => { toggleProduct(pid); }}
                    >
                      <span className={`h-3 w-3 rounded-sm border flex-shrink-0 flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-input'}`}>
                        {isSelected && <span className="text-primary-foreground text-[8px]">✓</span>}
                      </span>
                      <span className="flex-1 truncate">
                        <span className="font-mono text-muted-foreground">{p.product_id || '—'}</span>
                        {' — '}
                        {p.display_name || p.product_name_contains}
                        <span className="text-muted-foreground ml-1">({roleLabels[p.role] || p.role})</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Manual ID entry */}
          <div className="border-t border-border p-2 space-y-1">
            <div className="flex gap-1">
              <Input
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="ID do produto..."
                className="h-7 text-xs w-[100px]"
                onKeyDown={(e) => e.key === 'Enter' && addManual()}
              />
              <Input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Nome (opcional)..."
                className="h-7 text-xs flex-1"
                onKeyDown={(e) => e.key === 'Enter' && addManual()}
              />
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0" onClick={addManual} disabled={!manualId.trim()}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
