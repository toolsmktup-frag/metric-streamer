import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, RotateCcw, MessageSquare } from 'lucide-react';
import { Lead, LeadStagePosition, LeadFunnelStage } from '@/types/leadFunnels';
import { RESOLUTION_REASONS, resolutionReasonLabel } from '@/lib/supportTicket';
import { useResolveSupportTicket } from '@/hooks/useResolveSupportTicket';

export interface ResolveTarget {
  position: LeadStagePosition & { lead: Lead };
  toStage: LeadFunnelStage;
}

interface Props {
  target: ResolveTarget | null;
  funnelId: string;
  resolvedBy?: string | null;
  onClose: () => void;
}

const ResolveTicketDialog: React.FC<Props> = ({ target, funnelId, resolvedBy, onClose }) => {
  const resolve = useResolveSupportTicket();
  const [reason, setReason] = React.useState('');
  const [note, setNote] = React.useState('');
  const [returnToBot, setReturnToBot] = React.useState(true);
  const [closingMessage, setClosingMessage] = React.useState('');

  // Reseta os campos sempre que abre um ticket novo
  React.useEffect(() => {
    if (target) {
      setReason('');
      setNote('');
      setReturnToBot(true);
      setClosingMessage('');
    }
    // Reset só ao trocar de ticket (id), não a cada render do mesmo alvo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.position.id]);

  if (!target) return null;

  const lead = target.position.lead;
  const phone = lead.phone || (lead.metadata?.phone as string) || null;
  const leadName = lead.name || lead.email || phone || 'Lead sem nome';

  const handleSubmit = () => {
    if (!reason) return;
    resolve.mutate(
      {
        positionId: target.position.id,
        leadId: target.position.lead_id,
        funnelId,
        fromStageId: target.position.stage_id,
        toStageId: target.toStage.id,
        toStageName: target.toStage.name,
        phone,
        reason,
        reasonLabel: resolutionReasonLabel(reason),
        note,
        returnToBot,
        closingMessage,
        resolvedBy,
      },
      { onSuccess: () => onClose() }
    );
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o && !resolve.isPending) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Resolver ticket
          </DialogTitle>
          <DialogDescription>
            Finalizar o atendimento de <span className="font-medium text-foreground">{leadName}</span> e mover pra "{target.toStage.name}".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Motivo */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Motivo da resolução</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {RESOLUTION_REASONS.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`text-xs px-2.5 py-1.5 rounded-md border text-left transition-colors ${
                    reason === r.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Observação livre */}
          <div className="space-y-1.5">
            <Label htmlFor="resolve-note" className="text-xs text-muted-foreground">Detalhes (opcional)</Label>
            <Textarea
              id="resolve-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="O que foi resolvido, contexto pro histórico..."
              className="min-h-[60px] text-sm"
            />
          </div>

          {/* Devolver pra Girassol */}
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="resolve-return" className="text-sm">Devolver pra Girassol</Label>
                <p className="text-[11px] text-muted-foreground">a IA volta a responder este contato</p>
              </div>
            </div>
            <Switch id="resolve-return" checked={returnToBot} onCheckedChange={setReturnToBot} />
          </div>

          {/* Mensagem de encerramento */}
          <div className="space-y-1.5">
            <Label htmlFor="resolve-msg" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              Mensagem de encerramento pro cliente (opcional)
            </Label>
            <Textarea
              id="resolve-msg"
              value={closingMessage}
              onChange={e => setClosingMessage(e.target.value)}
              placeholder={phone ? 'Ex: Qualquer coisa é só chamar! 🌻' : 'Lead sem telefone — não dá pra enviar'}
              disabled={!phone}
              className="min-h-[56px] text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={resolve.isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!reason || resolve.isPending} className="gap-1.5">
            {resolve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Resolver ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ResolveTicketDialog;
