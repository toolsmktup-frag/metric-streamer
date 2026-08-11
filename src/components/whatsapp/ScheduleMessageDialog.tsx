import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Mic, Square, Trash2, Play, Pause, CalendarClock, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCreateScheduledMessage } from '@/hooks/useScheduledMessages';

interface ScheduleMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  phone: string;
  leadId?: string | null;
  contactName?: string | null;
  /** Texto já digitado no chat, aproveitado como ponto de partida */
  initialText?: string;
}

/** "2026-08-12" no fuso local (não usar toISOString: joga a data pro UTC). */
function toLocalDateValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function ScheduleMessageDialog({
  open,
  onOpenChange,
  instanceId,
  phone,
  leadId,
  contactName,
  initialText,
}: ScheduleMessageDialogProps) {
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);

  // gravação (mesmo padrão do AudioRecorder do chat)
  const [recState, setRecState] = useState<'idle' | 'recording' | 'preview'>('idle');
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const mimeRef = useRef<string>('audio/webm');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const createMutation = useCreateScheduledMessage();

  const stopStream = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const resetAudio = useCallback(() => {
    stopStream();
    blobRef.current = null;
    chunks.current = [];
    setRecState('idle');
    setDuration(0);
    setPlaying(false);
  }, [stopStream]);

  // Ao abrir: sugere amanhã 9h e traz o texto do chat. Ao fechar: limpa tudo.
  useEffect(() => {
    if (open) {
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      setDate(toLocalDateValue(amanha));
      setTime('09:00');
      setText(initialText?.trim() || '');
    } else {
      resetAudio();
      setText('');
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => stopStream(), [stopStream]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      mimeRef.current = mime;
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorder.current = recorder;
      chunks.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
      recorder.start();
      setRecState('recording');
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch {
      toast.error('Não foi possível acessar o microfone');
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorder.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.onstop = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      blobRef.current = new Blob(chunks.current, { type: recorder.mimeType });
      setRecState('preview');
    };
    recorder.stop();
  };

  const togglePlayback = () => {
    if (!blobRef.current) return;
    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(blobRef.current);
    objectUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.play();
    setPlaying(true);
  };

  const scheduledDate = useMemo(() => {
    if (!date || !time) return null;
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    if ([y, m, d, hh, mm].some(n => Number.isNaN(n))) return null;
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }, [date, time]);

  const hasAudio = recState === 'preview' && !!blobRef.current;
  const hasContent = text.trim().length > 0 || hasAudio;
  const isFuture = !!scheduledDate && scheduledDate.getTime() > Date.now();
  const canSubmit = hasContent && isFuture && !saving && recState !== 'recording';

  const handleSchedule = async () => {
    if (!scheduledDate || !canSubmit) return;
    setSaving(true);
    try {
      let mediaUrl: string | null = null;
      let mediaMime: string | null = null;
      let audioSeconds: number | null = null;

      // Áudio ganha prioridade: fica salvo no storage aguardando o disparo.
      if (hasAudio && blobRef.current) {
        const blob = blobRef.current;
        const ext = mimeRef.current.includes('ogg') ? 'ogg' : 'webm';
        const path = `${instanceId}/agendadas/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('whatsapp-media')
          .upload(path, blob);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(path);
        mediaUrl = urlData.publicUrl;
        mediaMime = mimeRef.current;
        audioSeconds = duration;
      }

      await createMutation.mutateAsync({
        instance_id: instanceId,
        phone,
        lead_id: leadId ?? null,
        contact_name: contactName ?? null,
        message_type: mediaUrl ? 'audio' : 'text',
        body: text.trim() || null,
        media_url: mediaUrl,
        media_mime_type: mediaMime,
        audio_duration_seconds: audioSeconds,
        scheduled_for: scheduledDate,
      });

      toast.success(
        `Mensagem programada para ${scheduledDate.toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        })}`,
      );
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível programar a mensagem');
    } finally {
      setSaving(false);
    }
  };

  const minDate = toLocalDateValue(new Date());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            Programar mensagem
          </DialogTitle>
          <DialogDescription>
            {contactName ? <>Vai para <strong>{contactName}</strong>, </> : null}
            pelo mesmo número que você usa nesta conversa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sched-text" className="text-xs">Mensagem</Label>
            <textarea
              id="sched-text"
              value={text}
              onChange={e => setText(e.target.value)}
              rows={4}
              placeholder={contactName ? `Oi ${contactName}, tudo bem?...` : 'Escreva a mensagem...'}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Áudio (opcional)</Label>
            <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2">
              {recState === 'idle' && (
                <>
                  <Button type="button" variant="ghost" size="sm" onClick={startRecording} className="gap-2">
                    <Mic className="h-4 w-4" />
                    Gravar áudio
                  </Button>
                  <span className="text-xs text-muted-foreground">fica salvo até o envio</span>
                </>
              )}

              {recState === 'recording' && (
                <>
                  <span className="h-2 w-2 rounded-full bg-destructive animate-pulse shrink-0" />
                  <span className="text-sm font-mono-value">{formatSeconds(duration)}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={stopRecording} className="gap-2 ml-auto">
                    <Square className="h-4 w-4" />
                    Parar
                  </Button>
                </>
              )}

              {recState === 'preview' && (
                <>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={togglePlayback}>
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <span className="text-sm font-mono-value">{formatSeconds(duration)}</span>
                  <span className="text-xs text-muted-foreground">áudio pronto</span>
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-8 w-8 ml-auto text-destructive"
                    onClick={resetAudio}
                    aria-label="Descartar áudio"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
            {hasAudio && text.trim() && (
              <p className="text-[11px] text-muted-foreground">
                Áudio e texto vão juntos: o áudio é enviado com a legenda.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sched-date" className="text-xs">Dia</Label>
              <input
                id="sched-date"
                type="date"
                value={date}
                min={minDate}
                onChange={e => setDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sched-time" className="text-xs">Horário</Label>
              <input
                id="sched-time"
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          {scheduledDate && !isFuture && (
            <p className="text-xs text-destructive">
              Escolha um dia e horário no futuro.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSchedule} disabled={!canSubmit} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            Programar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
