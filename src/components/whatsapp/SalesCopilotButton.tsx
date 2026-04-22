import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onClick: () => void;
  active?: boolean;
}

export default function SalesCopilotButton({ onClick, active }: Props) {
  return (
    <Button
      variant={active ? 'default' : 'outline'}
      size="sm"
      onClick={onClick}
      className="h-8 gap-1.5"
      title="Copiloto de vendas (IA)"
    >
      <Sparkles className="h-3.5 w-3.5" />
      Copiloto
    </Button>
  );
}
