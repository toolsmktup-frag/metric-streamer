import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { Node } from '@xyflow/react';

const pageTypeOptions = [
  { value: 'capture', label: 'Captura' },
  { value: 'sales', label: 'Vendas' },
  { value: 'checkout', label: 'Checkout' },
  { value: 'thankyou', label: 'Obrigado' },
  { value: 'upsell', label: 'Upsell' },
  { value: 'downsell', label: 'Downsell' },
  { value: 'content', label: 'Conteúdo' },
];

interface NodeConfigPanelProps {
  node: Node | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
}

const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({ node, open, onClose, onUpdate, onDelete }) => {
  if (!node) return null;

  const data = node.data as Record<string, any>;
  const isPage = node.type === 'page';
  const isSource = node.type === 'trafficSource';
  const isAction = node.type === 'action';

  const update = (key: string, value: string) => {
    onUpdate(node.id, { ...data, [key]: value });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[340px] sm:w-[380px]">
        <SheetHeader>
          <SheetTitle className="text-foreground">Configurar {isPage ? 'Página' : isSource ? 'Fonte' : 'Ação'}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              value={data.label || ''}
              onChange={(e) => update('label', e.target.value)}
              placeholder="Nome do elemento"
            />
          </div>

          {/* Page-specific fields */}
          {isPage && (
            <>
              <div className="space-y-2">
                <Label>Tipo de Página</Label>
                <Select value={data.pageType || 'content'} onValueChange={(v) => update('pageType', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pageTypeOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>URL da Página</Label>
                <Input
                  value={data.pageUrl || ''}
                  onChange={(e) => update('pageUrl', e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={data.color || '#3b82f6'}
                    onChange={(e) => update('color', e.target.value)}
                    className="h-9 w-12 rounded border border-border cursor-pointer"
                  />
                  <Input
                    value={data.color || '#3b82f6'}
                    onChange={(e) => update('color', e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Metrics (read-only) */}
              {data.count !== undefined && (
                <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Métricas em Tempo Real</p>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-lg font-bold text-foreground">{data.count}</span>
                    <span className="text-sm text-muted-foreground">leads nesta etapa</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Source-specific */}
          {isSource && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Tipo: <span className="font-medium text-foreground">{data.sourceType}</span></p>
            </div>
          )}

          {/* Action-specific */}
          {isAction && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Ação: <span className="font-medium text-foreground">{data.actionType}</span></p>
            </div>
          )}

          {/* Delete */}
          <div className="pt-4 border-t border-border">
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => {
                onDelete(node.id);
                onClose();
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remover Elemento
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default NodeConfigPanel;
