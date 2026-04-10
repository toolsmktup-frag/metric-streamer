

## Plano: Botão "Atualizar Funil" no Kanban + Cron Automático

### Decisão

Implementar **ambos** — não são excludentes:

- **Cron automático** (1x/dia, meia-noite BRT): garante consistência sem intervenção humana. É leve — uma query SQL por funil.
- **Botão no Kanban**: dá controle imediato ao vendedor para forçar atualização antes de uma sessão de ligações.

### Alterações

**1. Botão "Atualizar Funil" no KanbanBoard**
- Adicionar prop `onBulkMoveOverdue` e `bulkMoving` ao `KanbanBoard`
- Renderizar o botão com ícone `RefreshCw` no header do Kanban (junto aos controles de busca/sort)
- Só aparece se existem produtos com `auto_move_stage_id` + `recontact_days` configurados
- Passar as props desde `LeadFunnelDetail.tsx` (já existe a lógica de bulk move lá)

**2. Edge Function `recontact-cron`**
- Nova função em `supabase/functions/recontact-cron/index.ts`
- Autenticação via `service_role_key`
- Busca todos os `lead_funnel_products` com `recontact_days` + `auto_move_stage_id`
- Para cada produto, identifica leads vencidos e faz UPDATE em batch
- Registra eventos `auto_recontact_move` em `lead_events`

**3. SQL do Cron Job** (doc para rodar no Supabase SQL Editor)
- `cron.schedule('recontact-daily', '0 3 * * *', ...)` — 3:00 UTC = 0:00 BRT
- Mesmo padrão do `wz-scheduler-cron` existente

**4. Texto atualizado no FunnelProductsConfig**
- Informar que a atualização roda automaticamente à meia-noite, além do botão manual

### Arquivos modificados
- `src/components/lead-funnels/KanbanBoard.tsx` — adicionar botão
- `src/pages/LeadFunnelDetail.tsx` — passar props de bulk move ao KanbanBoard
- `supabase/functions/recontact-cron/index.ts` — nova Edge Function
- `docs/migration_recontact_cron.sql` — SQL do cron job
- `src/components/lead-funnels/FunnelProductsConfig.tsx` — atualizar texto descritivo

