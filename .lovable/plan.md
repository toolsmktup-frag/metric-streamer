

## Plano: Corrigir ticto-webhook para processar todos os eventos da Ticto (Guia de Tinturas)

### Problema confirmado

Analisando o codigo do repo (`supabase/functions/ticto-webhook/index.ts`) contra os 6 payloads reais que voce enviou, identifiquei **3 problemas concretos**:

1. **Status `claimed` nao esta mapeado** -- a Ticto envia `"status": "claimed"` para reembolsos. O codigo atual nao tem esse status no `statusMap` (linha 191), entao ele cai como status bruto `"claimed"`, que nao e reconhecido. Deve ser mapeado para `"refunded"`.

2. **Payload de abandono tem estrutura diferente** -- o evento `abandoned_cart` usa campos totalmente diferentes (`name_prod`, `id_prod`, `name_offer`, `id_offer`, `name_customer`, `email_customer`) em vez da estrutura padrao com `item`, `order`, `customer`. O parser atual nao extrai esses campos, entao o abandono e salvo sem produto, sem cliente, sem dados uteis.

3. **`product_id` nao e passado ao `stock-deductor`** -- na linha 422, so envia `product_name` e `platform`, mas nao envia o `product_id` que o stock-deductor precisa para fazer match por `external_product_id`.

4. **Provavel dessincronia repo vs producao** -- o servidor retorna `"Internal Server Error"` (string pura), mas o codigo do repo retorna `{ error: "Internal server error", detail: "..." }` (JSON). Isso indica que o codigo deployado no Supabase e uma versao antiga que nao corresponde ao repo.

### O que funciona (nao mexer)

- Parsing de venda `authorized`, `pix_created`, `bank_slip_created`, `bank_slip_delayed`, `refused` -- todos esses status ja estao mapeados corretamente
- Extracao de UTMs e IDs de campanha Meta
- Resolucao de funil por token e por nome de produto
- Pipeline sync_lead + wz-receiver + stock-deductor (estrutura esta correta)
- Auditoria em `webhook_audit`

### Alteracoes no arquivo

**Arquivo:** `supabase/functions/ticto-webhook/index.ts`

**1. Adicionar `claimed` ao statusMap (1 linha)**
```
claimed: "refunded",
```

**2. Extrair dados do payload de abandono (antes da extracao dos campos)**
Detectar o formato alternativo e normalizar para a estrutura padrao:
```
// Se payload de abandono (estrutura alternativa da Ticto)
if (payload.name_prod && !payload.item) {
  payload.item = {
    product_name: payload.name_prod,
    product_id: payload.id_prod,
    offer_name: payload.name_offer,
    offer_id: payload.id_offer,
  };
  payload.customer = {
    name: payload.name_customer,
    email: payload.email_customer,
    phone_number: payload.phone_number_customer,
  };
}
```

**3. Passar `product_id` ao stock-deductor (1 campo adicional)**
Adicionar `product_id: record.product_id` ao body enviado ao stock-deductor.

### Apos implementar

Voce precisa **copiar o codigo atualizado e colar no Supabase Dashboard** (Edge Functions > ticto-webhook). Esse e o passo mais critico -- sem isso, nada muda em producao.

### Sobre a configuracao na Ticto

- **Manter apenas 1 URL** com token: `https://emfbocpmphtftqcezaib.supabase.co/functions/v1/ticto-webhook?token=3c3ff98e-f347-40b2-a0e0-cdb899c935d5`
- **Remover a URL sem token** (`/ticto-webhook` sem `?token=...`) se estiver cadastrada para o mesmo produto

### Sobre registrar eventos na timeline

Sim, faz sentido registrar `pix_created`, `bank_slip_created`, `abandoned_cart` e `refused` na timeline do lead via `sync_lead_from_sale`. Hoje so `authorized` dispara o sync. Vou adicionar chamadas para os outros eventos com `p_event_name` apropriado (ex: `"pix_generated"`, `"abandoned_cart"`, `"refused"`).

### Resumo tecnico das alteracoes

| Alteracao | Linhas afetadas | Impacto |
|-----------|----------------|---------|
| Status `claimed` → `refunded` | ~linha 188 | Reembolsos passam a ser reconhecidos |
| Parser de abandono alternativo | ~linha 117 (antes do parsing) | Abandonos salvos com dados completos |
| `product_id` no stock-deductor | ~linha 423 | Match de estoque por ID funciona |
| Timeline para eventos nao-authorized | ~linha 369 | PIX, boleto, abandono aparecem na timeline |

