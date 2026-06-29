import { useState } from 'react';
import { Bot, UserCheck, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  leadId: string;
  /** metadata.bot_paused_until do lead (ISO) — define se a IA está pausada */
  pausedUntil?: string | null;
  /** só quem atende o lead (dono/admin) pode alternar */
  canEdit: boolean;
  /** rechamar o lead após a troca */
  onChanged: () => void;
}

// "Assumir" pausa a IA por bastante tempo (até clicar em Devolver). A auto-pausa por
// resposta no celular usa ~30min; aqui é manual, então seguramos por 30 dias.
const MANUAL_PAUSE_MS = 30 * 24 * 60 * 60 * 1000;

export default function BotControlBanner({ leadId, pausedUntil, canEdit, onChanged }: Props) {
  const [saving, setSaving] = useState(false);
  const paused = !!pausedUntil && new Date(pausedUntil).getTime() > Date.now();

  const setPause = async (until: string | null) => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('set_lead_bot_pause', {
        p_lead_id: leadId,
        p_until: until,
      });
      if (error) throw error;
      toast.success(until ? 'Você assumiu — IA pausada neste contato' : 'Atendimento devolvido pra IA');
      onChanged();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao alterar o atendimento');
    } finally {
      setSaving(false);
    }
  };

  const assumir = () => setPause(new Date(Date.now() + MANUAL_PAUSE_MS).toISOString());
  const devolver = () => setPause(null);

  return (
    <div
      className={
        paused
          ? 'rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 flex items-center gap-2'
          : 'rounded-lg border border-primary/30 bg-primary/10 p-2.5 flex items-center gap-2'
      }
    >
      <div
        className={
          'h-7 w-7 shrink-0 rounded-full flex items-center justify-center ' +
          (paused ? 'bg-amber-500 text-white' : 'bg-primary text-primary-foreground')
        }
      >
        {paused ? <UserCheck className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-foreground leading-tight">
          {paused ? 'Em atendimento humano' : 'Sendo atendido pela IA 🌻'}
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight">
          {paused ? 'A IA não responde este contato' : 'A Girassol responde automaticamente'}
        </p>
      </div>
      {canEdit && (
        <Button
          size="sm"
          variant={paused ? 'outline' : 'default'}
          className="h-7 text-[10px] shrink-0"
          onClick={paused ? devolver : assumir}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : paused ? (
            <>
              <RotateCcw className="h-3 w-3 mr-1" />
              Devolver pra IA
            </>
          ) : (
            <>
              <UserCheck className="h-3 w-3 mr-1" />
              Assumir
            </>
          )}
        </Button>
      )}
    </div>
  );
}
