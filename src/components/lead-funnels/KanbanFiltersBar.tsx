import React, { useState, useMemo } from 'react';
import { Filter, X, Save, Trash2, ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDistinctProductNames } from '@/hooks/useDistinctProductNames';
import {
  useKanbanSavedViews,
  useSaveKanbanView,
  useDeleteKanbanView,
} from '@/hooks/useKanbanSavedViews';
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

export const KanbanFiltersBar: React.FC<Props> = ({ funnelId, filters, onChange }) => {
  const { data: products = [] } = useDistinctProductNames(funnelId);
  const { data: savedViews = [] } = useKanbanSavedViews(funnelId);
  const saveView = useSaveKanbanView();
  const deleteView = useDeleteKanbanView(funnelId);

  const [open, setOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [viewName, setViewName] = useState('');

  const activeCount = countActiveFilters(filters);

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
        products: filters.products.map(p => p.name === name ? { ...p, mode } : p),
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

  const clearAll = () => onChange(EMPTY_FILTERS);

  const handleSave = async () => {
    if (!viewName.trim()) return;
    await saveView.mutateAsync({
      funnel_id: funnelId,
      name: viewName.trim(),
      filters,
    });
    setSaveDialogOpen(false);
    setViewName('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Botão de filtros */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Filter className="h-3.5 w-3.5" />
            Filtros
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
                {activeCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="start">
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Filtros de coluna</h4>
              {!isFiltersEmpty(filters) && (
                <button
                  onClick={clearAll}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Limpar tudo
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-3 space-y-4">
            {/* Produto comprado */}
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Produto comprado
              </h5>
              <Input
                placeholder="Buscar produto..."
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                className="h-8 text-xs mb-2"
              />
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {filteredProducts.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    {products.length === 0 ? 'Nenhum produto encontrado neste funil' : 'Nenhum resultado'}
                  </p>
                )}
                {filteredProducts.map(name => {
                  const state = productState(name);
                  return (
                    <div
                      key={name}
                      className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted/50"
                    >
                      <span className="flex-1 truncate" title={name}>{name}</span>
                      <button
                        onClick={() => toggleProduct(name, 'has')}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                          state === 'has'
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        Tem
                      </button>
                      <button
                        onClick={() => toggleProduct(name, 'not_has')}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
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

            {/* Status financeiro */}
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Status financeiro
              </h5>
              <div className="space-y-1.5">
                {(Object.keys(FINANCIAL_LABELS) as FinancialFilter[]).map(f => (
                  <label
                    key={f}
                    className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted/50 cursor-pointer"
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

          {!isFiltersEmpty(filters) && (
            <div className="p-3 border-t border-border flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => { setSaveDialogOpen(true); setOpen(false); }}
              >
                <Save className="h-3.5 w-3.5" />
                Salvar como visão
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Visões salvas */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            Visões
            {savedViews.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                {savedViews.length}
              </Badge>
            )}
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {savedViews.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              Nenhuma visão salva ainda
            </div>
          ) : (
            savedViews.map(v => (
              <DropdownMenuItem
                key={v.id}
                className="flex items-center justify-between gap-2"
                onSelect={(e) => { e.preventDefault(); onChange(v.filters || EMPTY_FILTERS); }}
              >
                <span className="flex-1 truncate text-xs">{v.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Excluir visão "${v.name}"?`)) deleteView.mutate(v.id);
                  }}
                  className="text-muted-foreground hover:text-destructive p-0.5"
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              if (isFiltersEmpty(filters)) {
                alert('Configure filtros antes de salvar uma visão');
                return;
              }
              setSaveDialogOpen(true);
            }}
            className="gap-2 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Salvar visão atual...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Chips ativos */}
      {filters.products.map(p => (
        <Badge
          key={`p-${p.name}`}
          variant="secondary"
          className="gap-1 text-[10px] h-6"
        >
          <span className={p.mode === 'not_has' ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}>
            {p.mode === 'has' ? 'Tem:' : 'Não tem:'}
          </span>
          <span className="max-w-32 truncate">{p.name}</span>
          <button
            onClick={() => onChange({
              ...filters,
              products: filters.products.filter(x => x.name !== p.name),
            })}
            className="hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {filters.financial.map(f => (
        <Badge
          key={`f-${f}`}
          variant="secondary"
          className="gap-1 text-[10px] h-6"
        >
          {FINANCIAL_LABELS[f]}
          <button
            onClick={() => toggleFinancial(f)}
            className="hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      {/* Dialog de salvar visão */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Salvar visão de filtros</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder='Ex: "Compradores Tinturas sem Chás"'
              value={viewName}
              onChange={e => setViewName(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && viewName.trim()) handleSave(); }}
            />
            <p className="text-xs text-muted-foreground">
              Esta visão ficará disponível para todos os membros com acesso a este funil.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!viewName.trim() || saveView.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
