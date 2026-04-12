

## Plano: Classificação automática de valor por tipo de evento (positivo/negativo)

### Ideia

Cada `stage_transition_rule` já tem o `event_name` que levou o lead àquela etapa. Em vez de configurar manualmente "valor negativo" por etapa, o sistema **já sabe** qual evento colocou o lead ali. A lógica fica assim:

- **Eventos de receita confirmada**: `purchase` → valor **positivo** (verde)
- **Eventos de receita pendente**: `pix_generated` → valor **pendente** (amarelo) — ainda não entrou, mas pode entrar
- **Eventos de perda/recuperação**: `abandoned_cart`, `refused`, `refunded`, `chargeback`, `canceled` → valor **em risco** (vermelho) — dinheiro que não entrou ou saiu

Quando o lead paga o Pix, o webhook atualiza o evento para `purchase`, a regra de transição move para "Compra Aprovada", e o valor automaticamente vira positivo.

### O que muda na prática

**No card do lead:**
- Badge verde `R$ 197,00` → compra aprovada (já existe via LTV)
- Badge amarelo `R$ 197,00 Pendente` → Pix/Boleto gerado (aguardando pagamento)
- Badge vermelho `R$ 197,00 Recuperar` → carrinho abandonado, recusado, etc.

**No header da coluna:**
- Soma os valores e mostra com a cor correspondente ao tipo da etapa
- Não precisa de toggle manual — o sistema classifica pelo `event_name` da regra que levou o lead àquela etapa

### Mudanças técnicas

**1. RPC `sync_lead_from_sale` — Salvar metadata no lead**
- Atualmente o lead é criado com `metadata = '{}'` e o `amount` vai só para `lead_events`
- Alterar para fazer merge: `metadata = leads.metadata || p_metadata` no UPDATE
- Assim `lead.metadata.amount`, `status`, `product_name` ficam disponíveis para o card
- Nova migration SQL

**2. `StageTransitionRule` — Adicionar campo `value_classification`**
- Novo campo enum: `positive` (receita), `pending` (aguardando), `negative` (perda/recuperação)
- Default automático baseado no `event_name`:
  - `purchase` → `positive`
  - `pix_generated` → `pending`
  - `abandoned_cart`, `refused`, `refunded`, `chargeback`, `canceled` → `negative`
- O usuário pode sobrescrever na UI se quiser
- Migration SQL para adicionar coluna

**3. `LeadCard.tsx` — Badge de valor contextual**
- Ler `lead.metadata.amount` (ou `amount_cents / 100`)
- Cor do badge baseada na classificação da regra que governa aquela etapa
- Verde = positivo, Amarelo = pendente, Vermelho = recuperar

**4. `KanbanBoard.tsx` — Header da coluna com valor classificado**
- `getStageRevenue` passa a considerar a classificação
- Header mostra: `R$ 591,00 pendente` (amarelo) ou `R$ 394,00 recuperar` (vermelho)

**5. `FunnelConfigTab.tsx` — Exibir classificação na UI de regras**
- Mostrar um indicador visual (cor) ao lado de cada regra
- Opcional: dropdown para sobrescrever a classificação automática

### Arquivos alterados
- `supabase/migrations/` — 2 migrations: (a) atualizar RPC v5 para merge metadata, (b) adicionar `value_classification` em `stage_transition_rules`
- `src/types/leadFunnels.ts` — atualizar tipo `StageTransitionRule`
- `src/components/lead-funnels/LeadCard.tsx` — badge contextual
- `src/components/lead-funnels/KanbanBoard.tsx` — header com classificação
- `src/components/lead-funnels/FunnelConfigTab.tsx` — indicador visual nas regras
- `docs/rpc-sync-lead-from-sale-v5.sql` — atualizar doc

