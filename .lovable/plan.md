

## Problema: Timeline com 0 eventos após sync

### Build Error
O erro `Cannot find package 'rollup'` é um problema temporário da infraestrutura Lovable, não relacionado ao código. Vai resolver sozinho no próximo build.

### Root Cause dos 0 eventos
A edge function insere eventos com `created_at` explícito. Se a coluna `created_at` da tabela `lead_events` tiver constraint `generated always as (now())` em vez de `default now()`, o insert falha silenciosamente em lote (o erro é logado mas não impede o resto do sync).

### Solução

**1. Edge function (`sync-leads-from-sales/index.ts`)** — 2 mudanças:

a) **Inserir eventos um a um** (como já fazemos com leads) em vez de batch, para capturar erros individuais e não perder todos os eventos de um chunk por causa de um único erro.

b) **Fallback para `created_at`**: Se o insert com `created_at` explícito falhar, tentar novamente sem o campo (deixando o DB usar o default). Guardar a data real no `metadata.original_date` para referência.

c) **Adicionar evento "lead_created"** para cada lead (usando `firstPurchaseDate`), assim a timeline sempre terá pelo menos 1 evento. E para cada compra, gerar o evento com o status real (ex: `pix_gerado`, `autorizado`, `pago`).

**2. Melhoria na geração de eventos** — Em vez de um único evento genérico `purchase` ou o status raw, mapear os status para nomes mais descritivos:
- `authorized`/`approved`/`paid` → evento `pago`
- `waiting_payment`/`pending` → evento `pix_gerado`
- `rejected`/`cancelled`/`expired` → evento correspondente
- Sempre adicionar um evento `criado` com a data mais antiga

### Arquivos
1. `supabase/functions/sync-leads-from-sales/index.ts` — inserção resiliente de eventos + mapeamento de nomes + evento "criado"

