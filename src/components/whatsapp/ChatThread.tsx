import { useRef, useEffect, useState, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, CheckCheck, Clock, Ban, Download, Play, Pause, MoreVertical, FileText, Eye, Copy, Maximize2, Reply, Smile, Copy as CopyIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { WhatsAppMessage } from '@/hooks/useWhatsApp';
import type { WhatsAppInstance } from '@/hooks/useWhatsApp';
import { getInstanceDisplayName, reactToWhatsAppMessage } from '@/hooks/useWhatsApp';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { linkify } from '@/lib/linkify';
import MediaLightbox, { type MediaType } from './MediaLightbox';
import QuickReactionPicker from './QuickReactionPicker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

function downloadFile(url: string, filename?: string | null) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || '';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function copyLinkToClipboard(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copiado');
  } catch {
    toast.error('Não foi possível copiar');
  }
}

function MediaActionsMenu({ onView, url, filename, dark = false }: { onView: () => void; url: string; filename?: string | null; dark?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={`h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
            dark
              ? 'bg-black/50 text-white hover:bg-black/70'
              : 'bg-background/80 text-foreground hover:bg-background border border-border'
          }`}
          aria-label="Mais opções"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={onView}>
          <Eye className="h-4 w-4 mr-2" /> Visualizar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => downloadFile(url, filename)}>
          <Download className="h-4 w-4 mr-2" /> Baixar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => copyLinkToClipboard(url)}>
          <Copy className="h-4 w-4 mr-2" /> Copiar link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ChatThreadProps {
  messages: WhatsAppMessage[];
  loading: boolean;
  phone: string | null;
  /** Pass instances to show instance badges on outbound messages in unified mode */
  instances?: WhatsAppInstance[];
  /** Triggered when user picks "Responder" from a message's menu */
  onReply?: (msg: WhatsAppMessage) => void;
  /** Effective instance id used for outbound actions (reactions) */
  instanceId?: string;
  /** Phone of the open chat — required to send reactions */
  phoneForActions?: string;
}

