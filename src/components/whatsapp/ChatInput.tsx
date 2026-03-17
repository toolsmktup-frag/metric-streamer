import { useState, useRef, useCallback } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { sendWhatsAppMessage, sendPresence } from '@/hooks/useWhatsApp';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ChatInputProps {
  instanceId: string;
  phone: string;
}

export default function ChatInput({ instanceId, phone }: ChatInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>();

  const handleTextChange = (value: string) => {
    setText(value);
    // Send typing indicator (debounced)
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      sendPresence(instanceId, phone);
    }, 500);
  };

  const handleSend = useCallback(async () => {
    const msg = text.trim();
    if (!msg && !attachment) return;

    setSending(true);
    try {
      let mediaUrl: string | undefined;
      let messageType = 'text';
      let mediaFilename: string | undefined;

      if (attachment) {
        // Upload to storage
        const ext = attachment.name.split('.').pop();
        const path = `${instanceId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('whatsapp-media')
          .upload(path, attachment);

        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from('whatsapp-media')
          .getPublicUrl(path);

        mediaUrl = urlData.publicUrl;
        mediaFilename = attachment.name;

        // Detect type
        if (attachment.type.startsWith('image/')) messageType = 'image';
        else if (attachment.type.startsWith('video/')) messageType = 'video';
        else if (attachment.type.startsWith('audio/')) messageType = 'audio';
        else messageType = 'document';
      }

      await sendWhatsAppMessage({
        instance_id: instanceId,
        phone,
        body: msg || undefined,
        message_type: messageType,
        media_url: mediaUrl,
        media_filename: mediaFilename,
      });

      setText('');
      setAttachment(null);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  }, [text, attachment, instanceId, phone]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  return (
    <div className="border-t border-border bg-card p-3">
      {/* Attachment preview */}
      {attachment && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-muted rounded-lg text-xs">
          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate flex-1 text-foreground">{attachment.name}</span>
          <button onClick={() => setAttachment(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
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

        <Input
          value={text}
          onChange={e => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite uma mensagem..."
          className="flex-1 h-9 text-sm"
          disabled={sending}
        />

        <Button
          onClick={handleSend}
          disabled={sending || (!text.trim() && !attachment)}
          size="icon"
          className="h-9 w-9 shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
