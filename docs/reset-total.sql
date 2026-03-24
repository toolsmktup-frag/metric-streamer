-- ==============================================
-- RESET TOTAL DE DADOS
-- Mantém: funis, etapas, instâncias, usuários, organizações, configurações
-- Remove: vendas, leads, CRM, chats WhatsApp
-- ==============================================

-- 1) CRM / Leads (ordem por FK)
TRUNCATE TABLE public.lead_events CASCADE;
TRUNCATE TABLE public.lead_stage_positions CASCADE;
TRUNCATE TABLE public.leads CASCADE;
TRUNCATE TABLE public.meta_sync_log CASCADE;

-- 2) Vendas / Transações
TRUNCATE TABLE public.ticto_transactions CASCADE;
TRUNCATE TABLE public.customer_purchases CASCADE;
TRUNCATE TABLE public.unified_customers CASCADE;

-- 3) WhatsApp (mensagens + contatos)
TRUNCATE TABLE public.whatsapp_messages CASCADE;
TRUNCATE TABLE public.whatsapp_contacts CASCADE;

-- Pronto! Configurações de funis, etapas, instâncias e usuários foram preservadas.
