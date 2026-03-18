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

// Colors for instance badges
const INSTANCE_COLORS = [
  'hsl(var(--primary))',
  'hsl(142, 76%, 36%)',   // green
  'hsl(262, 83%, 58%)',   // purple
  'hsl(24, 95%, 53%)',    // orange
  'hsl(350, 89%, 60%)',   // red
  'hsl(199, 89%, 48%)',   // sky blue
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

  const fetchAllChats = useCallback(async () => {
    if (instances.length === 0) {
      setChats([]);
      setLoading(false);
      return;
    }

    if (initialLoad.current) setLoading(true);

    try {
      const headers = await getAuthHeaders();

      const results = await Promise.all(
        instances.map(async (inst, index) => {
          try {
            const res = await fetch(
              `${SUPABASE_URL}/functions/v1/whatsapp-chats?action=list_chats&instance_id=${inst.id}`,
              { headers }
            );
            if (!res.ok) return [];
            const data: ChatSummary[] = await res.json();
            return data.map(chat => ({
              ...chat,
              instance_id: inst.id,
              instance_name: inst.display_name || inst.instance_name,
              instance_color: getInstanceColor(index),
            }));
          } catch {
            return [];
          }
        })
      );

      const merged = results
        .flat()
        .sort((a, b) =>
          new Date(b.last_message.created_at).getTime() -
          new Date(a.last_message.created_at).getTime()
        );

      setChats(merged);
    } catch (err) {
      console.error('Error fetching multi chats:', err);
    } finally {
      setLoading(false);
      initialLoad.current = false;
    }
  }, [instances]);

  useEffect(() => {
    fetchAllChats();
    const interval = setInterval(fetchAllChats, 10000);
    return () => clearInterval(interval);
  }, [fetchAllChats]);

  return { chats, loading, refetch: fetchAllChats };
}
