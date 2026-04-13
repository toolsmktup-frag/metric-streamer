

## Reprocessar leads antigos com as novas regras de transição

### Contexto
As regras de transição estão configuradas corretamente (Carrinho Abandonado → Recuperar, Compra → Comprou, PIX/Boleto → Pix/Boleto Gerado, etc.). Porém leads que entraram antes dessas regras ficaram parados na primeira etapa. Precisamos de um script SQL para reposicioná-los.

### Solução
Criar um script SQL (para rodar no SQL Editor do Supabase) que:

1. Para cada lead posicionado no funil específico (`RECOMPRA - POTES`):
   - Busca o **último evento** registrado em `lead_events` para esse lead nesse funil
   - Verifica se existe uma `stage_transition_rule` que faz match com esse evento
   - Se sim, atualiza o `lead_stage_positions` para a etapa correta (com o `value_classification` da regra)

2. Não altera leads que já estão na etapa certa (idempotente)

### Arquivo gerado
- `docs/sql/reprocess-leads-by-rules.sql` — script parametrizado com o `funnel_id`, pronto para colar no SQL Editor

### O que o script NÃO faz
- Não cria leads novos
- Não dispara automações WhatsApp
- Não altera metadata — apenas move o lead para a etapa correta baseado no último evento

