import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppInstance {
  id: string;
  organization_id: string;
  instance_name: string;
  phone_number: string | null;
  api_url: string;
  api_token: string;
  display_name: string | null;
  profile_pic_url: string | null;
  status: string;
}

export interface WhatsAppMessage {
  id: string;
  organization_id: string;
  instance_id: string;
  phone: string;
  body: string | null;
  message_type: string;
  direction: 'inbound' | 'outbound';
  status: string;
  media_url: string | null;
  media_mime_type: string | null;
  media_filename: string | null;
  message_id_external: string | null;
  payload_raw: any;
  is_deleted: boolean;
  lead_id: string | null;
  sender_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatSummary {
  phone: string;
  last_message: WhatsAppMessage;
  sender_name: string | null;
  unread_count: number;
  contact_name?: string | null;
  contact_picture?: string | null;
}

const PROJECT_ID = 'emfbocpmphtftqcezaib';
const FUNCTIONS_URL = `https://${PROJECT_ID}.supabase.co/functions/v1`;

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Authorization': `Bearer ${session?.access_token}`,
    'Content-Type': 'application/json',
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmJvY3BtcGh0ZnRxY2V6YWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODc4ODAsImV4cCI6MjA4ODU2Mzg4MH0.EpE1RwQhmk4C9YFdVjnJXp__cI8LPiic5dMqIMP1g8M',
  };
}

export function useWhatsAppInstances() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .order('created_at', { ascending: true });
      if (!error && data) setInstances(data as any);
      setLoading(false);
    }
    fetch();
  }, []);

  return { instances, loading };
}

export function useWhatsAppChats(instanceId: string | null) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoad = useRef(true);

  const fetchChats = useCallback(async () => {
    if (!instanceId) return;
    if (initialLoad.current) setLoading(true);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${FUNCTIONS_URL}/whatsapp-chats?action=list_chats&instance_id=${instanceId}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (err) {
      console.error('Error fetching chats:', err);
    } finally {
      setLoading(false);
      initialLoad.current = false;
    }
  }, [instanceId]);

  useEffect(() => {
    fetchChats();
    const interval = setInterval(fetchChats, 10000);
    return () => clearInterval(interval);
  }, [fetchChats]);

  return { chats, loading, refetch: fetchChats };
}

export function useWhatsAppMessages(instanceId: string | null, phone: string | null) {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    if (!instanceId || !phone) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `${FUNCTIONS_URL}/whatsapp-chats?action=messages&instance_id=${instanceId}&phone=${encodeURIComponent(phone)}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoading(false);
    }
  }, [instanceId, phone]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    fetchMessages();
  }, [fetchMessages]);

  // Realtime subscription
  useEffect(() => {
    if (!instanceId || !phone) return;

    const channel = supabase
      .channel(`whatsapp-msgs-${phone}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `phone=eq.${phone}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMessages(prev => {
              // Deduplicate
              const exists = prev.some(
                m => m.id === (payload.new as any).id ||
                  (m.message_id_external && m.message_id_external === (payload.new as any).message_id_external)
              );
              if (exists) return prev;
              return [...prev, payload.new as WhatsAppMessage];
            });
          } else if (payload.eventType === 'UPDATE') {
            setMessages(prev =>
              prev.map(m => m.id === (payload.new as any).id ? { ...m, ...payload.new } as WhatsAppMessage : m)
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [instanceId, phone]);

  return { messages, loading, refetch: fetchMessages };
}

export async function sendWhatsAppMessage(params: {
  instance_id: string;
  phone: string;
  body?: string;
  message_type?: string;
  media_url?: string;
  media_filename?: string;
  action?: 'send' | 'edit' | 'delete';
  message_id?: string;
}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${FUNCTIONS_URL}/whatsapp-send`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to send');
  }
  return res.json();
}

export async function sendPresence(instanceId: string, phone: string) {
  const headers = await getAuthHeaders();
  await fetch(`${FUNCTIONS_URL}/whatsapp-presence`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ instance_id: instanceId, phone }),
  }).catch(() => {}); // Best effort
}

export async function fetchContactInfo(instanceId: string, phone: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${FUNCTIONS_URL}/whatsapp-contact-info?instance_id=${instanceId}&phone=${encodeURIComponent(phone)}`,
    { headers }
  );
  if (!res.ok) return { name: null, picture: null };
  return res.json();
}
