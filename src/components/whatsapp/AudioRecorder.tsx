import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { sendWhatsAppMessage } from '@/hooks/useWhatsApp';
import { toast } from 'sonner';
import type { WhatsAppMessage } from '@/hooks/useWhatsApp';

interface AudioRecorderProps {
  instanceId: string;
  phone: string;
  onOptimisticSend?: (msg: WhatsAppMessage) => void;
  onOptimisticUpdate?: (tempId: string, status: string) => void;
}

export default function AudioRecorder({ instanceId, phone, onOptimisticSend, onOptimisticUpdate }: AudioRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    mediaRecorder.current = null;
    chunks.current = [];
    setDuration(0);
    setRecording(false);
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.current = recorder;
      chunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.start(100);
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch {
      toast.error('Não foi possível acessar o microfone');
    }
  };

  const cancelRecording = () => {
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop();
    }
    cleanup();
  };

  const sendRecording = async () => {
    if (!mediaRecorder.current || mediaRecorder.current.state !== 'recording') return;

    const recorder = mediaRecorder.current;
    
    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }

        const ext = recorder.mimeType.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(chunks.current, { type: recorder.mimeType });
        chunks.current = [];
        
        const tempId = `temp-${crypto.randomUUID()}`;
        const optimisticMsg: WhatsAppMessage = {
          id: tempId,
          organization_id: '',
          instance_id: instanceId,
          phone,
          body: null,
          message_type: 'audio',
          direction: 'outbound',
          status: 'pending',
          media_url: null,
          media_mime_type: recorder.mimeType,
          media_filename: null,
          message_id_external: null,
          payload_raw: null,
          is_deleted: false,
          lead_id: null,
          sender_name: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        onOptimisticSend?.(optimisticMsg);
        setRecording(false);
        setDuration(0);

        try {
          const path = `${instanceId}/${Date.now()}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from('whatsapp-media')
            .upload(path, blob);
          if (uploadErr) throw uploadErr;

          const { data: urlData } = supabase.storage
            .from('whatsapp-media')
            .getPublicUrl(path);

          await sendWhatsAppMessage({
            instance_id: instanceId,
            phone,
            message_type: 'audio',
            media_url: urlData.publicUrl,
          });

          onOptimisticUpdate?.(tempId, 'sent');
        } catch (err: any) {
          onOptimisticUpdate?.(tempId, 'failed');
          toast.error(err.message || 'Erro ao enviar áudio');
        }

        resolve();
      };

      recorder.stop();
    });
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (!recording) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={startRecording}
        title="Gravar áudio"
      >
        <Mic className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-1 bg-destructive/10 rounded-lg px-3 py-1.5 animate-pulse">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
        onClick={cancelRecording}
        title="Cancelar"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2 flex-1">
        <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
        <span className="text-sm font-mono text-destructive font-medium">
          {formatTime(duration)}
        </span>
        <span className="text-xs text-muted-foreground">Gravando...</span>
      </div>

      <Button
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={sendRecording}
        title="Enviar áudio"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
