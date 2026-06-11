# Correção da Recompra/Recontato (funil de potes) — 2026-06-11

## Problema
O funil **RECOMPRA - POTES** mostrava dados não-confiáveis: clientes que compraram ontem apareciam vencidos (`-979d 🔥`), a quantidade de potes era ignorada (3 ou 6 potes tratados como 1), e produtos de marcas sem config caíam no vazio.

## Causa-raiz
A config de recontato casava por **texto** (`product_name_contains` = "Articulabem Pote 90 dias") contra o nome real da compra ("3 potes ArticulaBEM"). Os vocabulários (duração × quantidade) quase nunca cruzavam → o match falhava → caía num fallback de data antiga (`metadata.purchased_at`) → datas absurdas. E a quantidade nunca virava duração.

## Solução (regra de negócio do dono)
- **1 pote = 30 dias** → duração = nº de potes × 30.
- Recontatar a **antecedência configurada** antes de o estoque acabar (1 pote→7, 3/6→15, 9/12→20 dias antes).
- **Múltiplas compras somam** (estoque que estende).
- Fonte de data: **só** `customer_purchases.purchased_at` (sem metadata).

## O que mudou
| Camada | Mudança | Estado |
|---|---|---|
| Banco | `customer_purchases.quantity` + `quantity_source` | ✅ aplicado |
| Banco | `lead_funnel_products.pot_duration_days`/`reminder_days_before` + trigger | ✅ aplicado |
| Banco | Backfill: **1.226 compras de potes** com quantidade corrigida | ✅ aplicado |
| Banco | Config dos 6 produtos por duração (recontato calculado pelo trigger) | ✅ aplicado |
| Edge fn | Parser único `_shared/potQuantity.ts` na ingestão (guru/eduzz/process-import) | ✅ deployado |
| Front | `src/lib/recompra.ts` — cálculo "estoque que estende" + **27 testes** | ✅ código |
| Front | `useRecontactDeadlines` reescrito (quantidade, soma, sem fallback ruim) | ✅ código |
| Front | UI "Produtos & Recontato" edita duração + antecedência | ✅ código |

> O front vai ao ar quando o app for **republicado pela Lovable** (lê a quantidade do banco, que já está correta).

## Validação (dados reais)
Clientes que compraram nos últimos 45 dias, dias restantes pela nova lógica — escalando com a quantidade:

| Potes | Clientes | Dias restantes (média) |
|---|---|---|
| 3 | 250 | +48 |
| 6 | 49 | +141 |
| 12 | 26 | +317 |

Antes, todos os 250 de "3 potes" eram tratados como 1 pote e apareciam vencidos errado.

## Decisão de arquitetura
O cálculo foi centralizado numa **lib pura testável no front** (`src/lib/recompra.ts`) em vez de uma RPC no banco, porque o match cliente→compras (variantes de telefone) é complexo demais para SQL e o front já o resolve. Resultado no Kanban é idêntico, com cobertura de testes.

## Pendência recomendada (não incluída)
**Movimento automático por cron (pg_cron):** hoje o movimento de vencidos é feito pelo botão **"Atualizar Funil"** (já com a lógica corrigida). Automatizá-lo exige uma RPC server-side que replique o cálculo + o match de telefone — o que recria risco de divergência com o front e não é testável sem ambiente Deno local. Recomenda-se uma fase dedicada, com testes, antes de mover leads automaticamente em produção.
