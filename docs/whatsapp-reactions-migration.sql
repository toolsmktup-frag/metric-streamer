-- ============================================
-- WhatsApp: reactions + reply_to (quote)
-- Execute no SQL Editor do Supabase Cloud
-- ============================================

alter table public.whatsapp_messages
  add column if not exists reactions jsonb not null default '[]'::jsonb,
  add column if not exists reply_to jsonb;

-- (Opcional) índice extra pra match por external id em reações
create index if not exists idx_whatsapp_messages_external_id_v2
  on public.whatsapp_messages(message_id_external);
