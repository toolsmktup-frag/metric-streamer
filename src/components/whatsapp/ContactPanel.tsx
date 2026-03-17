import { User, Tag, TrendingUp, ShoppingCart } from 'lucide-react';

interface ContactPanelProps {
  phone: string | null;
  senderName: string | null;
}

export default function ContactPanel({ phone, senderName }: ContactPanelProps) {
  if (!phone) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Selecione um contato
      </div>
    );
  }

  const formatPhone = (p: string) => {
    if (p.length === 13 && p.startsWith('55')) {
      return `(${p.slice(2, 4)}) ${p.slice(4, 9)}-${p.slice(9)}`;
    }
    return p;
  };

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* Contact header */}
      <div className="flex flex-col items-center gap-2 pb-4 border-b border-border">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-8 w-8 text-primary" />
        </div>
        <h3 className="font-semibold text-foreground text-sm">
          {senderName || formatPhone(phone)}
        </h3>
        <span className="text-xs text-muted-foreground">{formatPhone(phone)}</span>
      </div>

      {/* Tags placeholder */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Tag className="h-3 w-3" /> Tags
        </h4>
        <p className="text-xs text-muted-foreground italic">Nenhuma tag vinculada</p>
      </div>

      {/* Funnel placeholder */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3" /> Funis
        </h4>
        <p className="text-xs text-muted-foreground italic">Nenhum funil vinculado</p>
      </div>

      {/* Sales placeholder */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <ShoppingCart className="h-3 w-3" /> Vendas
        </h4>
        <p className="text-xs text-muted-foreground italic">Nenhuma venda encontrada</p>
      </div>
    </div>
  );
}
