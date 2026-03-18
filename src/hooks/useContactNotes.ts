import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ContactNote {
  id: string;
  phone: string;
  content: string;
  created_by: string | null;
  created_at: string;
}

export function useContactNotes(phone: string | null) {
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotes = useCallback(async () => {
    if (!phone) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('whatsapp_contact_notes')
        .select('*')
        .eq('phone', phone)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setNotes(data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => {
    setNotes([]);
    fetchNotes();
  }, [fetchNotes]);

  const addNote = async (content: string) => {
    if (!phone || !content.trim()) return;
    try {
      const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await (supabase as any)
        .from('whatsapp_contact_notes')
        .insert({
          organization_id: orgId,
          phone,
          content: content.trim(),
          created_by: user?.id || null,
        });
      if (error) throw error;
      toast.success('Nota adicionada');
      fetchNotes();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao adicionar nota');
    }
  };

  const deleteNote = async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from('whatsapp_contact_notes')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setNotes(prev => prev.filter(n => n.id !== id));
      toast.success('Nota removida');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover nota');
    }
  };

  return { notes, loading, addNote, deleteNote, refetch: fetchNotes };
}
