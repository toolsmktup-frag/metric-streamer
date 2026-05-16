# Plano — Lembrete "25 dias antes do pote acabar"

## Objetivo

Avisar a vendedora (via Kanban + WhatsApp) que um cliente está prestes a ficar sem o pote, antes do prazo acabar — sem código novo, reusando a infra de recontato que já existe.

## Abordagem (opção 1b)

Criar uma **etapa intermediária "Lembrete 25d antes"** no funil RECOMPRA - POTES e configurar produtos espelhados com `recontact_days = produto_dias − 25`. O cron e o botão "Atualizar Funil" já existentes movem os leads automaticamente pra essa etapa quando faltam 25 dias.

```text
Compra Aprovada ──(produto_dias − 25)──▶ Lembrete 25d antes ──(25 dias)──▶ Base de Recontato
       │                                          │                                │
       └─ lead comprou Pote 30d                   └─ vendedora vê card             └─ pote acabou,
          dia 01/01                                  no dia 06/01 e                   move pra negociação
                                                     manda WhatsApp
```

## Passos

1. **Criar etapa nova no Kanban** do funil `19f75912...` (RECOMPRA - POTES):
   - Nome: `Lembrete 25d antes`
   - Posição: entre "Compra Aprovada" e "Base de Recontato"
   - Cor: laranja/amarelo (atenção, não urgência)

2. **Duplicar configuração de produtos** em `lead_funnel_products`:
   - Para cada produto com `recontact_days` (Pote 30, Pote 90, Pote 180, etc.), criar um segundo registro:
     - `product_name_contains`: mesmo
     - `recontact_days`: original − 25 (ex.: 30 → 5, 90 → 65, 180 → 155)
     - `auto_move_from_stage_id`: "Compra Aprovada"
     - `auto_move_stage_id`: nova etapa "Lembrete 25d antes"
   - Os registros originais continuam levando de "Lembrete 25d antes" → "Base de Recontato" depois dos 25 dias finais.
     - Ajustar `auto_move_from_stage_id` dos registros originais para apontar para "Lembrete 25d antes" (em vez de "Compra Aprovada").
     - Ajustar `recontact_days` dos registros originais para `25` (os 25 dias restantes).

3. **Conferir a soma linear**: a memória `recontact-system` soma `recontact_days` quando há múltiplas compras. Confirmar que o comportamento esperado para o lembrete também é cumulativo (cliente que comprou Pote 30 + Pote 90 vai pra "Lembrete" quando faltam 25d do total = dia 95).

4. **(Opcional, mesma sessão) Ligar automação WhatsApp** na entrada da etapa "Lembrete 25d antes":
   - Trigger: `lead_entered_stage` = "Lembrete 25d antes"
   - Mensagem: "Oi {{nome}}, seu pote está acabando em ~25 dias. Quer já garantir o próximo?"
   - Reusa a infra `wz-automation` que já existe.

## Riscos / pontos de atenção

- **Mexe na produção do funil mais crítico** — fazer numa janela de baixo movimento e validar com 1-2 leads de teste antes.
- **Cards vão acumular numa etapa nova** — pré-aviso pra Gabi de que vai aparecer coluna nova no Kanban.
- **Soma linear** (item 3) pode surpreender: confirmar com a Gabi se "25d antes do total acumulado" é o que ela quer, ou se prefere "25d antes da próxima compra individual".
- **Não unifica botão + cron** — os relatórios de transição continuam com leve inconsistência (achado #2 da auditoria). Fica pra um próximo passo se necessário.

## O que NÃO vai ser feito agora

- Painel de saúde do cron (achado #6)
- Unificar lógica botão vs cron (achado #2)
- Reescrever date parsing (achado #5)
- Refinar match por substring (achado #4)

## Detalhes técnicos (referência)

- Tabela: `public.lead_funnel_products` (colunas `recontact_days`, `auto_move_from_stage_id`, `auto_move_stage_id`)
- Etapas: `public.lead_funnel_stages` (criar nova com `funnel_id = 19f75912...`)
- Cron: `recontact-daily` já roda 00h BRT, não precisa mudar
- Botão: `handleBulkMoveOverdue` em `LeadFunnelDetail.tsx` já cobre o novo fluxo
- SQL de setup: criar arquivo `docs/sql/setup-lembrete-25d-antes.sql` espelhando o padrão de `setup-recompra-compra-aprovada-to-base-recontato.sql`

## Entrega

1. SQL pronto pra colar no Supabase Dashboard (criação da etapa + upsert dos `lead_funnel_products`)
2. Instruções curtas pra Gabi de como configurar a automação WhatsApp na nova etapa
3. Checklist de validação com 1-2 leads de teste
