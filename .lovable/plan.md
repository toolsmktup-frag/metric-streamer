

## Captura de fbc, fbp, fbclid e gclid nos Webhooks

O payload da Ticto envia `fbc`, `fbp`, `fbclid` e potencialmente `gclid` dentro de `query_params`, mas o webhook atual ignora esses campos.

### O que será feito

**1. Migration: adicionar colunas na `ticto_transactions`**
```sql
ALTER TABLE ticto_transactions ADD COLUMN IF NOT EXISTS fbc text;
ALTER TABLE ticto_transactions ADD COLUMN IF NOT EXISTS fbp text;
ALTER TABLE ticto_transactions ADD COLUMN IF NOT EXISTS fbclid text;
ALTER TABLE ticto_transactions ADD COLUMN IF NOT EXISTS gclid text;
```

**2. Webhook Ticto (`supabase/functions/ticto-webhook/index.ts`)**
- Extrair `query_params` do payload (já existe no JSON)
- Ler `fbc`, `fbp`, `fbclid`, `gclid` de `query_params`
- Incluir no objeto `record` que é salvo na tabela

**3. Webhook Guru (`supabase/functions/guru-webhook/index.ts`)**
- Verificar se o payload Guru tem campos similares e extrair se disponível

**4. Webhook Eduzz (`supabase/functions/eduzz-webhook/index.ts`)**
- Mesmo tratamento

**5. Import CSV (`supabase/functions/import-ticto-csv/index.ts`)**
- Mapear `fbc`, `fbp`, `fbclid`, `gclid` se presentes nos registros importados

**6. View `v_all_sales`**
- Atualizar para expor as 4 novas colunas

### Detalhes Técnicos

No webhook Ticto, a extração será:
```typescript
const queryParams = payload.query_params || {};
const fbc = clean(queryParams.fbc);
const fbp = clean(queryParams.fbp);
const fbclid = clean(queryParams.fbclid);
const gclid = clean(queryParams.gclid);
```

Esses valores serão adicionados ao `record` antes do upsert. A herança de UTMs (inheritance) também passará a herdar `fbc`/`fbp` quando disponíveis no donor.

