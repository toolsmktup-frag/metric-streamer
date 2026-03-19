import { useRef, useEffect, useState, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, CheckCheck, Clock, Ban, Download, Play, Pause } from 'lucide-react';
import type { WhatsAppMessage } from '@/hooks/useWhatsApp';
import type { WhatsAppInstance } from '@/hooks/useWhatsApp';
import { getInstanceDisplayName } from '@/hooks/useWhatsApp';
import { format } from 'date-fns';

interface ChatThreadProps {
  messages: WhatsAppMessage[];
  loading: boolean;
  phone: string | null;
  /** Pass instances to show instance badges on outbound messages in unified mode */
  instances?: WhatsAppInstance[];
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

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function AudioPlayer({ src, isOutbound = false }: { src: string; isOutbound?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setPlaying(true);
      }).catch((err) => {
        console.error('[AudioPlayer] play failed:', err.message, 'src:', src?.slice(0, 80));
      });
    }
  };

  const changeSpeed = () => {
    const speeds = [1, 1.5, 2, 2.5, 3];
    const idx = speeds.indexOf(speed);
    const next = speeds[(idx + 1) % speeds.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const trackColor = isOutbound ? 'rgb(var(--primary-foreground) / 0.3)' : 'hsl(var(--border))';
  const fillColor = isOutbound ? 'rgb(var(--primary-foreground) / 0.9)' : 'hsl(var(--primary))';

  return (
    <div className="flex items-center gap-2 min-w-[220px] max-w-[280px]">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        crossOrigin="anonymous"
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
        onTimeUpdate={() => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime); }}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onError={(e) => { console.error('[AudioPlayer] load error:', (e.target as HTMLAudioElement)?.error?.message, 'src:', src?.slice(0, 80)); }}
      />
      />
      <button onClick={toggle} className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center transition-colors ${isOutbound ? 'bg-primary-foreground/20 hover:bg-primary-foreground/30' : 'bg-primary/10 hover:bg-primary/20'}`}>
        {playing
          ? <Pause className={`h-3.5 w-3.5 ${isOutbound ? 'text-primary-foreground' : 'text-primary'}`} />
          : <Play className={`h-3.5 w-3.5 ${isOutbound ? 'text-primary-foreground' : 'text-primary'}`} />}
      </button>
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 appearance-none rounded-full cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${fillColor} ${progress}%, ${trackColor} ${progress}%)`,
          }}
        />
        <div className={`flex justify-between text-[10px] ${isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <button onClick={changeSpeed} className={`text-[10px] font-bold shrink-0 ${isOutbound ? 'text-primary-foreground/70 hover:text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
        {speed}x
      </button>
    </div>
  );
}

/** Try to extract media URL from payload_raw when media_url column is null */
function extractMediaUrlFromPayload(message: WhatsAppMessage): string | null {
  if (message.media_url) return message.media_url;
  const raw = message.payload_raw;
  if (!raw) return null;
  
  // UAZAPI v2: check message.content object
  const v2Msg = raw.message || raw;
  if (v2Msg.mediaUrl || v2Msg.media_url || v2Msg.fileUrl || v2Msg.file_url) {
    return v2Msg.mediaUrl || v2Msg.media_url || v2Msg.fileUrl || v2Msg.file_url;
  }
  if (typeof v2Msg.content === 'object' && v2Msg.content) {
    if (v2Msg.content.url || v2Msg.content.URL || v2Msg.content.mediaUrl || v2Msg.content.fileUrl) {
      return v2Msg.content.url || v2Msg.content.URL || v2Msg.content.mediaUrl || v2Msg.content.fileUrl;
    }
  }
  
  // Legacy baileys
  const legacyMsg = raw.message;
  if (legacyMsg) {
    return legacyMsg.audioMessage?.url || legacyMsg.imageMessage?.url || legacyMsg.videoMessage?.url || legacyMsg.documentMessage?.url || null;
  }
  return null;
}

/** Re-detect message type from payload_raw for messages saved as 'text' but actually media */
function detectRealMessageType(message: WhatsAppMessage): string {
  if (message.message_type !== 'text') return message.message_type;
  const raw = message.payload_raw as any;
  if (!raw) return 'text';
  const v2Msg = raw.message || raw;
  if (typeof v2Msg.content === 'object' && v2Msg.content) {
    if (v2Msg.content.PTT || v2Msg.content.ptt) return 'audio';
    const mime = (v2Msg.content.mimetype || '').toLowerCase();
    if (mime.includes('audio')) return 'audio';
    if (mime.includes('image')) return 'image';
    if (mime.includes('video')) return 'video';
  }
  const mediaType = (v2Msg.mediaType || '').toLowerCase();
  if (mediaType === 'ptt' || mediaType.includes('audio')) return 'audio';
  if (mediaType.includes('image')) return 'image';
  if (mediaType.includes('video')) return 'video';
  return 'text';
}

function MediaRenderer({ message }: { message: WhatsAppMessage }) {
  const message_type = detectRealMessageType(message);
  const { body } = message;
  const media_url = extractMediaUrlFromPayload(message);

  if (!media_url) {
    // For audio/ptt without URL, show a placeholder
    if (message_type === 'audio' || message_type === 'ptt') {
      return (
        <div className="flex items-center gap-2 min-w-[200px] text-xs text-muted-foreground italic">
          <Play className="h-4 w-4 shrink-0" />
          <span>Áudio não disponível</span>
        </div>
      );
    }
    return null;
  }

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
      return <AudioPlayer src={media_url} isOutbound={message.direction === 'outbound'} />;
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

/** Small badge showing which instance sent a message */
function InstanceBadge({ instanceName, isOutbound }: { instanceName: string; isOutbound: boolean }) {
  return (
    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
      isOutbound
        ? 'bg-primary-foreground/15 text-primary-foreground/80'
        : 'bg-muted text-muted-foreground'
    }`}>
      {instanceName}
    </span>
  );
}

export default function ChatThread({ messages, loading, phone, instances }: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Build instance map for badge display
  const instanceMap = useMemo(() => {
    if (!instances || instances.length <= 1) return null;
    const map = new Map<string, string>();
    for (const inst of instances) {
      map.set(inst.id, getInstanceDisplayName(inst));
    }
    return map;
  }, [instances]);

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
          const instanceName = instanceMap?.get(msg.instance_id);

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
                {/* Instance badge for outbound in unified mode */}
                {instanceName && isOut && (
                  <div className="mb-1">
                    <InstanceBadge instanceName={instanceName} isOutbound={isOut} />
                  </div>
                )}

                {(() => {
                  const realType = detectRealMessageType(msg);
                  const hasMedia = realType !== 'text' && (extractMediaUrlFromPayload(msg) || realType === 'audio' || realType === 'ptt');
                  return hasMedia && !isDeleted ? (
                    <MediaRenderer message={msg} />
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{msg.body || ''}</p>
                  );
                })()}

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