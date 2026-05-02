## O problema (o que tá acontecendo hoje)

A função de "atualizar funil" (`recontact-cron` + botão na tela do funil) hoje funciona assim:

1. Pega TODO lead que tá no funil RECOMPRA - POTES (não importa em que etapa).
2. Calcula: data da última compra + dias de recontato.
3. Se já venceu → **move pra etapa configurada** (ex: "Hora de recontatar").

**O bug que você notou:** ela move qualquer lead, inclusive os que estão em "Aguardando resposta", "Em negociação", "Contato enviado", "Não fechou". Ou seja, atropela o trabalho da Gabi.

---

## A solução (simples e funcional)

Adicionar um campo extra na configuração do produto: **"Mover apenas se estiver na etapa: ___"** (com default = "Compra aprovada").

Aí a regra fica:

```text
SE lead está em [Compra aprovada]
E já passou X dias da compra
ENTÃO move pra [Hora de recontatar]
```

Qualquer lead que a vendedora tirou de "Compra aprovada" pra trabalhar (negociação, aguardando resposta, etc.) **fica lá, intocado**. O cron nunca mexe.

E sua segunda pergunta — *"ele vai direto pro Base depois de X dias até entrar na contagem?"* — sim, é exatamente isso que vai acontecer:

```text
[Base de clientes] ──compra entra aqui──┐
                                        │
        (passa X dias parado aqui)      │
                                        ▼
                          [Hora de recontatar]  ← cron move só daqui pra cá
                                        │
                          (Gabi pega e trabalha)
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
            [Em negociação]   [Aguardando resposta]   [Não fechou]
                    │
                    └─→ cron NÃO mexe mais (saiu da etapa de origem)
```

---

## O que vou fazer

**1. Banco** (migration nova):
- Adicionar coluna `auto_move_from_stage_id` em `lead_funnel_products` (qual etapa observar).
- Migration de dados: pra todos os produtos já configurados, setar `auto_move_from_stage_id` = primeira etapa do funil ("Base de clientes").

**2. Edge Function `recontact-cron`** (ajuste cirúrgico):
- Adicionar filtro: só processa posições onde `stage_id = auto_move_from_stage_id` do produto.
- Se `auto_move_from_stage_id` for NULL (config antiga), mantém comportamento atual (compatibilidade).

**3. UI da configuração do produto** (`FunnelProductsConfig.tsx` no funil):
- Novo dropdown: **"Observar leads na etapa"** (ao lado de "Mover para etapa").
- Default na criação: primeira etapa do funil.

**4. Botão "Atualizar funil"** (`LeadFunnelDetail.tsx`):
- Mesma lógica de filtro aplicada client-side (já que ele faz a mesma operação localmente).

**5. Backfill do Articulabem RECOMPRA - POTES:**
- Mapear "Articulabem" no funil RECOMPRA com:
  - `recontact_days`: 90 (ajustável depois pelo SQL diagnóstico)
  - `auto_move_from_stage_id`: "Base de clientes"
  - `auto_move_stage_id`: "Hora de recontatar"
- Reprocessar leads históricos pro funil RECOMPRA (já tinha o script `step2-reprocess-leads-to-recompra.sql`).

---

## O que NÃO vou mexer

- Estrutura geral do funil, RLS, outras automações de WhatsApp.
- Comportamento de funis sem `auto_move_from_stage_id` configurado (continua igual — backward compatible).
- Lógica de soma linear de `recontact_days` quando o lead tem múltiplas compras (já funciona bem).

---

## Confirmação antes de codar

Preciso só confirmar 2 coisas com você:

1. **Nome da etapa de origem padrão**: vou usar **"Base de clientes"** (primeira etapa do funil RECOMPRA - POTES). Confere?
2. **Nome da etapa de destino**: existe uma etapa chamada **"Hora de recontatar"** no funil? Se o nome for outro, me diga qual é (ou roda o Bloco 1 do `diagnose-articulabem-recompra.sql` que te passei antes que ele lista).

Depois que aprovar e me responder essas 2, eu executo tudo de uma vez.
