

## Auditoria completa — Funil "Guia de Tinturas" (10000000-0000-0000-0000-000000000001)

### 1. Webhook Ticto (`ticto-webhook`) — ✅ OK
- Extração de `product_name`, `paid_amount`, `status` usa cascata de fallbacks resiliente
- `funnel_id` é resolvido por: token na URL → `resolve_funnel_id` por nome do produto → preserva do registro existente
- Select-before-save manual funciona corretamente (linhas 306-339)
- Lead sync só roda quando `status === "authorized"` — correto
- Forward para `wz-receiver` acontece fire-and-forget — correto

### 2. Persistência (`ticto_transactions`) — ✅ OK
- Sem `.upsert()` com índice parcial — usa select + insert/update manual
- Proteção contra sobrescrita: preserva `paid_amount` e `product_name` existentes se o novo payload vier zerado

### 3. Sync de lead (`sync_lead_from_sale`) — ✅ OK
- Chamado apenas quando `status === "authorized"`
- Passa `p_product_name` para roteamento correto ao funil do produto
- Dedup case-insensitive com `LOWER()`

### 4. View `v_all_sales` — ✅ OK
- Revenue calculada como `paid_amount / 100.0` para Ticto (centavos → reais)
- `funnel_id` e `product_name` propagados corretamente
- Hook `useAllSales` filtra por `funnel_id` quando em página de funil

### 5. Atribuição Meta (`auto_assign_campaign_funnels`) — ✅ OK
- Keywords `TINTURA`, `PREPARO`, `CHÁ`, `MESTRE DAS TINTURAS` já estão no `funnel_products`
- Fallback por nome do funil para campanhas sem match por keyword

### 6. Dashboard do funil — ⚠️ FILTRO RESTRITIVO
**Gap encontrado:** em `useAllSales` (linha 57), quando `funnelId` é passado, a query adiciona **dois filtros**:
```typescript
query = query.eq('funnel_id', funnelId).eq('ingestion_type', 'webhook');
```
Isto **exclui todas as vendas importadas via CSV** (`ingestion_type = 'import'`) do dashboard do funil. Se alguma venda entrou por importação, ela não aparece no resumo do funil. Isso pode ser intencional, mas pode causar discrepância se transações foram backfilled/importadas.

**Recomendação:** Remover `.eq('ingestion_type', 'webhook')` ou torná-lo opcional via toggle na UI.

### 7. WhatsApp Automação (`wz-receiver`) — ❌ GAP CRÍTICO

O `ticto-webhook` faz forward do **payload original** da Ticto para o `wz-receiver`:
```typescript
body: JSON.stringify(payload)  // payload RAW da Ticto
```

Mas o `normalizeTicto` no `wz-receiver` espera uma estrutura diferente do payload real:

**Payload real da Ticto (que chega no wz-receiver):**
```json
{
  "item": { "product_name": "...", "product_id": 46342, "amount": 4700 },
  "customer": { "phone_local_code": "+55", "phone_number": "31999548184", "name": "..." },
  "status": "approved"
}
```

**O que o `normalizeTicto` procura:**
```typescript
const buyer = body.buyer || body.customer || {};       // ✅ customer funciona
const product = body.product || {};                     // ❌ FALHA — deveria ser body.item
const transaction = body.transaction || body;           // body inteiro como fallback

phone = buyer.phone_local_code + buyer.phone_number;    // ✅ funciona

product_name: product.name || body.product_name || null // ❌ product.name é undefined (deveria ser body.item.product_name)
product_id: String(product.id || body.product_id || body.item?.product_id || "") // ⚠️ body.item?.product_id funciona como último fallback
```

**Problemas específicos:**
1. **`product_name`**: `body.product` é `undefined` no payload Ticto → `product.name` é `undefined` → `body.product_name` é `undefined` → retorna `null`. O nome real está em `body.item.product_name` e **não é acessado**.
2. **`product_id`**: funciona parcialmente via `body.item?.product_id` (último fallback), mas é frágil.
3. **`status`**: `normalizeStatus("approved")` → `"purchase_approved"` ✅ OK para trigger matching.
4. **`gross_amount`/`paid_amount`**: `body.transaction` não existe → usa `body` como fallback → `body.paid_amount` não existe no nível raiz → `Number(undefined)` → `0`. O valor real está em `body.item.amount` (4700 centavos) e **não é acessado**.

### Correções necessárias

**Arquivo: `supabase/functions/wz-receiver/index.ts`**

1. **Corrigir `normalizeTicto`** para acessar `body.item`:
```typescript
function normalizeTicto(body: Record<string, any>): NormalizedEvent {
  const buyer = body.buyer || body.customer || {};
  const item = body.item || {};
  const product = body.product || item || {};
  const transaction = body.transaction || body;

  let phone = buyer.phone || null;
  if (!phone && (buyer.phone_local_code || buyer.phone_number)) {
    phone = `${buyer.phone_local_code || ""}${buyer.phone_number || ""}`;
  }

  return {
    contact_phone: phone,
    contact_name: buyer.name || null,
    contact_email: buyer.email || null,
    product_name: item.product_name || product.name || body.product_name || null,
    product_id: String(item.product_id || product.id || body.product_id || ""),
    offer_name: item.offer_name || body.offer_name || null,
    gross_amount: Number(item.amount || transaction.gross_amount || transaction.amount || 0),
    paid_amount: Number(item.amount || transaction.paid_amount || transaction.net_amount || 0),
    status: normalizeStatus(body.status || transaction.status || ""),
    platform: "ticto",
    payment_method: normalizePaymentMethod(body.payment_method || transaction.payment_method),
    installments: Number(transaction.installments || 1),
    raw_payload: body,
  };
}
```

2. **Opcional — `useAllSales` filtro `ingestion_type`** (`src/hooks/useAllSales.ts` linha 57):
Remover `.eq('ingestion_type', 'webhook')` para incluir vendas importadas no dashboard do funil.

### Resumo

| Etapa | Status | Problema |
|-------|--------|----------|
| Webhook Ticto | ✅ | — |
| Persistência | ✅ | — |
| Sync de lead | ✅ | — |
| v_all_sales | ✅ | — |
| Atribuição Meta | ✅ | — |
| Dashboard | ⚠️ | Filtro `ingestion_type='webhook'` exclui importações |
| wz-receiver (WhatsApp) | ❌ | `normalizeTicto` não acessa `body.item` — product_name, product_id e amount chegam nulos/zero |

### Impacto
A automação WhatsApp **não dispara** para vendas Ticto porque `product_name` chega `null` e `product_id` chega `""` → o filtro `productIdFilter` no trigger não faz match → nenhum fluxo é ativado.

### Ação
Corrigir `normalizeTicto` no `wz-receiver/index.ts` e fazer redeploy da edge function.

