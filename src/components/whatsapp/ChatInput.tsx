import { useState, useRef, useCallback } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { sendWhatsAppMessage, sendPresence } from '@/hooks/useWhatsApp';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { WhatsAppMessage } from '@/hooks/useWhatsApp';

interface ChatInputProps {
  instanceId: string;
  phone: string;
  onOptimisticSend?: (msg: WhatsAppMessage) => void;
  onOptimisticUpdate?: (tempId: string, status: string) => void;
}

export default function ChatInput({ instanceId, phone, onOptimisticSend, onOptimisticUpdate }: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>();

  const handleTextChange = (value: string) => {
    setText(value);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      sendPresence(instanceId, phone);
    }, 500);
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

    // Create optimistic message immediately
    const optimisticMsg: WhatsAppMessage = {
      id: tempId,
      organization_id: '',
      instance_id: instanceId,
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

    // Show message instantly & clear input
    onOptimisticSend?.(optimisticMsg);
    setText('');
    setAttachment(null);

    try {
      if (currentAttachment) {
        const ext = currentAttachment.name.split('.').pop();
        const path = `${instanceId}/${Date.now()}.${ext}`;
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
        instance_id: instanceId,
        phone,
        body: msg || undefined,
        message_type: messageType,
        media_url: mediaUrl,
        media_filename: mediaFilename,
      });

      // Mark as sent (will be replaced by realtime soon)
      onOptimisticUpdate?.(tempId, 'sent');
    } catch (err: any) {
      onOptimisticUpdate?.(tempId, 'failed');
      toast.error(err.message || 'Erro ao enviar mensagem');
    }
  }, [text, attachment, instanceId, phone, onOptimisticSend, onOptimisticUpdate]);

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
        />

        <Button
          onClick={handleSend}
          disabled={!text.trim() && !attachment}
          size="icon"
          className="h-9 w-9 shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
