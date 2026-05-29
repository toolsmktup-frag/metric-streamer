import React, { useState, useMemo } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDistinctProductNames } from '@/hooks/useDistinctProductNames';
import {
  type KanbanFilters,
  type FinancialFilter,
  countActiveFilters,
  isFiltersEmpty,
  EMPTY_FILTERS,
} from '@/lib/kanbanFilters';

interface Props {
  funnelId: string;
  filters: KanbanFilters;
  onChange: (f: KanbanFilters) => void;
}

const FINANCIAL_LABELS: Record<FinancialFilter, string> = {
  has_pending: 'Tem pendência (PIX/Boleto)',
  no_pending: 'Sem pendência',
  recover: 'Recuperar (abandonado/recusado)',
  approved: 'Compra aprovada',
};

export const KanbanColumnFilter: React.FC<Props> = ({ funnelId, filters, onChange }) => {
  const { data: products = [] } = useDistinctProductNames(funnelId);
  const [open, setOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const activeCount = countActiveFilters(filters);
  const active = activeCount > 0;

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    if (!q) return products;
    return products.filter(p => p.toLowerCase().includes(q));
  }, [products, productSearch]);

  const toggleProduct = (name: string, mode: 'has' | 'not_has') => {
    const existing = filters.products.find(p => p.name === name);
    if (existing && existing.mode === mode) {
      onChange({ ...filters, products: filters.products.filter(p => p.name !== name) });
    } else if (existing) {
      onChange({
        ...filters,
        products: filters.products.map(p => (p.name === name ? { ...p, mode } : p)),
      });
    } else {
      onChange({ ...filters, products: [...filters.products, { name, mode }] });
    }
  };

  const productState = (name: string): 'has' | 'not_has' | null =>
    filters.products.find(p => p.name === name)?.mode ?? null;

  const toggleFinancial = (f: FinancialFilter) => {
    const has = filters.financial.includes(f);
    onChange({
      ...filters,
      financial: has ? filters.financial.filter(x => x !== f) : [...filters.financial, f],
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          title={active ? `${activeCount} filtro(s) ativo(s) nesta coluna` : 'Filtrar esta coluna'}
          className={`relative inline-flex h-6 w-6 items-center justify-center rounded transition-colors ${
            active
              ? 'text-primary bg-primary/10 hover:bg-primary/20'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          {active && (
            <span className="absolute -top-1 -right-1 h-3.5 min-w-3.5 px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h4 className="text-sm font-semibold">Filtrar coluna</h4>
          {!isFiltersEmpty(filters) && (
            <button
              onClick={() => onChange(EMPTY_FILTERS)}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Limpar
            </button>
          )}
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-3 space-y-4">
          <div>
            <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Produto comprado
            </h5>
            <Input
              placeholder="Buscar produto..."
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              className="h-7 text-xs mb-2"
            />
            <div className="space-y-0.5 max-h-52 overflow-y-auto">
              {filteredProducts.length === 0 && (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  {products.length === 0 ? 'Sem produtos neste funil' : 'Nenhum resultado'}
                </p>
              )}
              {filteredProducts.map(name => {
                const state = productState(name);
                return (
                  <div
                    key={name}
                    className="flex items-center gap-1.5 text-xs p-1 rounded hover:bg-muted/50"
                  >
                    <span className="flex-1 truncate" title={name}>{name}</span>
                    <button
                      onClick={() => toggleProduct(name, 'has')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                        state === 'has'
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      Tem
                    </button>
                    <button
                      onClick={() => toggleProduct(name, 'not_has')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                        state === 'not_has'
                          ? 'bg-destructive/15 border-destructive/40 text-destructive'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      Não tem
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Status financeiro
            </h5>
            <div className="space-y-1">
              {(Object.keys(FINANCIAL_LABELS) as FinancialFilter[]).map(f => (
                <label
                  key={f}
                  className="flex items-center gap-2 text-xs p-1 rounded hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    checked={filters.financial.includes(f)}
                    onCheckedChange={() => toggleFinancial(f)}
                  />
                  <span>{FINANCIAL_LABELS[f]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
