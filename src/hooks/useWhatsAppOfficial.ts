import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface OfficialInstance {
  id: string;
  instance_name: string;
  display_name: string | null;
  phone_number: string | null;
  status: string;
  meta_phone_number_id: string | null;
  meta_waba_id: string | null;
}

export interface OfficialTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  strategy: string | null;
  parameter_format: string | null;
  components: any[];
  sample_variables: Record<string, string>;
  marketing_variables: Record<string, string>;
  meta_template_id: string | null;
  updated_at: string;
}

/** Instâncias conectadas via WhatsApp Cloud API (channel = 'official'). */
export function useWhatsAppOfficialInstances() {
  const [instances, setInstances] = useState<OfficialInstance[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('whatsapp_instances')
      .select('id, instance_name, display_name, phone_number, status, meta_phone_number_id, meta_waba_id, channel')
      .eq('channel', 'official')
      .order('created_at', { ascending: true });
    setInstances((data || []) as OfficialInstance[]);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { instances, loading, refetch };
}

/** Templates oficiais (whatsapp_templates), filtrados por RLS da org. */
export function useWhatsAppOfficialTemplates() {
  const [templates, setTemplates] = useState<OfficialTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('whatsapp_templates')
      .select('*')
      .order('updated_at', { ascending: false });
    setTemplates((data || []) as OfficialTemplate[]);
    setLoading(false);
  }, []);

  useEffect(() => { refetch(); }, [refetch]);
  return { templates, loading, refetch };
}

/** Conta as variáveis {{n}} do componente BODY de um template. */
export function countTemplateBodyVars(components: any[]): number {
  const body = (components || []).find((c) => String(c?.type).toUpperCase() === 'BODY');
  if (!body?.text) return 0;
  const all = String(body.text).match(/\{\{\d+\}\}/g) || [];
  return new Set(all.map((m) => m.replace(/\{\{|\}\}/g, ''))).size;
}
