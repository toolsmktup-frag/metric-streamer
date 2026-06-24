# Módulo Logística / Rastreios

Aba **`/rastreios`** (acesso restrito) onde a logística cadastra o **código de rastreio** dos
pedidos pagos. Ao salvar o código, o pedido entra numa **fila de disparo controlado** no
WhatsApp (à prova de ban). Em paralelo, puxa a **Nota Fiscal (XML+PDF) do Spedy** e mostra o
**status de entrega dos Correios** na própria tela. Substitui a planilha manual da Santo Mato
+ o disparo manual da Débora.

> Origem: a logística colava o rastreio numa planilha e mandava no WhatsApp à mão, revezando
> números/textos e mesmo assim tomando ban. Agora é: colou o código → dispara sozinho, espaçado.

---

## Fluxo ponta-a-ponta

```
Venda (guru/ticto/eduzz webhook) ──► customer_purchases (product_type='fisico', status='authorized')
        │ trigger trg_customer_purchases_shipment
        ▼
   order_shipments (1 por compra física)  ◄── spedy-webhook (invoice.authorized) → NF + XML/PDF (Storage)
        │  endereço do raw_data do Guru
        ▼
   Tela /rastreios (perfil logística)
     • lista pedidos pagos · baixa NF · cola o código de rastreio
        │ tracking_code preenchido → dispatch_status='na_fila'
        ▼
   cron dispatch-tracking-1min → enqueue-tracking-dispatch (escalonado)
     • canal ManyChat (marca tag = WhatsApp oficial, sem ban)  [default]
     • OU UazAPI (revezando instância + variações de texto)
        │
        ▼
   cron correios-sync-6h → correios-tracking-sync (status de entrega na tela)
```

---

## Modelo de dados

| Tabela / objeto | Papel |
|---|---|
| `order_shipments` | Pedido de envio. Origem em `source` (`webhook`\|`planilha`\|`manual`). `customer_purchase_id` **nullable** (pedidos da planilha sem venda). Campos: snapshot do cliente (nome/telefone/email/cpf), endereço (`ship_*`), produto/`quantity`, `purchased_at`, `planilha_shipped_at`, `frete_value`/`logistica_value` (editáveis na tela), NF (`spedy_invoice_id`, `nf_number`, `nf_xml_url`, `nf_pdf_url`, `nf_status`, `nf_issued_at`), rastreio (`tracking_code`, `carrier`, `tracking_status`, `tracking_last_event`, `tracking_delivered`), disparo (`dispatch_status`, `dispatch_channel`, `dispatched_at`, `wz_execution_id`). |
| `spedy_invoices` | Toda NF recebida do Spedy (casada ou órfã), para reconciliação. |
| `shipment_tracking_events` | Histórico de eventos dos Correios por pedido. |
| `cron_secrets` | `supabase_url` + `dispatch_token` (token escopado p/ os crons chamarem as functions — **não** a service_role). RLS sem policies (só service_role/postgres). |
| views `v_shipments_sem_nf`, `v_nf_orfas` | De-para: pedidos sem NF × NFs sem pedido. |

**Status de disparo** (`dispatch_status`): `aguardando_rastreio` → `na_fila` → `enviado` / `falhou`.
**Status de entrega** (`tracking_status`): `postado` · `em_transito` · `saiu_entrega` · `aguardando_retirada` · `entregue` · `devolvido`.

**Criação automática:** trigger em `customer_purchases` chama `create_shipment_for_purchase()` p/ toda compra física aprovada (extrai endereço do `raw_data->'contact'` do Guru). `sync_shipments_from_purchases()` faz backfill.

---

## Edge functions

| Function | verify_jwt | O que faz |
|---|---|---|
| `enqueue-tracking-dispatch` | false | Processa a fila `na_fila` (lote, escalonado). Canal `manychat` (via `manychat-sync` → marca tag) ou `uazapi` (revezamento de `whatsapp_instances` + variação de texto). Se o canal não está configurado, **pula** (mantém na fila, não falha). Auth: service_role **ou** `TRACKING_DISPATCH_SECRET`. |
| `spedy-webhook` | false | Recebe `invoice.authorized`. De-para por `order.transactionId` → CPF → email. Baixa XML/PDF → bucket `notas-fiscais` (público). Preenche a NF + endereço oficial no pedido. |
| `correios-tracking-sync` | false | Cron. Autentica no CWS (cartão de postagem) e consulta a Rastro API por rastreio ativo; atualiza `tracking_status` + histórico. **Pula sem erro** até as credenciais Correios existirem. |
| `manychat-sync` *(estendida)* | false | Ganhou o param opcional `fields` p/ setar custom fields (ex.: código de rastreio) **antes** de aplicar a tag. |

