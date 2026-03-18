

## Diagnóstico: 3 Bugs na Sync "BASE DE LEADS"

O problema não é no import de planilha — é na edge function `sync-leads-from-sales` que popula o funil BASE DE LEADS.

### Bug 1: Zero leads "Perdido"
**Causa**: Linha 110 do sync filtra `APPROVED_STATUSES` only. Compras com status "rejected", "refunded", "cancelled", "expired" etc. são completamente ignoradas.
**Fix**: Remover o filtro `.in("status", APPROVED_STATUSES)` e buscar TODAS as compras. Na hora de posicionar, mapear status aprovado → etapa "Comprador" e status não-aprovado → etapa "Perdido".

### Bug 2: Timeline com 0 eventos
**Causa**: O batch insert de leads (linha 174) falha silenciosamente quando há conflito de constraint (email/phone duplicado). Quando o batch falha, `leadIdByKey` não é populado → nenhum evento é criado para aqueles leads.
**Fix**: Inserir leads um a um (com fallback para buscar existente em caso de conflito), igual ao fix já feito no `useImportLeads.ts`.

### Bug 3: Email mostrando nome da pessoa
**Causa**: O campo `primary_email` na tabela `unified_customers` pode estar null para alguns clientes, e o `LeadCard` mostra o que vier no campo `email` do lead. Se o nome veio no campo email durante a ingestão original, ele é exibido incorretamente.
**Fix**: No sync, validar se `primary_email` contém "@" antes de salvar como email. Se não contém, ignorar o valor.

### Bug 4: Data 18/03 em todos os cards
**Causa**: O card mostra `position.entered_at` (linha 77 do LeadCard), que é definido como `now()` pelo Supabase default. O sync não seta `entered_at` explicitamente.
**Fix**: No sync, ao inserir `lead_stage_positions`, setar `entered_at` como a data da primeira compra do cliente.

---

### Arquivos a alterar

1. **`supabase/functions/sync-leads-from-sales/index.ts`**:
   - Remover filtro `APPROVED_STATUSES` na query de purchases → buscar todas
   - Separar clientes em "Comprador" (status aprovado) vs "Perdido" (demais)
   - Buscar stages por nome ("Comprador", "Perdido") em vez de usar firstStage para todos
   - Inserir leads um a um com fallback (evitar batch failure)
   - Validar email (deve conter "@")
   - Setar `entered_at` na position com a data da primeira compra

2. **`src/components/lead-funnels/LeadCard.tsx`** (menor):
   - Validar que `lead.email` contém "@" antes de exibir com ícone de email
   - Se não contém "@", não mostrar na linha de email

