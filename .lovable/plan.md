# Reorganizar funil Infoprodutos via SQL

## Objetivo

Hoje os 3.223 leads do funil **Infoprodutos** estão todos parados na etapa **Novo Lead**, mesmo tendo status diferentes (Aprovado, Cancelado, Pendente, etc.) vindos das vendas reais. Quero distribuir cada lead na etapa correta do Kanban olhando o **status da última venda** dele.

## Como o SQL vai decidir

Para cada lead que está no funil Infoprodutos, pegar a venda mais recente em `v_all_sales` (cruzando por e-mail OU telefone) e mover o lead para:

| Status da venda                                              | Etapa de destino     |
|--------------------------------------------------------------|----------------------|
| `authorized`, `approved`, `paid`                             | Compra Aprovada      |
| `pix_created`, `bank_slip_created`, `pending`, `waiting_payment` | PIX / Boleto Gerado  |
| `refused`, `rejected`, `canceled`, `cancelled`, `refunded`   | Compra Recusada      |
| `abandoned`, `abandoned_cart`                                | Cariinho Abandonado  |
| sem venda encontrada                                          | fica em Novo Lead    |

A etapa **Entrar em Contato** não recebe nada automático (é manual, do vendedor).

As etapas são descobertas pelo nome dentro do próprio funil (`ILIKE '%aprovad%'`, `'%pix%'`, etc.), então não preciso colar UUID nenhum.

## O que rodar

Um único script SQL no SQL Editor do Supabase, com o ID do funil no topo. Estrutura:

```text
1. CTE `funnel` → ID do Infoprodutos (b4452a0a-...)
2. CTE `stages` → mapa nome→id das etapas do funil
3. CTE `last_sale` → DISTINCT ON (lead_id) ORDER BY purchased_at DESC
   cruzando leads do funil com v_all_sales por email/phone normalizado
4. UPDATE lead_stage_positions  SET stage_id = CASE status ... END
   WHERE funnel_id = funnel AND lead_id IN (...)
5. SELECT de conferência: quantos leads ficaram em cada etapa
```

Execução: 1 vez, manual, no SQL Editor. Não cria trigger nem cron — você falou que não precisa rodar com frequência.

## Detalhes técnicos

- Tabela alterada: `public.lead_stage_positions` (só `stage_id`, mantém `entered_at` se a etapa não mudou).
- Match lead ↔ venda: `lower(email)` OU `regexp_replace(phone, '\D','','g')` (mesma normalização que o resto do app já usa — ver memory `phone-formats`).
- Reversível: antes do UPDATE, faço `CREATE TABLE backup_lead_stage_positions_infoprodutos AS SELECT * FROM lead_stage_positions WHERE funnel_id = ...` pra poder reverter se algo sair errado.
- Não dispara automações (UPDATE direto no banco não passa pelos triggers de `lead_events`).

## Próximo passo

Se você aprovar, eu gero o SQL final pronto pra colar no SQL Editor com:
- O UUID do funil Infoprodutos já preenchido
- O backup automático
- O UPDATE
- O SELECT de conferência no final mostrando a distribuição por etapa
