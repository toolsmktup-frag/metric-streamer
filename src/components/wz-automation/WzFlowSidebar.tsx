import React from 'react';
import {
  Zap, MessageCircle, Clock, GitBranch, XCircle, Ban,
  ShoppingCart, CreditCard, FileText, Timer, AlertTriangle,
  RotateCcw, X, ShoppingBag, Sparkles, StickyNote, Wrench,
  Split, CalendarClock, Globe, Tag, CornerDownRight, Columns3,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface WzDragData {
  nodeType: 'trigger' | 'whatsapp' | 'timer' | 'condition' | 'stop' | 'note' | 'ab_split' | 'smart_delay' | 'webhook' | 'tag' | 'goto' | 'move_stage';
  triggerType?: string;
  stopType?: string;
  label: string;
}

const triggers: { triggerType: string; label: string; icon: React.ReactNode }[] = [
  { triggerType: 'purchase_approved', label: 'Compra aprovada', icon: <ShoppingCart className="h-4 w-4" /> },
  { triggerType: 'pix_generated', label: 'PIX gerado', icon: <CreditCard className="h-4 w-4" /> },
  { triggerType: 'boleto_generated', label: 'Boleto gerado', icon: <FileText className="h-4 w-4" /> },
  { triggerType: 'pix_expired', label: 'PIX expirado', icon: <Timer className="h-4 w-4" /> },
  { triggerType: 'payment_refused', label: 'Pagamento recusado', icon: <AlertTriangle className="h-4 w-4" /> },
  { triggerType: 'refund', label: 'Reembolso', icon: <RotateCcw className="h-4 w-4" /> },
  { triggerType: 'cancellation', label: 'Cancelamento', icon: <X className="h-4 w-4" /> },
  { triggerType: 'cart_abandoned', label: 'Abandono de carrinho', icon: <ShoppingBag className="h-4 w-4" /> },
  { triggerType: 'any_event', label: 'Qualquer evento', icon: <Sparkles className="h-4 w-4" /> },
];

const actions: { nodeType: WzDragData['nodeType']; label: string; icon: React.ReactNode; color: string; stopType?: string }[] = [
  { nodeType: 'whatsapp', label: 'Enviar WhatsApp', icon: <MessageCircle className="h-4 w-4" />, color: '#25d366' },
  { nodeType: 'timer', label: 'Aguardar / Timer', icon: <Clock className="h-4 w-4" />, color: '#3b82f6' },
  { nodeType: 'condition', label: 'Condição If/Else', icon: <GitBranch className="h-4 w-4" />, color: '#f59e0b' },
  { nodeType: 'ab_split', label: 'Divisor / Roteador', icon: <Split className="h-4 w-4" />, color: '#8b5cf6' },
  { nodeType: 'smart_delay', label: 'Delay Inteligente', icon: <CalendarClock className="h-4 w-4" />, color: '#14b8a6' },
  { nodeType: 'webhook', label: 'Webhook HTTP', icon: <Globe className="h-4 w-4" />, color: '#6366f1' },
  { nodeType: 'tag', label: 'Marcar Lead / Tag', icon: <Tag className="h-4 w-4" />, color: '#10b981' },
  { nodeType: 'move_stage', label: 'Mover para coluna', icon: <Columns3 className="h-4 w-4" />, color: '#f97316' },
  { nodeType: 'goto', label: 'Pular para (Goto)', icon: <CornerDownRight className="h-4 w-4" />, color: '#06b6d4' },
  { nodeType: 'stop', label: 'Parar Fluxo', icon: <XCircle className="h-4 w-4" />, color: '#6b7280' },
  { nodeType: 'stop', label: 'Cancelar anteriores', icon: <Ban className="h-4 w-4" />, color: '#ef4444', stopType: 'cancel_previous' },
];

function DraggableItem({ children, data }: { children: React.ReactNode; data: WzDragData }) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/wz-flow', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-accent/50 cursor-grab active:cursor-grabbing transition-colors text-sm"
    >
      {children}
    </div>
  );
}

const WzFlowSidebar: React.FC = () => {
  return (
    <div className="w-[260px] border-r border-border bg-card/50 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-xs text-muted-foreground font-medium">Arraste para o canvas</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-5">
          {/* Gatilhos */}
          <div>
            <h4 className="text-xs font-bold text-pink-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              Gatilhos
            </h4>
            <div className="space-y-1.5">
              {triggers.map(t => (
                <DraggableItem
                  key={t.triggerType}
                  data={{ nodeType: 'trigger', triggerType: t.triggerType, label: t.label }}
                >
                  <span className="text-pink-500">{t.icon}</span>
                  <span className="text-foreground">{t.label}</span>
                </DraggableItem>
              ))}
            </div>
          </div>

          {/* Ações */}
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Ações
            </h4>
            <div className="space-y-1.5">
              {actions.map((a, i) => (
                <DraggableItem
                  key={`${a.nodeType}-${i}`}
                  data={{
                    nodeType: a.nodeType,
                    label: a.label,
                    ...(a.stopType ? { stopType: a.stopType } : {}),
                  }}
                >
                  <span style={{ color: a.color }}>{a.icon}</span>
                  <span className="text-foreground">{a.label}</span>
                </DraggableItem>
              ))}
            </div>
          </div>
          {/* Utilidades */}
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              Utilidades
            </h4>
            <div className="space-y-1.5">
              <DraggableItem data={{ nodeType: 'note', label: 'Anotação' }}>
                <span className="text-amber-500"><StickyNote className="h-4 w-4" /></span>
                <span className="text-foreground">Anotação / Nota</span>
              </DraggableItem>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default WzFlowSidebar;
