import React from 'react';
import { Instagram, Facebook, Search, MessageCircle, Youtube, Music, Mail, Globe, FileText, ShoppingCart, Gift, ArrowDownCircle, Layout, Clock, GitBranch } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export type DragNodeType = 'source' | 'page' | 'action';

export interface DragNodeData {
  nodeType: DragNodeType;
  sourceType?: string;
  pageType?: string;
  actionType?: string;
  label: string;
  icon: string;
}

const trafficSources: { sourceType: string; label: string; icon: React.ReactNode; emoji: string }[] = [
  { sourceType: 'instagram', label: 'Instagram', icon: <Instagram className="h-4 w-4" />, emoji: '📸' },
  { sourceType: 'facebook', label: 'Facebook', icon: <Facebook className="h-4 w-4" />, emoji: '👤' },
  { sourceType: 'google', label: 'Google Ads', icon: <Search className="h-4 w-4" />, emoji: '🔍' },
  { sourceType: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle className="h-4 w-4" />, emoji: '💬' },
  { sourceType: 'youtube', label: 'YouTube', icon: <Youtube className="h-4 w-4" />, emoji: '▶️' },
  { sourceType: 'tiktok', label: 'TikTok', icon: <Music className="h-4 w-4" />, emoji: '🎵' },
  { sourceType: 'email', label: 'Email', icon: <Mail className="h-4 w-4" />, emoji: '📧' },
  { sourceType: 'organic', label: 'Orgânico', icon: <Globe className="h-4 w-4" />, emoji: '🌐' },
];

const pageTypes: { pageType: string; label: string; icon: React.ReactNode; color: string }[] = [
  { pageType: 'capture', label: 'Captura', icon: <FileText className="h-4 w-4" />, color: '#3b82f6' },
  { pageType: 'sales', label: 'Vendas', icon: <Layout className="h-4 w-4" />, color: '#10b981' },
  { pageType: 'checkout', label: 'Checkout', icon: <ShoppingCart className="h-4 w-4" />, color: '#f59e0b' },
  { pageType: 'thankyou', label: 'Obrigado', icon: <Gift className="h-4 w-4" />, color: '#8b5cf6' },
  { pageType: 'upsell', label: 'Upsell', icon: <ArrowDownCircle className="h-4 w-4 rotate-180" />, color: '#ec4899' },
  { pageType: 'downsell', label: 'Downsell', icon: <ArrowDownCircle className="h-4 w-4" />, color: '#f97316' },
  { pageType: 'content', label: 'Conteúdo', icon: <Layout className="h-4 w-4" />, color: '#6366f1' },
];

const actionTypes: { actionType: string; label: string; icon: React.ReactNode }[] = [
  { actionType: 'whatsapp', label: 'Enviar WhatsApp', icon: <MessageCircle className="h-4 w-4" /> },
  { actionType: 'email', label: 'Enviar Email', icon: <Mail className="h-4 w-4" /> },
  { actionType: 'delay', label: 'Delay', icon: <Clock className="h-4 w-4" /> },
  { actionType: 'condition', label: 'Condição', icon: <GitBranch className="h-4 w-4" /> },
];

function DraggableItem({ children, data }: { children: React.ReactNode; data: DragNodeData }) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/reactflow', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent/50 cursor-grab active:cursor-grabbing transition-colors text-sm"
    >
      {children}
    </div>
  );
}

const FlowToolbar: React.FC = () => {
  return (
    <div className="w-[200px] border-r border-border bg-card/50 flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Traffic Sources */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Fontes de Tráfego</h4>
            <div className="space-y-1.5">
              {trafficSources.map(s => (
                <DraggableItem key={s.sourceType} data={{ nodeType: 'source', sourceType: s.sourceType, label: s.label, icon: s.emoji }}>
                  {s.icon}
                  <span className="text-foreground">{s.label}</span>
                </DraggableItem>
              ))}
            </div>
          </div>

          {/* Page Types */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Páginas</h4>
            <div className="space-y-1.5">
              {pageTypes.map(p => (
                <DraggableItem key={p.pageType} data={{ nodeType: 'page', pageType: p.pageType, label: p.label, icon: p.pageType }}>
                  <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-foreground">{p.label}</span>
                </DraggableItem>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ações</h4>
            <div className="space-y-1.5">
              {actionTypes.map(a => (
                <DraggableItem key={a.actionType} data={{ nodeType: 'action', actionType: a.actionType, label: a.label, icon: a.actionType }}>
                  {a.icon}
                  <span className="text-foreground">{a.label}</span>
                </DraggableItem>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default FlowToolbar;
