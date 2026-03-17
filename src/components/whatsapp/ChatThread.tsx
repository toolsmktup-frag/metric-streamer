import { useRef, useEffect, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, CheckCheck, Clock, Ban, Download, Play, Pause } from 'lucide-react';
import type { WhatsAppMessage } from '@/hooks/useWhatsApp';
import { format } from 'date-fns';

interface ChatThreadProps {
  messages: WhatsAppMessage[];
  loading: boolean;
  phone: string | null;
}

function StatusIcon({ status, direction }: { status: string; direction: string }) {
  if (direction === 'inbound') return null;
  switch (status) {
    case 'pending': return <Clock className="h-3 w-3 text-muted-foreground" />;
    case 'sent': return <Check className="h-3 w-3 text-muted-foreground" />;
    case 'delivered': return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case 'read': return <CheckCheck className="h-3 w-3 text-blue-500" />;
    case 'failed': return <Ban className="h-3 w-3 text-destructive" />;
    default: return null;
  }
}

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const changeSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <audio
        ref={audioRef}
        src={src}
        onEnded={() => setPlaying(false)}
        preload="metadata"
      />
      <button onClick={toggle} className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors">
        {playing ? <Pause className="h-3.5 w-3.5 text-primary" /> : <Play className="h-3.5 w-3.5 text-primary" />}
      </button>
      <div className="flex-1 h-1 bg-border rounded-full" />
      <button onClick={changeSpeed} className="text-[10px] font-bold text-muted-foreground hover:text-foreground">
        {speed}x
      </button>
    </div>
  );
}

function MediaRenderer({ message }: { message: WhatsAppMessage }) {
  const { message_type, media_url, body } = message;

  if (!media_url) return null;

  switch (message_type) {
    case 'image':
      return (
        <div className="max-w-[240px]">
          <img src={media_url} alt="" className="rounded-lg w-full cursor-pointer" loading="lazy" />
          {body && <p className="text-sm mt-1">{body}</p>}
        </div>
      );
    case 'video':
      return (
        <div className="max-w-[280px]">
          <video src={media_url} controls className="rounded-lg w-full" preload="metadata" />
          {body && <p className="text-sm mt-1">{body}</p>}
        </div>
      );
    case 'audio':
    case 'ptt':
      return <AudioPlayer src={media_url} />;
    case 'document':
      return (
        <a
          href={media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Download className="h-4 w-4" />
          {message.media_filename || 'Documento'}
        </a>
      );
    default:
      return null;
  }
}

export default function ChatThread({ messages, loading, phone }: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!phone) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Selecione uma conversa
      </div>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Carregando mensagens...
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-2 min-h-full flex flex-col justify-end">
        {messages.map(msg => {
          const isOut = msg.direction === 'outbound';
          const isDeleted = msg.is_deleted;
          const time = format(new Date(msg.created_at), 'HH:mm');

          return (
            <div
              key={msg.id}
              className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[65%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  isOut
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-card border border-border text-foreground rounded-bl-sm'
                } ${isDeleted ? 'opacity-50 italic' : ''}`}
              >
                {msg.message_type !== 'text' && msg.media_url && !isDeleted ? (
                  <MediaRenderer message={msg} />
                ) : (
                  <p className="whitespace-pre-wrap break-words">{msg.body || ''}</p>
                )}

                <div className={`flex items-center gap-1 mt-1 ${isOut ? 'justify-end' : 'justify-start'}`}>
                  <span className={`text-[10px] ${isOut ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {time}
                  </span>
                  <StatusIcon status={msg.status} direction={msg.direction} />
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