function StatusIcon({ status, direction }: { status: string; direction: string }) {
  if (direction === 'inbound') return null;
  switch (status) {
    case 'pending': return <Clock className="h-3 w-3 text-muted-foreground" />;
    case 'sent': return <Check className="h-3 w-3 text-muted-foreground" />;
    case 'delivered': return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case 'read': return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
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

function formatMessageDayLabel(date: Date) {
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return format(date, 'EEEE, dd/MM/yyyy', { locale: ptBR });
}

function needsProxyDownload(src: string | null) {
  if (!src) return false;
  return src.includes('mmg.whatsapp.net') || /\.enc(\?|$)/i.test(src);
}

function AudioPlayer({ message, src, isOutbound = false }: { message: WhatsAppMessage; src: string; isOutbound?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => needsProxyDownload(src) ? null : src);
  const [resolving, setResolving] = useState(() => needsProxyDownload(src));
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!needsProxyDownload(src)) {
      setResolvedSrc(src);
      setResolving(false);
      return;
    }

    setResolvedSrc(null);
    setResolving(true);
    setUnavailable(false);

    supabase.functions.invoke('whatsapp-media', {
      body: { message_id: message.id },
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) throw error;

      if (data?.fallback === true) {
        setUnavailable(true);
        setResolving(false);
        return;
      }

      const nextSrc = data?.dataUrl || data?.fileURL || null;
      if (!nextSrc) throw new Error('No playable media returned');

      setResolvedSrc(nextSrc);
      setResolving(false);
    }).catch((err) => {
      if (cancelled) return;
      console.error('[AudioPlayer] resolve failed:', err.message || String(err), 'message:', message.id);
      setResolving(false);
    });

    return () => {
      cancelled = true;
    };
  }, [message.id, src]);

  if (unavailable) {
    return (
      <div className="flex items-center gap-2 min-w-[200px] text-xs text-muted-foreground italic">
        <Play className="h-4 w-4 shrink-0 opacity-50" />
        <span>Áudio expirado no WhatsApp</span>
      </div>
    );
  }

  const playableSrc = resolvedSrc || undefined;

  const toggle = () => {
    if (!audioRef.current || !playableSrc || resolving) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setPlaying(true);
      }).catch((err) => {
        console.error('[AudioPlayer] play failed:', err.message, 'src:', playableSrc?.slice(0, 80));
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
        src={playableSrc}
        preload="metadata"
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
        onTimeUpdate={() => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime); }}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onError={(e) => { console.error('[AudioPlayer] load error:', (e.target as HTMLAudioElement)?.error?.message, 'src:', playableSrc?.slice(0, 80)); }}
      />
      <button
        onClick={toggle}
        disabled={!playableSrc || resolving}
        className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 ${isOutbound ? 'bg-primary-foreground/20 hover:bg-primary-foreground/30' : 'bg-primary/10 hover:bg-primary/20'}`}
      >
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
          <span>{resolving ? '...' : formatTime(currentTime)}</span>
          <span>{resolving ? 'carregando' : formatTime(duration)}</span>
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

  const v2Msg = raw.message || raw;
  if (v2Msg.mediaUrl || v2Msg.media_url || v2Msg.fileUrl || v2Msg.file_url) {
    return v2Msg.mediaUrl || v2Msg.media_url || v2Msg.fileUrl || v2Msg.file_url;
  }
  if (typeof v2Msg.content === 'object' && v2Msg.content) {
    if (v2Msg.content.url || v2Msg.content.URL || v2Msg.content.mediaUrl || v2Msg.content.fileUrl) {
      return v2Msg.content.url || v2Msg.content.URL || v2Msg.content.mediaUrl || v2Msg.content.fileUrl;
    }
  }

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

function ProxiedImage({ message, fallbackUrl, caption }: { message: WhatsAppMessage; fallbackUrl: string; caption?: string | null }) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => needsProxyDownload(fallbackUrl) ? null : fallbackUrl);
  const [loading, setLoading] = useState(() => needsProxyDownload(fallbackUrl));
  const [error, setError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!needsProxyDownload(fallbackUrl)) {
      setResolvedUrl(fallbackUrl);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase.functions.invoke('whatsapp-media', {
      body: { message_id: message.id },
    }).then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) { setError(true); setLoading(false); return; }
      if (data?.fallback === true) { setError(true); setLoading(false); return; }
      const url = data?.dataUrl || data?.fileURL || null;
      if (url) setResolvedUrl(url);
      else setError(true);
      setLoading(false);
    }).catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [message.id, fallbackUrl]);

  if (error) return <div className="text-xs text-muted-foreground italic">Imagem expirada no WhatsApp</div>;

  return (
    <div className="max-w-[240px]">
      {loading ? (
        <div className="w-[200px] h-[150px] rounded-lg bg-muted animate-pulse flex items-center justify-center text-xs text-muted-foreground">Carregando...</div>
      ) : (
        <div className="relative group">
          <img
            src={resolvedUrl!}
            alt="Imagem WhatsApp"
            className="rounded-lg w-full cursor-pointer"
            loading="lazy"
            onClick={() => setLightboxOpen(true)}
          />
          <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity md:opacity-0 [@media(hover:none)]:opacity-100">
            <MediaActionsMenu
              dark
              url={resolvedUrl!}
              filename={message.media_filename}
              onView={() => setLightboxOpen(true)}
            />
          </div>
          <MediaLightbox
            open={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            type="image"
            url={resolvedUrl!}
            filename={message.media_filename}
          />
        </div>
      )}
      {caption && <p className="text-sm mt-1 whitespace-pre-wrap break-words">{linkify(caption)}</p>}
    </div>
  );
}

function ProxiedVideo({ message, fallbackUrl, caption }: { message: WhatsAppMessage; fallbackUrl: string; caption?: string | null }) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => needsProxyDownload(fallbackUrl) ? null : fallbackUrl);
  const [loading, setLoading] = useState(() => needsProxyDownload(fallbackUrl));
  const [error, setError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!needsProxyDownload(fallbackUrl)) {
      setResolvedUrl(fallbackUrl);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase.functions.invoke('whatsapp-media', {
      body: { message_id: message.id },
    }).then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) { setError(true); setLoading(false); return; }
      if (data?.fallback === true) { setError(true); setLoading(false); return; }
      const url = data?.dataUrl || data?.fileURL || null;
      if (url) setResolvedUrl(url);
      else setError(true);
      setLoading(false);
    }).catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [message.id, fallbackUrl]);

  if (error) return <div className="text-xs text-muted-foreground italic">Vídeo expirado no WhatsApp</div>;

  return (
    <div className="max-w-[280px]">
      {loading ? (
        <div className="w-[240px] h-[180px] rounded-lg bg-muted animate-pulse flex items-center justify-center text-xs text-muted-foreground">Carregando...</div>
      ) : (
        <div className="relative group">
          <video src={resolvedUrl!} controls className="rounded-lg w-full" preload="metadata" />
          <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity [@media(hover:none)]:opacity-100">
            <button
              onClick={() => setLightboxOpen(true)}
              className="h-7 w-7 rounded-full bg-black/50 text-white hover:bg-black/70 flex items-center justify-center"
              aria-label="Expandir vídeo"
              title="Expandir"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <MediaActionsMenu
              dark
              url={resolvedUrl!}
              filename={message.media_filename}
              onView={() => setLightboxOpen(true)}
            />
          </div>
          <MediaLightbox
            open={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            type="video"
            url={resolvedUrl!}
            filename={message.media_filename}
          />
        </div>
      )}
      {caption && <p className="text-sm mt-1 whitespace-pre-wrap break-words">{linkify(caption)}</p>}
    </div>
  );
}

function DocumentCard({ message, url }: { message: WhatsAppMessage; url: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const filename = message.media_filename || 'Documento';
  const mime = (message as any).media_mimetype || '';
  const isPdf = /pdf/i.test(mime) || /\.pdf($|\?)/i.test(filename) || /\.pdf($|\?)/i.test(url);
  const type: MediaType = isPdf ? 'pdf' : 'document';

  return (
    <>
      <div
        onClick={() => setLightboxOpen(true)}
        className="flex items-center gap-2 p-2 rounded-lg bg-background/40 hover:bg-background/60 border border-border/50 cursor-pointer min-w-[200px] max-w-[260px] text-current"
      >
        <FileText className="h-8 w-8 shrink-0 opacity-80" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{filename}</p>
          <p className="text-[10px] opacity-70 uppercase">{isPdf ? 'PDF' : (mime.split('/')[1] || 'Arquivo')}</p>
        </div>
        <MediaActionsMenu
          url={url}
          filename={filename}
          onView={() => setLightboxOpen(true)}
        />
      </div>
      <MediaLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        type={type}
        url={url}
        filename={filename}
        mimeType={mime}
      />
    </>
  );
}

function MediaRenderer({ message }: { message: WhatsAppMessage }) {
  const message_type = detectRealMessageType(message);
  const { body } = message;
  const media_url = extractMediaUrlFromPayload(message);

  if (!media_url) {
    if (message_type === 'audio' || message_type === 'ptt') {
      return (
        <div className="flex items-center gap-2 min-w-[200px] text-xs text-muted-foreground italic">
          <Play className="h-4 w-4 shrink-0" />
          <span>Áudio não disponível</span>
        </div>
      );
    }
    if (message_type === 'image') {
      return <div className="text-xs text-muted-foreground italic">Imagem não disponível</div>;
    }
    if (message_type === 'video') {
      return <div className="text-xs text-muted-foreground italic">Vídeo não disponível</div>;
    }
    return null;
  }

  switch (message_type) {
    case 'image':
      return <ProxiedImage message={message} fallbackUrl={media_url} caption={body} />;
    case 'video':
      return <ProxiedVideo message={message} fallbackUrl={media_url} caption={body} />;
    case 'audio':
    case 'ptt':
      return <AudioPlayer message={message} src={media_url} isOutbound={message.direction === 'outbound'} />;
    case 'document':
      return <DocumentCard message={message} url={media_url} />;
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

/** Menu of 3 dots universal: Reply / React / Copy */
function MessageActionsMenu({
  msg,
  isOut,
  onReply,
  onReact,
  canReact,
}: {
  msg: WhatsAppMessage;
  isOut: boolean;
  onReply?: (msg: WhatsAppMessage) => void;
  onReact?: (msg: WhatsAppMessage, emoji: string) => void;
  canReact: boolean;
}) {
  const [reactionOpen, setReactionOpen] = useState(false);
  const hasText = !!msg.body && msg.body.trim().length > 0;

  return (
    <div
      className={`absolute top-1 ${isOut ? 'left-1' : 'right-1'} opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity [@media(hover:none)]:opacity-100`}
      onClick={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`h-6 w-6 rounded-full flex items-center justify-center transition-colors ${
              isOut
                ? 'bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/30'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
            aria-label="Mais opções"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isOut ? 'start' : 'end'}>
          {onReply && (
            <DropdownMenuItem onClick={() => onReply(msg)}>
              <Reply className="h-4 w-4 mr-2" /> Responder
            </DropdownMenuItem>
          )}
          {canReact && onReact && (
            <QuickReactionPicker
              open={reactionOpen}
              onOpenChange={setReactionOpen}
              onSelect={(emoji) => onReact(msg, emoji)}
              trigger={
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setReactionOpen(true); }}>
                  <Smile className="h-4 w-4 mr-2" /> Reagir
                </DropdownMenuItem>
              }
            />
          )}
          {hasText && (
            <DropdownMenuItem onClick={() => {
              navigator.clipboard.writeText(msg.body || '').then(
                () => toast.success('Texto copiado'),
                () => toast.error('Não foi possível copiar')
              );
            }}>
              <CopyIcon className="h-4 w-4 mr-2" /> Copiar texto
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Render reactions pill at the bottom of the bubble */
function ReactionsBar({
  msg,
  isOut,
  onRemoveOwn,
}: {
  msg: WhatsAppMessage;
  isOut: boolean;
  onRemoveOwn?: (msg: WhatsAppMessage) => void;
}) {
  const reactions = msg.reactions || [];
  if (!reactions || reactions.length === 0) return null;

  const groups = new Map<string, { count: number; ownReacted: boolean }>();
  for (const r of reactions) {
    if (!r?.emoji) continue;
    const g = groups.get(r.emoji) || { count: 0, ownReacted: false };
    g.count += 1;
    if (r.from_me) g.ownReacted = true;
    groups.set(r.emoji, g);
  }
  if (groups.size === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1 mt-1 ${isOut ? 'justify-end' : 'justify-start'}`}>
      {Array.from(groups.entries()).map(([emoji, g]) => (
        <button
          key={emoji}
          onClick={(e) => {
            e.stopPropagation();
            if (g.ownReacted) onRemoveOwn?.(msg);
          }}
          className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] border shadow-sm transition-colors ${
            g.ownReacted
              ? 'bg-primary/15 border-primary/30 text-foreground hover:bg-primary/25'
              : 'bg-card border-border text-foreground'
          }`}
          title={g.ownReacted ? 'Clique para remover sua reação' : ''}
        >
          <span>{emoji}</span>
          {g.count > 1 && <span className="text-muted-foreground">{g.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Render quoted message block inside the bubble */
function QuoteBlock({ replyTo, isOut }: { replyTo: WhatsAppMessage['reply_to']; isOut: boolean }) {
  if (!replyTo) return null;
  const text = replyTo.text || '(mídia)';
  const sender = replyTo.sender_name || 'Mensagem';
  return (
    <div
      className={`flex items-stretch gap-2 mb-1.5 rounded overflow-hidden text-xs cursor-pointer ${
        isOut ? 'bg-primary-foreground/15' : 'bg-muted'
      }`}
      onClick={() => {
        if (!replyTo.id) return;
        const el = document.querySelector(`[data-msg-external-id="${CSS.escape(replyTo.id)}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }}
      role="button"
      tabIndex={0}
    >
      <div className={`w-1 shrink-0 ${isOut ? 'bg-primary-foreground/70' : 'bg-primary'}`} />
      <div className="flex-1 min-w-0 py-1 pr-2">
        <div className={`font-semibold truncate ${isOut ? 'text-primary-foreground' : 'text-primary'}`}>
          {sender}
        </div>
        <div className={`truncate ${isOut ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
          {text}
        </div>
      </div>
    </div>
  );
}

export default function ChatThread({ messages, loading, phone, instances, onReply, instanceId, phoneForActions }: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const handleReact = async (msg: WhatsAppMessage, emoji: string) => {
    if (!instanceId || !phoneForActions) {
      toast.error('Não foi possível identificar a instância');
      return;
    }
    if (!msg.message_id_external) {
      toast.error('Mensagem ainda não sincronizada');
      return;
    }
    try {
      await reactToWhatsAppMessage({
        instance_id: msg.instance_id || instanceId,
        phone: phoneForActions,
        message_id: msg.id,
        emoji,
      });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao reagir');
    }
  };

  const handleRemoveReaction = async (msg: WhatsAppMessage) => {
    await handleReact(msg, '');
  };

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
        {messages.map((msg, index) => {
          const isOut = msg.direction === 'outbound';
          const isDeleted = msg.is_deleted;
          const time = format(new Date(msg.created_at), 'HH:mm');
          const instanceName = instanceMap?.get(msg.instance_id);
          const canReact = !!msg.message_id_external && !!instanceId && !!phoneForActions && !isDeleted;
          const isOptimistic = msg.id.startsWith('temp-');
          const currentDate = new Date(msg.created_at);
          const previousDate = index > 0 ? new Date(messages[index - 1].created_at) : null;
          const showDateSeparator = !previousDate || !isSameDay(currentDate, previousDate);

          return (
            <div key={msg.id}>
              {showDateSeparator && (
                <div className="flex items-center justify-center py-2">
                  <span className="rounded-full border border-border bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                    {formatMessageDayLabel(currentDate)}
                  </span>
                </div>
              )}

              <div
                data-msg-id={msg.id}
                data-msg-external-id={msg.message_id_external || ''}
                className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`group relative max-w-[65%] rounded-2xl px-3 py-2 pr-8 text-sm shadow-sm ${
                    isOut
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-card border border-border text-foreground rounded-bl-sm'
                  } ${isDeleted ? 'opacity-50 italic' : ''}`}
                >
                  {!isDeleted && !isOptimistic && (
                    <MessageActionsMenu
                      msg={msg}
                      isOut={isOut}
                      onReply={onReply}
                      onReact={handleReact}
                      canReact={canReact}
                    />
                  )}

                  {instanceName && isOut && (
                    <div className="mb-1">
                      <InstanceBadge instanceName={instanceName} isOutbound={isOut} />
                    </div>
                  )}

                  <QuoteBlock replyTo={msg.reply_to} isOut={isOut} />

                  {(() => {
                    const realType = detectRealMessageType(msg);
                    const hasMedia = realType !== 'text' && (extractMediaUrlFromPayload(msg) || realType === 'audio' || realType === 'ptt');
                    return hasMedia && !isDeleted ? (
                      <MediaRenderer message={msg} />
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{linkify(msg.body || '')}</p>
                    );
                  })()}

                  <div className={`flex items-center gap-1 mt-1 ${isOut ? 'justify-end' : 'justify-start'}`}>
                    <span className={`text-[10px] ${isOut ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      {time}
                    </span>
                    <StatusIcon status={msg.status} direction={msg.direction} />
                  </div>

                  <ReactionsBar msg={msg} isOut={isOut} onRemoveOwn={handleRemoveReaction} />
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