**Crons (pg_cron + pg_net):** `dispatch-tracking-1min` (a cada min, só dispara se há `na_fila`) · `correios-sync-6h`. Ambos leem `cron_secrets` e chamam a function com o `dispatch_token`.

---

## Frontend & acesso

- Tela: `src/pages/Rastreios.tsx` (+ `src/hooks/useShipments.ts`). Tabela paginada (50/pág), rolagem horizontal (topo + base), legenda dos status em "?" (hover), colunas: Cliente · Telefone · Documento · Email · Produto · Data · Endereço · Frete · Logística · NF · Rastreio · Entrega · Status.
- **RBAC:** permissão `mod_rastreios` (em `user_permissions`). Usuário "logística" = só `mod_rastreios=true` → `isLogisticaOnly()` + `RastreiosGuard` (em `App.tsx`) travam ele só em `/rastreios` (inclusive ao digitar URL); o login redireciona pra lá. Admin/gestor já recebem `mod_rastreios=true` na migration.
- Rota gated por `<PermissionRoute requiredPermission="mod_rastreios">`; item "Logística" no `AppSidebar` condicionado a `can('mod_rastreios')`.

---

## Secrets / configuração

| Secret | Estado | Uso |
|---|---|---|
| `SPEDY_API_KEY` | ✅ setado (empresa Soulnaturi, CNPJ 66166730000175) | Spedy (X-Api-Key). Webhook `invoice.authorized` registrado (id `8c324036`). |
| `TRACKING_DISPATCH_SECRET` | ✅ setado | Auth interna dos crons → functions (também em `cron_secrets.dispatch_token`). |
| `TRACKING_DISPATCH_CHANNEL` | (default `manychat`) | Canal padrão da fila. Enquanto a tag ManyChat não existe, a fila **espera**. |
| `TRACKING_MC_TAG_NAME` / `TRACKING_MC_CODE_FIELD` | ⏳ pendente | Tag que dispara o fluxo oficial no ManyChat + custom field do código. |
| `CORREIOS_USER` / `CORREIOS_PASSWORD` / `CORREIOS_CARTAO` | ⏳ pendente | API oficial CWS/Rastro (gerar em cws.correios.com.br; chave expira 180 dias). |
| `TRACKING_UAZAPI_TEMPLATES`, `TRACKING_SEND_DELAY_MS`, `TRACKING_BATCH_SIZE` | opcionais | Variações de texto / pacing do UazAPI. |

---

## Planilha Santo Mato como base (de-para)

Decisão: a planilha é a verdade operacional de hoje → importada como base; as vendas alimentam por cima.
Importados **263 códigos de rastreio** da planilha (marcados `enviado`, **não redisparam**):
- **34 mesclados** em pedidos de venda (match único por CPF/telefone/email).
- **229 inseridos** como `source='planilha'` (17 ambíguos de cliente repetido — **não chutados** — + 212 antigos fora dos webhooks).
- Limite do histórico: dos 229, **67 têm endereço** e **160 têm data** (só o que a planilha registrava); **0 têm NF** (a planilha nunca teve coluna de NF e os pedidos são anteriores ao Spedy). Pedidos novos entram completos.

**Estado dos dados:** 1.173 pedidos (944 webhook + 229 planilha) · 263 com rastreio (`enviado`) · 910 `aguardando_rastreio` · 0 `na_fila`.

---

## Migrations

`20260623100000` permissão `mod_rastreios` · `100100` `order_shipments` + trigger + backfill · `100200`/`100400` cron de disparo + `cron_secrets` · `100300` `spedy_invoices` + bucket + views · `100500` Correios (colunas + eventos + cron) · `100600` colunas extras (`purchased_at`/frete/logística) · `100700` `source` + `customer_purchase_id` nullable.

PRs: **#18** (módulo backend+frontend) · **#19** (colunas extras) · **#20** (legenda "?" + scroll topo) · **#21** (planilha como base/schema) · **#22** (data da planilha + marca origem).

---

## Pendências

1. **ManyChat:** criar a tag + custom field, setar `TRACKING_MC_TAG_NAME`/`TRACKING_MC_CODE_FIELD` e **deployar a `manychat-sync` atualizada** (o param `fields` está só no repo, ainda não em prod).
2. **Correios:** gerar a chave no CWS e setar `CORREIOS_USER`/`PASSWORD`/`CARTAO`.
3. **Usuário logística:** criar com só `mod_rastreios=true`.
4. **384 vendas físicas classificadas como `digital`** (mesmo produto aparece nos 2 tipos) → não viram shipment; investigar/corrigir `inferProductType` no `guru-webhook`.
