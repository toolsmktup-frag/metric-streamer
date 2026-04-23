import { Search, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import type { ChatSummary } from '@/hooks/useWhatsApp';
import type { MultiChatSummary } from '@/hooks/useWhatsAppMultiChat';
import { format, isToday, isYesterday, isThisWeek, isThisYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatChatTime(date: Date): string {
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Ontem';
  if (isThisWeek(date, { locale: ptBR })) return format(date, 'EEE', { locale: ptBR });
  if (isThisYear(date)) return format(date, 'dd/MM');
  return format(date, 'dd/MM/yyyy');
}

interface ChatListProps {
  chats: (ChatSummary | MultiChatSummary)[];
  loading: boolean;
  selectedKey: string | null;
  onSelectChat: (phone: string, instanceId?: string) => void;
  showInstanceBadge?: boolean;
}

function chatKey(c: ChatSummary | MultiChatSummary): string {
  const iid = (c as any).instance_id;
  return iid ? `${iid}__${c.phone}` : c.phone;
}

function isMultiChat(chat: ChatSummary | MultiChatSummary): chat is MultiChatSummary {
  return 'instance_id' in chat;
}

function formatPhone(phone: string): string {
  if (phone.length === 13 && phone.startsWith('55')) {
    const ddd = phone.slice(2, 4);
    const p1 = phone.slice(4, 9);
    const p2 = phone.slice(9);
    return `(${ddd}) ${p1}-${p2}`;
  }
  return phone;
}

export default function ChatList({ chats, loading, selectedKey, onSelectChat, showInstanceBadge }: ChatListProps) {
  const [search, setSearch] = useState('');

  const filtered = chats.filter(c => {
    const q = search.toLowerCase();
    return (
      c.phone.includes(q) ||
      (c.sender_name?.toLowerCase().includes(q)) ||
      (c.contact_name?.toLowerCase().includes(q)) ||
      (c.last_message.body?.toLowerCase().includes(q)) ||
      (isMultiChat(c) && c.instance_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      {/* Header */}
      <div className="p-3 border-b border-border space-y-2">
        <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          Conversas
        </h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {loading && chats.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Nenhuma conversa</div>
        ) : (
          filtered.map((chat) => {
            const multi = isMultiChat(chat);
            const key = chatKey(chat);
            const isSelected = selectedKey === key;
            const displayName = chat.contact_name || chat.sender_name || formatPhone(chat.phone);
            const preview = chat.last_message.is_deleted
              ? '🚫 Mensagem apagada'
              : chat.last_message.message_type !== 'text'
                ? `📎 ${chat.last_message.message_type}`
                : (chat.last_message.body || '').slice(0, 50);
            const time = formatDistanceToNow(new Date(chat.last_message.created_at), { addSuffix: false, locale: ptBR });

            return (
              <button
                key={key}
                onClick={() => onSelectChat(chat.phone, (chat as any).instance_id)}
                className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-border/50 ${
                  isSelected ? 'bg-accent' : 'hover:bg-muted/50'
                }`}
              >
                {/* Avatar */}
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {chat.contact_picture ? (
                    <img src={chat.contact_picture} alt="" className="h-full w-full object-cover rounded-full" />
                  ) : (
                    <span className="text-sm font-semibold text-primary">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground truncate">{displayName}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0 ml-1">{time}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-muted-foreground truncate">{preview}</span>
                    {chat.unread_count > 0 && (
                      <span className="ml-1 shrink-0 h-4 min-w-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                        {chat.unread_count}
                      </span>
                    )}
                  </div>
                  {/* Instance badge */}
                  {showInstanceBadge && multi && (
                    <div className="mt-1">
                      <span
                        className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium text-white"
                        style={{ backgroundColor: chat.instance_color }}
                      >
                        {chat.instance_name}
                      </span>
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </ScrollArea>
    </div>
  );
}
