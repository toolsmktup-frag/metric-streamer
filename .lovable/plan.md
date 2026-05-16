# Auditoria — Botão "Atualizar Funil" e lembrete de recontato (potes)

## Como funciona hoje (mapa rápido)

```text
                       ┌──────────────────────────────┐
   lead_funnel_products│ recontact_days (ex.: 30, 90) │
                       │ auto_move_from_stage_id      │  ← origem permitida
                       │ auto_move_stage_id           │  ← destino (Recontato)
                       └─────────────┬────────────────┘
                                     │
        ┌────────────────────────────┴──────────────────────────────┐
        │                                                            │
  Botão "Atualizar Funil"                              cron recontact-daily
  (KanbanBoard → LeadFunnelDetail.                    (03:00 UTC todo dia)
   handleBulkMoveOverdue)                              supabase/functions/
                                                       recontact-cron
        │                                                            │
        └─────── mesma regra: só move se VENCIDO ───────────────────┘
                 (daysRemaining < 0, isOverdue)
```

UI mostra badge "faltam Xd / atrasado Yd" em cada card (`useRecontactDeadlines`) e permite ordenar a coluna por recontato. Não existe disparo automático de mensagem 25 dias antes — o sistema **só age depois que vence**.

## Achados (do mais importante pro menor)

### 1. "Lembrar 25 dias antes" NÃO existe hoje
Tanto o botão quanto o cron só fazem uma coisa: **mover** o lead pra etapa de recontato **depois** que `purchase_date + recontact_days` já passou. Não há gatilho proativo "faltam N dias → manda WhatsApp" nem mudança de cor/etapa antecipada. A UI mostra o countdown, mas o sistema não dispara nada com base nele.

Opções pra resolver (decidir depois):
- a) Campo novo `remind_days_before` no `lead_funnel_products` + cron lê e dispara automação WhatsApp.
- b) Etapa intermediária "Lembrete enviado" com `auto_move_stage_id` separado e `recontact_days = original − 25`. Reaproveita 100% da infra atual.
- c) Trigger nativo na automação WZ por "dias desde última compra" (mais flexível, mais trabalho).

### 2. Botão e cron rodam regras LIGEIRAMENTE diferentes
- **Botão** (`handleBulkMoveOverdue`, linha 95-141 de `LeadFunnelDetail.tsx`) chama `moveLeadStage.mutateAsync` → passa por toda a cadeia de regras (registra `stage_transition`, dispara realtime, pode acionar automações).
- **Cron** (`recontact-cron/index.ts` linha 203-227) faz `UPDATE` direto em `lead_stage_positions` e só registra `lead_events { event_name: 'auto_recontact_move' }`.

Consequência: um lead movido pelo cron não aparece nos relatórios de movimentação por etapa do mesmo jeito que um movido pelo botão. Risco médio — dashboards de transição podem subcontar.

### 3. Soma de `recontact_days` pode confundir
Ambos somam: se o lead comprou Pote 30d + Pote 90d, o deadline = última compra + 120 dias. Isso é a memória `recontact-system` (linear accumulation) — mas pro caso "vendi 30d e quero recontatar pra vender 90d" o usuário talvez espere **30 dias do produto inicial**, não 120. Vale confirmar a intenção com a Gabi.

### 4. Match por substring é frágil
`product_name_contains` usa `includes()` case-insensitive sem ordenação. Se houver dois produtos cadastrados ("Articulabem" e "Articulabem Premium"), o primeiro a casar ganha — pode pegar o errado. Já existem `lead_product_mappings` (match explícito) com prioridade correta, então só dá problema quando o mapping não está preenchido.

### 5. Date parsing diverge entre UI e cron
- UI usa `parseLocalDateTime` (timezone local consistente).
- Cron faz parsing manual: `dd/MM/yyyy` vira meia-noite **local do servidor (UTC)**, ISO usa UTC direto. Em datas de borda (compra às 22h BRT do dia X) pode dar 1 dia de diferença entre o que aparece na UI e o que o cron decide.

### 6. Sem feedback de saúde
Hoje não dá pra saber, sem ler logs do cron, **se ele rodou ontem** ou quantos leads moveu. Único sinal é o `lead_events.event_name = 'auto_recontact_move'`.

## Sugestão de próximos passos (escolher um)

1. **Implementar lembrete proativo (#1)** — mais valor pro negócio, é a dor real (avisar antes do pote acabar). Opção (b) é a mais barata: criar uma etapa "Lembrete 25d antes" e configurar `recontact_days = produto_dias − 25`. Zero código novo.
2. **Unificar botão + cron (#2)** — fazer o cron chamar a mesma RPC/rota que o botão, garantindo logs consistentes.
3. **Painel de saúde** — pequeno card no topo do funil mostrando "última execução do cron, X leads movidos, Y vencidos pendentes".
4. **Tudo junto** — escopo médio, ~1 dia de trabalho.

Não recomendo mexer nos itens 3-5 agora a menos que apareça caso concreto — são riscos teóricos.

## Detalhes técnicos (referência)

- Arquivos centrais: `src/pages/LeadFunnelDetail.tsx` (95-141), `src/components/lead-funnels/KanbanBoard.tsx` (298-318), `src/hooks/useRecontactDeadlines.ts`, `supabase/functions/recontact-cron/index.ts`.
- Schema: `lead_funnel_products.{recontact_days, auto_move_stage_id, auto_move_from_stage_id}` (migrações em `docs/migration_recontact_cron.sql` + `docs/sql/setup-recompra-compra-aprovada-to-base-recontato.sql`).
- Cron: `pg_cron` `'recontact-daily'`, `0 3 * * *` (00h BRT) chamando edge function via `pg_net`.
- Filtro de origem: se `auto_move_from_stage_id` está setado, só move leads naquela etapa (protege quem está em negociação) — já funciona corretamente nos dois caminhos.

Me diz qual dos 4 caminhos seguir e eu detalho.
