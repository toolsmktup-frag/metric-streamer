# Integração YouShop (webhook)

**Data:** 2026-09-03 · **Edge function:** `supabase/functions/youshop-webhook` · **Platform key:** `youshop`

## Como funciona

1. A YouShop envia um POST para `https://emfbocpmphtftqcezaib.supabase.co/functions/v1/youshop-webhook?token=TOKEN_DO_FUNIL`.
2. O token é validado em `funnel_platforms` (platform `youshop`, `is_active = true`). Sem token válido → **401** (mesma regra anti-injeção da Ticto/Eduzz).
3. A venda é gravada em `customer_purchases` com `platform = 'youshop'` (uma linha por item do pedido; idempotente por `platform + platform_transaction_id`).
   - **Não** espelha em `ticto_transactions` (evita a dupla contagem corrigida em `20260612200000_fix_dedup_ticto_eduzz_mirror.sql`).
   - `v_all_sales` / `v_all_sales_classified` já incluem qualquer `platform <> 'ticto'` — nada a alterar nas views.
4. Depois do save: `sync_lead_from_sale` (timeline do lead), `meta-capi-sync` (só aprovada), `wz-receiver?platform=youshop` (automações WhatsApp, payload já normalizado) e `stock-deductor` (só aprovada).
5. **Todo** payload recebido (inclusive ping/teste e rejeitados) vai para `webhook_audit` com `source = 'youshop'`.

## Status normalizados

| YouShop (evento/status) | CRM |
|---|---|
| Pix Pago, Boleto Pago, Cartão de Crédito Pago, Pago (todos), approved/paid | `authorized` |
| Pix Gerado, Boleto Gerado, waiting/pending | `pending` |
| Cancelado, expirado | `canceled` |
| recusado/falha | `refused` |
| estorno/reembolso | `refunded` |
| chargeback | `chargeback` |
| Jornada: Carrinho Abandonado | `abandoned_cart` (não grava compra; só timeline + automações) |

## Configuração no painel da YouShop

Ferramentas → Webhooks → **Novo webhook**

| Campo | Valor |
|---|---|
| Nome do webhook | CRM Tráfego (ou o nome do funil) |
| Formato do Webhook | **YouShop** |
| Tipo de webhook | **Produto** |
| URL | URL do funil com `?token=...` (Funis → Configurar → Plataformas → YouShop) |
| Produtos | os produtos do funil, ou "Enviar para todos produtos" |
| Eventos | Pedido: Pix Gerado, Pix Pago, Boleto Gerado, Boleto Pago, Cartão de Crédito Pago, Pago (todos), Cancelado · Jornada: Carrinho Abandonado |
| Opções | ligar "nome", "telefone" e "e-mail" do cliente |

Depois de salvar, use **Testar Webhook** no menu ⋮ do webhook.

## Primeiro teste: conferir o payload

A YouShop não publica o formato do JSON, então o parser procura cada campo em vários caminhos.
Depois do "Testar Webhook", conferir:

```sql
select received_at, normalized_status, raw_status, product_name, paid_amount, error_message, raw_payload
  from webhook_audit
 where source = 'youshop'
 order by received_at desc
 limit 5;
```

Se `product_name`, `paid_amount` ou `normalized_status` vierem errados, ajustar as listas de caminhos em `youshop-webhook/index.ts` (funções `pick`, `pickAmountReais`, `mapStatus`).

**Atenção ao valor:** o parser assume reais (`197.00`, `"197,00"`, `"R$ 197,00"`). Só trata como centavos se a chave tiver `cents`/`centavos` no nome. Se a YouShop mandar `19700` sem indicar, o valor sairá 100x maior — corrigir na lista de caminhos.

## Checklist de ativação

- [ ] Rodar a migration `20260903180000_add_youshop_platform.sql` no SQL Editor (relaxa os CHECKs de `platform`).
- [ ] Deploy: `SUPABASE_ACCESS_TOKEN=... npx supabase functions deploy youshop-webhook --no-verify-jwt --use-api --project-ref emfbocpmphtftqcezaib`
- [ ] Funis → Configurar → funil → Plataformas → adicionar **YouShop** → copiar URL com token.
- [ ] Cadastrar os produtos YouShop em Funis → Configurar → Produtos (`product_id` + plataforma YouShop), senão caem em `funnel_position = 'other'`.
- [ ] Criar o webhook na YouShop com a URL e testar.
- [ ] Conferir `webhook_audit` e ajustar o parser se necessário.

## Limitações conhecidas

- A página **Vendas** (`src/pages/Vendas.tsx`) lê `ticto_transactions` direto e não mostra YouShop (nem Guru). Resumo Geral, Funis, KPIs, RFM, Cohort e CRM usam `v_all_sales` e mostram normalmente.
- Não há importação de CSV histórico da YouShop (Importar Dados só tem Ticto/Guru/Eduzz).
- Eventos de **Assinatura** são aceitos (Ativa/Renovada → `authorized`, Cancelada/Suspensa → `canceled`, Com Falha → `refused`), mas não foram testados.
