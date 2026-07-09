# Módulo Logística / Rastreios

Aba **`/rastreios`** (acesso restrito) onde a logística cadastra o **código de rastreio** dos
pedidos pagos. Ao salvar o código, o pedido entra numa **fila de disparo controlado** no
WhatsApp (à prova de ban). Em paralelo, puxa a **Nota Fiscal (XML+PDF) do Spedy** e mostra o
**status de entrega dos Correios** na própria tela. Substitui a planilha manual da Santo Mato
+ o disparo manual da Débora.

> Origem: a logística colava o rastreio numa planilha e mandava no WhatsApp à mão, revezando
> números/textos e mesmo assim tomando ban. Agora é: colou o código → botão **Enviar** → dispara
> sozinho, espaçado, pelo número dedicado.

**Regra operacional (Matheus, 09/07):** a tela vale de **10/06/2026 em diante** (antes disso os
envios saíram pela planilha). Todos os usuários com acesso podem inserir código e disparar —
fica **registrado quem** inseriu (`tracking_added_by`). A configuração de produtos é admin-only.

---

## Fluxo ponta-a-ponta

```
Venda paga (webhook guru/ticto/eduzz OU venda manual) ──► customer_purchases (status='authorized')
        │ trigger trg_customer_purchases_shipment
        │   entra se product_type='fisico' OU nome bate no catálogo shipping_products
        ▼
   order_shipments (1 por compra física)  ◄── spedy-webhook (invoice.authorized) → NF + XML/PDF (Storage)
        │  endereço do raw_data do Guru
        ▼
   Tela /rastreios
     • lista pedidos pagos · baixa NF · cola o código → botão "Enviar"
        │ tracking_code preenchido → dispatch_status='na_fila' (+ carimbo de quem inseriu)
        ▼
   cron dispatch-tracking-1min → enqueue-tracking-dispatch (lotes de 10, ~4s entre envios)
     • dedupe: mesmo telefone+código = 1 mensagem só (no lote e vs. já enviados)
     • canal uazapi: SÓ pelo número dedicado (TRACKING_UAZAPI_PHONE) — nunca pelos números
       das vendedoras; 3 variações de texto (marca **Soulnaturi**)
     • canal manychat (alternativa): marca tag → fluxo oficial
     • canal não configurado → pedido ESPERA na fila (não falha)
        │
        ▼
   cron correios-sync-6h → correios-tracking-sync (status de entrega na tela)
```

---

## Catálogo de produtos que geram envio (09/07)

Problema que motivou: ~478 vendas pagas de potes estavam com `product_type='digital'` (inferência
do webhook falha em vendas manuais e webhooks antigos) e **nunca apareciam na tela**.

- Tabela **`shipping_products`** (`product_name_contains`, `display_name`, `active`) — mesmo padrão
  do `funnel_products`. Venda paga entra na tela se `product_type='fisico'` **OU** se o nome do
  produto bate num padrão ativo (`is_shipping_product()`).
- Padrões atuais: `articulabem` · `supervita` · `revitasoul` · `soulnaturi` · `necessaire` · `ecobag`.
  (Cuidado com padrões curtos: `pote` pegaria "Potencializar", que é produto digital.)
- **Configurável na tela**: botão **Produtos** (oculto p/ logística-only) — adicionar/remover padrão,
  liga/desliga, contagem de vendas pagas por padrão e ação **"Puxar vendas pagas agora"**
  (rpc `sync_shipments_from_purchases`, corte default 10/06 — não ressuscita os 474 históricos
  da era da planilha).

⚠️ **Limitação conhecida:** `insert_manual_sale` (venda manual do CRM) não captura o cliente →
a venda física manual entra na tela **sem nome/telefone/endereço** (completar à mão). Melhoria
futura: vincular lead no `ManualSaleDialog`.

---

## Modelo de dados

| Tabela / objeto | Papel |
|---|---|
| `order_shipments` | Pedido de envio. Origem em `source` (`webhook`\|`planilha`\|`manual`). `customer_purchase_id` **nullable** (pedidos da planilha sem venda). Campos: snapshot do cliente (nome/telefone/email/cpf), endereço (`ship_*`), produto/`quantity`, `purchased_at`, `planilha_shipped_at`, `frete_value`/`logistica_value` (editáveis na tela), NF (`spedy_invoice_id`, `nf_number`, `nf_xml_url`, `nf_pdf_url`, `nf_status`, `nf_issued_at`), rastreio (`tracking_code`, `carrier`, `tracking_status`, `tracking_last_event`, `tracking_delivered`), disparo (`dispatch_status`, `dispatch_channel`, `dispatched_at`, `wz_execution_id`), auditoria (`tracking_added_by`, `tracking_added_by_name`). |
| `shipping_products` | Catálogo configurável de produtos que geram envio (ver acima). |
| `spedy_invoices` | Toda NF recebida do Spedy (casada ou órfã), para reconciliação. |
| `shipment_tracking_events` | Histórico de eventos dos Correios por pedido. |
| `cron_secrets` | `supabase_url` + `dispatch_token` (token escopado p/ os crons chamarem as functions — **não** a service_role). RLS sem policies (só service_role/postgres). |
| views `v_shipments_sem_nf`, `v_nf_orfas` | De-para: pedidos sem NF × NFs sem pedido. |

