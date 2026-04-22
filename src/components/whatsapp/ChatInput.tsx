import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, X, Smile, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { sendWhatsAppMessage, sendPresence } from '@/hooks/useWhatsApp';
import type { WhatsAppInstance, WhatsAppMessage } from '@/hooks/useWhatsApp';
import { getInstanceDisplayName } from '@/hooks/useWhatsApp';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import EmojiPicker from './EmojiPicker';
import AudioRecorder from './AudioRecorder';
import ShortcutMenu from './ShortcutMenu';
import ShortcutManager from './ShortcutManager';

interface ChatInputProps {
  instanceId: string;
  phone: string;
  onOptimisticSend?: (msg: WhatsAppMessage) => void;
  onOptimisticUpdate?: (tempId: string, status: string) => void;
  /** Available instances for the reply selector (unified mode) */
  instances?: WhatsAppInstance[];
  /** Currently selected reply instance */
  replyInstanceId?: string;
  /** Callback when user changes reply instance */
  onReplyInstanceChange?: (instanceId: string) => void;
  /** External text injection (e.g. from Sales Copilot). Updates as the value changes. */
  prefillText?: string;
  /** Called once the prefill has been consumed so the parent can clear it */
  onPrefillConsumed?: () => void;
}

function InstanceSelector({
  instances,
  selectedId,
  onChange,
}: {
  instances: WhatsAppInstance[];
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = instances.find(i => i.id === selectedId);

  if (instances.length <= 1) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 text-foreground shrink-0 max-w-[140px] transition-colors"
          title="Responder por..."
        >
          <span className="truncate">{selected ? getInstanceDisplayName(selected) : 'Selecionar'}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="p-1 w-48">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1 font-semibold">
          Responder por
        </div>
        {instances.map(inst => (
          <button
            key={inst.id}
            onClick={() => { onChange(inst.id); setOpen(false); }}
            className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors flex items-center gap-2 ${
              inst.id === selectedId ? 'bg-accent font-medium' : ''
            }`}
          >
            {inst.profile_pic_url && (
              <img src={inst.profile_pic_url} alt="" className="h-4 w-4 rounded-full object-cover shrink-0" />
            )}
            <span className="truncate">{getInstanceDisplayName(inst)}</span>
            {inst.status !== 'connected' && (
              <span className="text-[9px] text-destructive ml-auto">offline</span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export default function ChatInput({
  instanceId,
  phone,
  onOptimisticSend,
  onOptimisticUpdate,
  instances,
  replyInstanceId,
  onReplyInstanceChange,
  prefillText,
  onPrefillConsumed,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>();
  const isSending = useRef(false);

  // The actual instance to send from: reply selector or prop
  const sendInstanceId = replyInstanceId || instanceId;

  // Consume external prefill (from Sales Copilot)
  useEffect(() => {
    if (prefillText && prefillText.trim()) {
      setText(prefillText);
      onPrefillConsumed?.();
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.style.height = 'auto';
          el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
          el.focus();
          el.setSelectionRange(prefillText.length, prefillText.length);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillText]);


  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, []);

  const handleTextChange = (value: string) => {
    setText(value);
    requestAnimationFrame(autoResize);

    if (value.startsWith('/')) {
      setShowShortcuts(true);
    } else {
      setShowShortcuts(false);
    }

    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      sendPresence(sendInstanceId, phone);
    }, 500);
  };

  const handleEmojiSelect = (emoji: string) => {
    setText(prev => prev + emoji);
    setEmojiOpen(false);
  };

  const handleShortcutSelect = async (body: string, shortcut?: any) => {
    setText(body);
    setShowShortcuts(false);

    // If shortcut has media, fetch and set as attachment
    if (shortcut?.media_url) {
      try {
        const response = await fetch(shortcut.media_url);
        const blob = await response.blob();
        const filename = shortcut.media_filename || 'arquivo';
        const file = new File([blob], filename, { type: shortcut.media_type || blob.type });
        setAttachment(file);
      } catch (err) {
        console.error('Erro ao carregar mídia do atalho:', err);
        toast.error('Não foi possível carregar a mídia do atalho');
      }
    }
  };

  const handleSend = useCallback(async () => {
    const msg = text.trim();
    if (!msg && !attachment) return;
    if (isSending.current) return;
    isSending.current = true;

    const tempId = `temp-${crypto.randomUUID()}`;
    let mediaUrl: string | undefined;
    let messageType = 'text';
    let mediaFilename: string | undefined;
    const currentAttachment = attachment;

    const optimisticMsg: WhatsAppMessage = {
      id: tempId,
      organization_id: '',
      instance_id: sendInstanceId,
      phone,
      body: msg || null,
      message_type: messageType,
      direction: 'outbound',
      status: 'pending',
      media_url: null,
      media_mime_type: null,
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
    setText('');
    setAttachment(null);
    setShowShortcuts(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      if (currentAttachment) {
        const ext = currentAttachment.name.split('.').pop();
        const path = `${sendInstanceId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('whatsapp-media')
          .upload(path, currentAttachment);
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from('whatsapp-media')
          .getPublicUrl(path);

        mediaUrl = urlData.publicUrl;
        mediaFilename = currentAttachment.name;

        if (currentAttachment.type.startsWith('image/')) messageType = 'image';
        else if (currentAttachment.type.startsWith('video/')) messageType = 'video';
        else if (currentAttachment.type.startsWith('audio/')) messageType = 'audio';
        else messageType = 'document';
      }

      await sendWhatsAppMessage({
        instance_id: sendInstanceId,
        phone,
        body: msg || undefined,
        message_type: messageType,
        media_url: mediaUrl,
        media_filename: mediaFilename,
      });

      onOptimisticUpdate?.(tempId, 'sent');
    } catch (err: any) {
      onOptimisticUpdate?.(tempId, 'failed');
      toast.error(err.message || 'Erro ao enviar mensagem');
    } finally {
      isSending.current = false;
    }
  }, [text, attachment, sendInstanceId, phone, onOptimisticSend, onOptimisticUpdate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showShortcuts) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error('Arquivo muito grande (máx 20MB)');
        return;
      }
      setAttachment(file);
    }
  };

  const hasContent = text.trim() || attachment;
  const showInstanceSelector = instances && instances.length > 1 && replyInstanceId && onReplyInstanceChange;

  return (
    <div className="border-t border-border bg-card p-3 relative">
      {showShortcuts && (
        <ShortcutMenu
          query={text.slice(1)}
          onSelect={(body, shortcut) => handleShortcutSelect(body, shortcut)}
          onClose={() => setShowShortcuts(false)}
        />
      )}

      {attachment && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-muted rounded-lg text-xs">
          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate flex-1 text-foreground">{attachment.name}</span>
          <button onClick={() => setAttachment(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Instance selector for unified mode */}
        {showInstanceSelector && (
          <InstanceSelector
            instances={instances}
            selectedId={replyInstanceId}
            onChange={onReplyInstanceChange}
          />
        )}

        {/* Emoji picker */}
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
              <Smile className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="p-0 w-auto">
            <EmojiPicker onSelect={handleEmojiSelect} />
          </PopoverContent>
        </Popover>

        {/* File attach */}
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <ShortcutManager />

        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite uma mensagem... (/ para atalhos)"
          rows={1}
          className="flex-1 min-h-[36px] max-h-[120px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ overflow: 'auto' }}
        />

        {hasContent ? (
          <Button
            onClick={handleSend}
            disabled={!hasContent}
            size="icon"
            className="h-9 w-9 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        ) : (
          <AudioRecorder
            instanceId={sendInstanceId}
            phone={phone}
            onOptimisticSend={onOptimisticSend}
            onOptimisticUpdate={onOptimisticUpdate}
          />
        )}
      </div>
    </div>
  );
}