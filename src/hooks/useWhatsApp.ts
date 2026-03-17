import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

export function useWhatsAppInstances() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInstances = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('whatsapp_instances')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error && data) setInstances(data as any);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  // Validate real status from UAZAPI on mount
  useEffect(() => {
    if (instances.length === 0) return;
    const validateStatuses = async () => {
      for (const inst of instances) {
        try {
          const { data, error } = await supabase.functions.invoke('whatsapp-instance', {
            body: { instance_id: inst.id, action: 'status' },
          });
          if (error) {
            console.error('Status validation error for', inst.id, error);
            // On failure, mark as unverified/disconnected
            setInstances(prev => prev.map(i =>
              i.id === inst.id ? { ...i, status: 'disconnected' } : i
            ));
            continue;
          }
          const processed = data?.processed;
          if (processed) {
            setInstances(prev => prev.map(i =>
              i.id === inst.id
                ? {
                    ...i,
                    status: processed.status || i.status,
                    display_name: processed.display_name || i.display_name,
                    profile_pic_url: processed.profile_pic_url || i.profile_pic_url,
                  }
                : i
            ));
          }
        } catch {
          // On network failure, mark as disconnected
          setInstances(prev => prev.map(i =>
            i.id === inst.id ? { ...i, status: 'disconnected' } : i
          ));
        }
      }
    };
    validateStatuses();
  }, [instances.length]);

  return { instances, loading, refetch: fetchInstances };
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
        `${SUPABASE_URL}/functions/v1/whatsapp-chats?action=list_chats&instance_id=${instanceId}`,
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
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${(supabase as any).supabaseUrl}/functions/v1/whatsapp-chats?action=messages&instance_id=${instanceId}&phone=${encodeURIComponent(phone)}`,
        {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': (supabase as any).supabaseKey,
            'Content-Type': 'application/json',
          },
        }
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
  const { data, error } = await supabase.functions.invoke('whatsapp-send', {
    body: params,
  });
  if (error) throw new Error(error.message || 'Failed to send');
  return data;
}

export async function sendPresence(instanceId: string, phone: string) {
  await supabase.functions.invoke('whatsapp-presence', {
    body: { instance_id: instanceId, phone },
  }).catch(() => {}); // Best effort
}

export async function fetchContactInfo(instanceId: string, phone: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${(supabase as any).supabaseUrl}/functions/v1/whatsapp-contact-info?instance_id=${instanceId}&phone=${encodeURIComponent(phone)}`,
      {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': (supabase as any).supabaseKey,
          'Content-Type': 'application/json',
        },
      }
    );
    if (!res.ok) return { name: null, picture: null };
    return res.json();
  } catch {
    return { name: null, picture: null };
  }
}
