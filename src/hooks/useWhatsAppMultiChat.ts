import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ChatSummary, WhatsAppInstance } from './useWhatsApp';
import { getInstanceDisplayName } from './useWhatsApp';

const SUPABASE_URL = 'https://emfbocpmphtftqcezaib.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmJvY3BtcGh0ZnRxY2V6YWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODc4ODAsImV4cCI6MjA4ODU2Mzg4MH0.EpE1RwQhmk4C9YFdVjnJXp__cI8LPiic5dMqIMP1g8M';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Authorization': `Bearer ${session?.access_token}`,
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
  };
}

const INSTANCE_COLORS = [
  'hsl(var(--primary))',
  'hsl(142, 76%, 36%)',
  'hsl(262, 83%, 58%)',
  'hsl(24, 95%, 53%)',
  'hsl(350, 89%, 60%)',
  'hsl(199, 89%, 48%)',
];

export function getInstanceColor(index: number): string {
  return INSTANCE_COLORS[index % INSTANCE_COLORS.length];
}

export interface MultiChatSummary extends ChatSummary {
  instance_id: string;
  instance_name: string;
  instance_color: string;
}

export function useWhatsAppMultiChats(instances: WhatsAppInstance[]) {
  const [chats, setChats] = useState<MultiChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoad = useRef(true);

  const instanceIds = JSON.stringify(instances.map(i => i.id));

  const fetchAllChats = useCallback(async () => {
    if (instances.length === 0) {
      setChats([]);
      setLoading(false);
      return;
    }

    if (initialLoad.current) setLoading(true);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/whatsapp-chats?action=list_chats&instance_id=all`,
        { headers }
      );

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Error fetching unified chats:', errorText);
        setChats([]);
        return;
      }

      const data: ChatSummary[] = await res.json();
      const instanceMeta = new Map(
        instances.map((inst, index) => [
          inst.id,
          {
            instance_name: getInstanceDisplayName(inst),
            instance_color: getInstanceColor(index),
          },
        ])
      );

      const merged = (Array.isArray(data) ? data : [])
        .map((chat): MultiChatSummary => {
          const meta = instanceMeta.get(chat.instance_id || '') || {
            instance_name: 'Instância',
            instance_color: getInstanceColor(0),
          };

          return {
            ...chat,
            instance_id: chat.instance_id || '',
            instance_name: meta.instance_name,
            instance_color: meta.instance_color,
          };
        })
        .sort((a, b) =>
          new Date(b.last_message.created_at).getTime() -
          new Date(a.last_message.created_at).getTime()
        );

      setChats(merged);
    } catch (err) {
      console.error('Error fetching multi chats:', err);
      setChats([]);
    } finally {
      setLoading(false);
      initialLoad.current = false;
    }
  }, [instanceIds]);

  useEffect(() => {
    fetchAllChats();
    const interval = setInterval(fetchAllChats, 15000);
    return () => clearInterval(interval);
  }, [fetchAllChats]);

  return { chats, loading, refetch: fetchAllChats };
}