**Status de disparo** (`dispatch_status`): `aguardando_rastreio` → `na_fila` → `enviado` / `falhou`.
**Status de entrega** (`tracking_status`): `postado` · `em_transito` · `saiu_entrega` · `aguardando_retirada` · `entregue` · `devolvido`.

**Criação automática:** trigger em `customer_purchases` chama `create_shipment_for_purchase()` p/
toda compra **aprovada** (a decisão físico/não fica na função: `product_type='fisico'` OU catálogo).
`sync_shipments_from_purchases(p_since default '2026-06-10')` faz backfill respeitando o corte.

---

## Edge functions

| Function | verify_jwt | O que faz |
|---|---|---|
| `enqueue-tracking-dispatch` | false | Processa a fila `na_fila` (lote de 10/min, ~4s entre envios). **Dedupe** por telefone+código (agrupa no lote; se o código já foi `enviado` pro mesmo telefone, tira da fila com nota, sem repetir mensagem). Canal `uazapi`: com `TRACKING_UAZAPI_PHONE` setado, **só a instância daquele número dispara** (sem match conectado → fila espera; nunca cai em outra instância); templates com a marca **Soulnaturi**. Canal `manychat`: via `manychat-sync` → marca tag. Canal não configurado → **pula** (mantém na fila). Auth: service_role **ou** `TRACKING_DISPATCH_SECRET`. |
| `spedy-webhook` | false | Recebe `invoice.authorized`. De-para por `order.transactionId` → CPF → email. Baixa XML/PDF → bucket `notas-fiscais` (público). Preenche a NF + endereço oficial no pedido. |
| `correios-tracking-sync` | false | Cron. Autentica no CWS (cartão de postagem) e consulta a Rastro API por rastreio ativo; atualiza `tracking_status` + histórico. **Só atualiza a tela — não manda mensagem.** Pula sem erro até as credenciais Correios existirem. |
| `manychat-sync` *(estendida)* | false | Ganhou o param opcional `fields` p/ setar custom fields (ex.: código de rastreio) **antes** de aplicar a tag. |

**Crons (pg_cron + pg_net):** `dispatch-tracking-1min` (a cada min, só dispara se há `na_fila`) · `correios-sync-6h`. Ambos leem `cron_secrets` e chamam a function com o `dispatch_token`.

---

## Frontend & acesso

- Tela: `src/pages/Rastreios.tsx` (+ `src/hooks/useShipments.ts`, `src/hooks/useShippingProducts.ts`).
  Tabela paginada (50/pág), filtro "Desde" (default 10/06), rolagem horizontal (topo + base), legenda
  em "?" (hover), realtime.
- **Fluxo de envio:** digitou o código → botão roxo **"Enviar"** habilita → clicou → fila → robô
  dispara. Botão "Já enviei" marca como enviado sem disparar. Sob o código aparece
  *"inserido por Fulana"* (auditoria).
- **Drawer do cliente:** clicar no nome abre painel com **todas as compras** da pessoa
  (via `useLeadPurchases` — badge Pago/Reembolsado/Aguardando pgto, total gasto).
- **Botão Produtos:** config do catálogo `shipping_products` (só p/ quem não é logística-only).
- **RBAC:** permissão `mod_rastreios` (em `user_permissions`). Usuário "logística" = só
  `mod_rastreios=true` → `isLogisticaOnly()` + `RastreiosGuard` (em `App.tsx`) travam ele só em
  `/rastreios`; o login redireciona pra lá. Admin/gestor já recebem `mod_rastreios=true` na migration.
- Rota gated por `<PermissionRoute requiredPermission="mod_rastreios">`; item "Logística" no `AppSidebar` condicionado a `can('mod_rastreios')`.

---

## Disparo — número dedicado & ativação

Decisão (Matheus, 09/07): o disparo sai **só pelo 48 99211-2108** ("Automações Correios",
instância conectada em `whatsapp_instances` como `554892112108` — sem o 9º dígito; o match do
pin ignora 55/9º dígito via `brKey`).

**Estado: DESLIGADO.** A fila acumula (espera por design) até a ativação. Mensagem validada em
teste real no WhatsApp do Matheus (marca Soulnaturi, código em negrito, link dos Correios).

Ativação (quando o Matheus liberar — ele quer antes validar os objetos no site dos Correios):

```bash
supabase secrets set TRACKING_UAZAPI_PHONE=48992112108 TRACKING_DISPATCH_CHANNEL=uazapi
supabase functions deploy enqueue-tracking-dispatch   # se houver mudança pendente no repo
```

