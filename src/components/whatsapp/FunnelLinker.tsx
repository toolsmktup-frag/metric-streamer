import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLeadFunnels } from '@/hooks/useLeadFunnels';
import { useLeadFunnelStages } from '@/hooks/useLeadFunnelStages';
import { useLinkLeadToFunnel } from '@/hooks/useLinkLeadToFunnel';

interface Props {
  leadId: string;
  /** Funis aos quais o lead já está vinculado (para excluir do dropdown) */
  excludeFunnelIds?: string[];
}

export default function FunnelLinker({ leadId, excludeFunnelIds = [] }: Props) {
  const { data: funnels = [] } = useLeadFunnels();
  const [funnelId, setFunnelId] = useState<string>('');
  const [stageId, setStageId] = useState<string>('');
  const link = useLinkLeadToFunnel();

  const availableFunnels = (funnels as any[]).filter(f => !excludeFunnelIds.includes(f.id));
  const { data: stagesByFunnel = {} } = useLeadFunnelStages(funnelId ? [funnelId] : []);
  const stages = funnelId ? (stagesByFunnel[funnelId] || []) : [];

  // Reset stage when funnel changes
  useEffect(() => {
    setStageId('');
  }, [funnelId]);

  const handleLink = () => {
    if (!funnelId || !stageId) return;
    const funnel = availableFunnels.find(f => f.id === funnelId);
    link.mutate(
      { leadId, funnelId, stageId, funnelName: funnel?.name },
      {
        onSuccess: () => {
          setFunnelId('');
          setStageId('');
        },
      }
    );
  };

  if (availableFunnels.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground italic">
        Nenhum funil disponível para vincular
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-border p-2 space-y-1.5">
      <Select value={funnelId} onValueChange={setFunnelId}>
        <SelectTrigger className="h-7 text-[10px] px-2 bg-muted/30">
          <SelectValue placeholder="Selecionar funil…" />
        </SelectTrigger>
        <SelectContent>
          {availableFunnels.map((f: any) => (
            <SelectItem key={f.id} value={f.id} className="text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color || 'hsl(var(--primary))' }} />
                {f.name}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={stageId} onValueChange={setStageId} disabled={!funnelId || stages.length === 0}>
        <SelectTrigger className="h-7 text-[10px] px-2 bg-muted/30">
          <SelectValue placeholder={!funnelId ? 'Escolha o funil primeiro' : (stages.length === 0 ? 'Sem etapas' : 'Selecionar etapa…')} />
        </SelectTrigger>
        <SelectContent>
          {stages.map((s: any) => (
            <SelectItem key={s.id} value={s.id} className="text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color || '#888' }} />
                {s.name}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        size="sm"
        className="w-full h-7 text-[10px]"
        onClick={handleLink}
        disabled={!funnelId || !stageId || link.isPending}
      >
        <Plus className="h-3 w-3 mr-1" />
        {link.isPending ? 'Vinculando…' : 'Vincular ao funil'}
      </Button>
    </div>
  );
}
