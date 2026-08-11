import { useMemo } from 'react';
import { CalendarClock, Mic, Check, X, AlertTriangle, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useScheduledMessagesForChat,
  useAllScheduledMessages,
  useCancelScheduledMessage,
  type ScheduledMessage,
} from '@/hooks/useScheduledMessages';

const STATUS_META: Record<
  ScheduledMessage['status'],
  { label: string; icon: typeof Check; className: string }
> = {
  scheduled: { label: 'Agendada', icon: CalendarClock, className: 'text-primary' },
  sent:      { label: 'Enviada',  icon: Check,         className: 'text-kpi-positive' },
  failed:    { label: 'Falhou',   icon: AlertTriangle, className: 'text-destructive' },
  canceled:  { label: 'Cancelada',icon: Ban,           className: 'text-muted-foreground' },
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const amanha = new Date();
  amanha.setDate(hoje.getDate() + 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay(d, hoje)) return `Hoje às ${hora}`;
  if (sameDay(d, amanha)) return `Amanhã às ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`;
}

function ScheduledRow({
  msg,
  showContact,
  onCancel,
  canceling,
}: {
  msg: ScheduledMessage;
  showContact?: boolean;
  onCancel: (id: string) => void;
  canceling: boolean;
}) {
  const meta = STATUS_META[msg.status];
  const Icon = meta.icon;

  return (
    <div className="rounded-lg border border-border bg-card p-2.5 text-xs">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.className}`} />
        <span className={`font-semibold ${meta.className}`}>{formatWhen(msg.scheduled_for)}</span>
        {msg.status !== 'scheduled' && (
          <span className="text-[10px] text-muted-foreground">· {meta.label}</span>
        )}
        {msg.status === 'scheduled' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-auto text-muted-foreground hover:text-destructive"
            onClick={() => onCancel(msg.id)}
            disabled={canceling}
            aria-label="Cancelar programação"
            title="Cancelar programação"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {showContact && msg.contact_name && (
        <p className="mt-1 font-medium text-foreground truncate">{msg.contact_name}</p>
      )}

      <div className="mt-1 flex items-start gap-1.5 text-muted-foreground">
        {msg.message_type === 'audio' && <Mic className="h-3 w-3 mt-0.5 shrink-0" />}
        <div className="min-w-0">
          {msg.body && <p className="line-clamp-2 leading-snug">{msg.body}</p>}
          {msg.message_type === 'audio' && (
            <p className="leading-snug">
              {msg.body ? '+ áudio' : 'Áudio'}
              {msg.audio_duration_seconds ? ` (${msg.audio_duration_seconds}s)` : ''}
            </p>
          )}
        </div>
      </div>

      {msg.status === 'failed' && msg.last_error && (
        <p className="mt-1 text-[10px] text-destructive leading-snug">{msg.last_error}</p>
      )}
    </div>
  );
}

/** Bloco compacto no painel lateral da conversa. */
export function ChatScheduledMessages({
  instanceId,
  phone,
}: {
  instanceId?: string;
  phone?: string;
}) {
  const { data: messages = [], isLoading } = useScheduledMessagesForChat(instanceId, phone);
  const cancelMutation = useCancelScheduledMessage();

  // Só o que ainda vai acontecer (+ falhas recentes, que pedem ação).
  const relevant = useMemo(
    () => messages.filter(m => m.status === 'scheduled' || m.status === 'failed'),
    [messages],
  );

  if (isLoading || relevant.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <CalendarClock className="h-3.5 w-3.5" />
        Mensagens programadas
        <span className="ml-auto rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-bold">
          {relevant.length}
        </span>
      </h4>
      <div className="space-y-2">
        {relevant.map(m => (
          <ScheduledRow
            key={m.id}
            msg={m}
            onCancel={id => cancelMutation.mutate(id)}
            canceling={cancelMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}

/** Lista geral — todas as programadas da usuária. */
export default function ScheduledMessagesList() {
  const { data: messages = [], isLoading } = useAllScheduledMessages();
  const cancelMutation = useCancelScheduledMessage();

  const { proximas, historico } = useMemo(() => {
    const proximas = messages.filter(m => m.status === 'scheduled');
    const historico = messages
      .filter(m => m.status !== 'scheduled')
      .sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for))
      .slice(0, 50);
    return { proximas, historico };
  }, [messages]);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground p-3">Carregando...</p>;
  }

  if (messages.length === 0) {
    return (
      <div className="p-4 text-center">
        <CalendarClock className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <p className="mt-2 text-xs text-muted-foreground">
          Nenhuma mensagem programada.
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          Use o ícone de calendário na conversa para agendar um follow-up.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      {proximas.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Próximas ({proximas.length})
          </h4>
          {proximas.map(m => (
            <ScheduledRow
              key={m.id}
              msg={m}
              showContact
              onCancel={id => cancelMutation.mutate(id)}
              canceling={cancelMutation.isPending}
            />
          ))}
        </div>
      )}

      {historico.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Histórico
          </h4>
          {historico.map(m => (
            <ScheduledRow
              key={m.id}
              msg={m}
              showContact
              onCancel={id => cancelMutation.mutate(id)}
              canceling={cancelMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
