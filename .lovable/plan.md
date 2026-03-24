

# Plano: Centralizar syncLeadFromSale em RPC

## O que muda

A lógica de ~80 linhas idêntica em 5 Edge Functions vira uma stored procedure PostgreSQL. Cada webhook/importador passa a fazer 1 chamada `supabase.rpc()` em vez de manter código duplicado.

## Arquitetura (não muda a lógica, só onde ela vive)

```text
Ticto Webhook ─┐                         
Guru Webhook  ─┤  extraem campos    ┌─────────────────────────┐
Eduzz Webhook ─┤  do payload e      │  RPC: sync_lead_from_sale │
Import CSV    ─┤  chamam RPC ──────>│  (stored procedure)       │
Process Import─┘                    │  - Dedup phone/email      │
                                    │  - Create/update lead     │
                                    │  - Find/create funnel     │
                                    │  - Log event              │
                                    │  - Position in stage      │
                                    └─────────────────────────┘
```

## Implementação

### 1. Criar stored procedure `sync_lead_from_sale`
- **Arquivo**: `docs/rpc-sync-lead-from-sale.sql` (para rodar manualmente no Supabase)
- Parâmetros: `p_phone, p_email, p_name, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term, p_event_name, p_metadata`
- Org ID hardcoded (`00000000-...001`) como constante interna
- `SECURITY DEFINER` (precisa acessar todas as tabelas sem RLS)
- Toda a lógica atual traduzida para PL/pgSQL: dedup, insert/update lead, find/create funnel "BASE DE LEADS" com stages padrão, insert evento, posicionar no primeiro stage
- Retorna o `lead_id` criado/encontrado

### 2. Substituir nas 5 Edge Functions
Remover a função `syncLeadFromSale()` (~80 linhas) de cada arquivo e trocar a chamada por:

```typescript
await supabase.rpc("sync_lead_from_sale", {
  p_phone: phone, p_email: email, p_name: name,
  p_utm_source: utmSource, /* ... demais UTMs ... */
  p_event_name: "sale_authorized",
  p_metadata: metadata,
});
```

**Arquivos editados:**
- `supabase/functions/ticto-webhook/index.ts`
- `supabase/functions/guru-webhook/index.ts`
- `supabase/functions/eduzz-webhook/index.ts`
- `supabase/functions/import-ticto-csv/index.ts`
- `supabase/functions/process-import/index.ts`

### 3. Ação do usuário
Rodar o SQL `docs/rpc-sync-lead-from-sale.sql` no Supabase antes de deployar as Edge Functions.

## Benefícios
- **1 lugar** para manter a lógica de leads (em vez de 5)
- **Transação atômica** — lead + evento + posição no funil tudo ou nada
- **Menos round-trips** — 1 chamada RPC vs 6-8 queries sequenciais por webhook
- **Preparado para novas plataformas** — basta extrair os campos e chamar a RPC

