import { useState } from 'react';
import { Loader2, RotateCcw, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLeadByPhone } from '@/hooks/useLeadByPhone';

interface Props {
  phone: string;
}

// "Assumir" pausa a IA até clicar em "Devolver" (a auto-pausa por resposta no celular usa
// ~30min; aqui é manual, então seguramos por 30 dias).
const MANUAL_PAUSE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Barra fina acima do compositor: mostra se a IA (Girassol) está atendendo o contato e
 * permite assumir (pausa a IA) ou devolver. Lê/grava leads.metadata.bot_paused_until.
 */
export default function BotControlBar({ phone }: Props) {
  const { data: lead, refetch } = useLeadByPhone(phone);
  const [saving, setSaving] = useState(false);

  if (!lead?.id) return null;

  const until = (lead.metadata as any)?.bot_paused_until as string | undefined;
  const paused = !!until && new Date(until).getTime() > Date.now();

  const setPause = async (value: string | null) => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('set_lead_bot_pause', {
        p_lead_id: lead.id,
        p_until: value,
      });
      if (error) throw error;
      toast.success(value ? 'Você assumiu — IA pausada' : 'Devolvido pra IA');
      refetch();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao alterar o atendimento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={
        'flex items-center gap-2 px-3 py-1.5 border-t text-xs ' +
        (paused ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-primary/5')
      }
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {!paused && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        )}
        <span
          className={
            'relative inline-flex rounded-full h-2 w-2 ' + (paused ? 'bg-amber-500' : 'bg-emerald-500')
          }
        />
      </span>
      <span className="font-medium text-foreground">
        {paused ? '👤 Em atendimento humano' : '🌻 Atendido pela IA'}
      </span>
      <span className="text-muted-foreground hidden sm:inline">
        {paused ? 'a Girassol não responde este contato' : 'a Girassol responde automaticamente'}
      </span>
      <div className="flex-1" />
      <Button
        size="sm"
        variant={paused ? 'outline' : 'default'}
        className="h-7 text-[11px]"
        onClick={() => setPause(paused ? null : new Date(Date.now() + MANUAL_PAUSE_MS).toISOString())}
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
    </div>
  );
}