Ao ativar, a fila drena a ~10 msgs/min (lote 10/min, 4s entre envios; lote cabe no minuto do
cron — não aumentar `TRACKING_SEND_DELAY_MS` sem reduzir `TRACKING_BATCH_SIZE`, senão lotes
sobrepõem).

---

## Secrets / configuração

| Secret | Estado | Uso |
|---|---|---|
| `SPEDY_API_KEY` | ✅ setado (empresa Soulnaturi, CNPJ 66166730000175) | Spedy (X-Api-Key). Webhook `invoice.authorized` registrado (id `8c324036`). |
| `TRACKING_DISPATCH_SECRET` | ✅ setado | Auth interna dos crons → functions (também em `cron_secrets.dispatch_token`). |
| `TRACKING_DISPATCH_CHANNEL` | ⏳ **é o botão de ligar** | Setar `uazapi` na ativação (default `manychat`, que espera tag inexistente → fila segura). |
| `TRACKING_UAZAPI_PHONE` | ⏳ setar na ativação | Pino do número dedicado (48992112108). Sem match conectado → fila espera. |
| `TRACKING_MC_TAG_NAME` / `TRACKING_MC_CODE_FIELD` | (alternativa manychat, não usada) | Tag que dispara o fluxo oficial no ManyChat + custom field do código. |
| `CORREIOS_USER` / `CORREIOS_PASSWORD` / `CORREIOS_CARTAO` | ⏳ pendente | API oficial CWS/Rastro (gerar em cws.correios.com.br; chave expira 180 dias). |
| `TRACKING_UAZAPI_TEMPLATES`, `TRACKING_SEND_DELAY_MS`, `TRACKING_BATCH_SIZE` | opcionais | Sobrescrever variações de texto / pacing do UazAPI. |

---

## Auditoria da fila (09/07)

Antes de liberar o disparo, auditamos os 143 que estavam `na_fila`:

- ✅ Todos compra Guru **paga** (`authorized`) — zero pix pendente/reembolso; telefones 100%.
- 🔧 Corrigidos: código `"v"` (typo) e código `AP175781042BR` repartido entre 2 clientes → voltaram
  p/ `aguardando_rastreio` com nota; 1 duplicado exato (mesma pessoa/código já `enviado`) → removido
  da fila. **Fila: 139 limpos.**
- 🔧 11 clientes com 2 pedidos no mesmo código → resolvido no motor (dedupe), não no dado.
- ✅ Completude: desde 10/06, **zero** venda paga física fora da tela (validado pós-catálogo).

**Estado dos dados (09/07):** 1.303 pedidos · 139 `na_fila` · 824 `aguardando_rastreio` · 340 `enviado`.

---

## Planilha Santo Mato como base (de-para)

Decisão: a planilha é a verdade operacional do histórico → importada como base; as vendas alimentam por cima.
Importados **263 códigos de rastreio** da planilha (marcados `enviado`, **não redisparam**):
- **34 mesclados** em pedidos de venda (match único por CPF/telefone/email).
- **229 inseridos** como `source='planilha'` (17 ambíguos de cliente repetido — **não chutados** — + 212 antigos fora dos webhooks).
- Limite do histórico: dos 229, **67 têm endereço** e **160 têm data** (só o que a planilha registrava); **0 têm NF** (a planilha nunca teve coluna de NF e os pedidos são anteriores ao Spedy). Pedidos novos entram completos.

---

## Migrations & PRs

Migrations: `20260623100000` permissão `mod_rastreios` · `100100` `order_shipments` + trigger + backfill · `100200`/`100400` cron de disparo + `cron_secrets` · `100300` `spedy_invoices` + bucket + views · `100500` Correios · `100600` colunas extras · `100700` `source` + FK nullable · **`20260709120000` catálogo `shipping_products` + trigger por catálogo + corte 10/06** · **`160000` auditoria `tracking_added_by`**.

PRs: **#18–#22** (módulo, colunas, planilha) · **#67** (número dedicado `TRACKING_UAZAPI_PHONE`) · **#68** (templates com parabéns/negrito) · **#69** (catálogo + dedupe + drawer do cliente) · **#70** (marca Soulnaturi + botão "Enviar") · **#71** (auditoria de quem inseriu).

---

## Pendências

1. **Ligar o disparo** (aguardando "pode ligar" do Matheus — ele quer validar os objetos nos
   Correios antes): setar `TRACKING_UAZAPI_PHONE` + `TRACKING_DISPATCH_CHANNEL=uazapi` (ver runbook acima).
2. **Correios:** gerar a chave no CWS e setar `CORREIOS_USER`/`PASSWORD`/`CARTAO` — habilita o
   status de entrega na tela e a validação automática dos objetos.
3. **Venda manual sem cliente:** `insert_manual_sale` não pergunta quem comprou → shipment entra
   sem nome/telefone/endereço. Vincular lead no `ManualSaleDialog`.
4. **Bot responder "qual meu código de rastreio?"** (ideia do Matheus — os códigos já estão no
   banco por telefone).
