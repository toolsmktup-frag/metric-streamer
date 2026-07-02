# Fix: aba Conjuntos zerada — pipe ("|") no nome do adset quebrava o parse de UTM

**Data:** 2026-07-01 (noite) · **PR:** #54 · **Status:** ✅ mergeado + 3 webhooks deployados + backfill executado e validado em prod

Queixa do Matheus (print em call): na tela **Campanhas → Conjuntos**, os 9 conjuntos da campanha "Old ABO - Guia de Tinturas - Teste" mostravam gasto (R$2.170/7d) mas **zero vendas/faturamento/ROAS**. Mesmo sintoma nas campanhas "Old CBO" e "Mythus CBO". A aba Campanhas e a aba Anúncios marcavam normalmente.

---

## Causa

As UTMs do Meta chegam no formato `Nome|id` e o `parseUtmPair` dos webhooks (`ticto-webhook`, `guru-webhook`, `eduzz-webhook` — 3 cópias divergentes) fazia `value.split("|")` exigindo **exatamente 2 partes**. Os conjuntos passaram a ser nomeados com data usando pipe (`05 - Teste 1 - Imagem | 16/6`), então o `utm_medium` chega como `05 - Teste 1 - Imagem | 16/6|120249389417640755` = **3 partes** → id descartado → `meta_adset_id` NULL na transação → a agregação `byAdset` do front não encontra nada.

- Campanha marca (nome sem pipe) e anúncio marca (utm_content com 1 pipe) — só o conjunto zera.
- Provado no banco: as 3 campanhas afetadas estavam com `com_adset = 0` **desde o primeiro dia (20/06)** com `com_ad = 100%` → não foi regressão dos PRs #47–#53, é a convenção nova de nome de conjunto.
- O dry-run mostrou que o problema era bem mais antigo/amplo: **9.693** linhas em `ticto_transactions` (adset) + **2.131** (ad) + **11.894** em `customer_purchases` (adset) tinham o id recuperável parado na UTM.

## Correção (PR #54)

Helper compartilhado **[_shared/parseUtmPair.ts](../supabase/functions/_shared/parseUtmPair.ts)**, importado pelos 3 webhooks (remove as 3 cópias):

- Corte pelo **último** pipe (`lastIndexOf`) — o nome pode conter `|` à vontade.
- ID só é aceito se for **numérico** (IDs do Meta são sempre dígitos) — também derruba placeholders literais (`{{adset.id}}`).
- Mantém o strip do sufixo `::<fbclid>` que o checkout embute.

Deploy manual pós-merge (Lovable não deploya função): `ticto-webhook` v68, `guru-webhook` v53, `eduzz-webhook` v37.

## Backfill (executado no SQL Editor)

4 UPDATEs, todos só preenchendo colunas **NULL** (não tocam em receita/status/data), extraindo o id com `substring(utm from '\|\s*(\d{5,})(?:::[^|]*)?\s*$')` e, no Ticto, o nome com o `regexp_replace` complementar:

1. `ticto_transactions.meta_adset_id` + `meta_adset_name` ← `utm_medium`
2. `ticto_transactions.meta_ad_id` + `meta_ad_name` ← `utm_content`
3. `customer_purchases.meta_adset_id` ← `utm_medium`
4. `customer_purchases.meta_ad_id` ← `utm_content`

**Validação:** contagens de "recuperável ainda NULL" zeraram nas 3 frentes; a "Old ABO" saiu de 0 → **58/58 vendas pagas com adset**, e o join com `meta_adsets` casa (últimos 7 dias voltaram a distribuir por conjunto: 01→6 vendas/R$262, 02→9/R$383, 03→5/R$335, 04→4/R$268, 05 Imagem→5/R$235, 05 Videos→1/R$47, 06→1/R$47, 07→7/R$329). Basta F5 na tela — correção é toda de dados.

---

## Achado paralelo: link com placeholders crus (pendência do Matheus)

**191 vendas desde fev/2025 (181 pagas, R$11.675)** chegam com TODAS as UTMs literais — `utm_campaign={{campaign.name}}|{{campaign.id}}`, `utm_term={{placement}}`, `sck` inteiro cru — e `utm_source=FB` fixo. Se fosse clique real em anúncio, o Meta resolveria os placeholders; vindo tudo literal, é um **link de checkout/LP com o template de UTM cru colado fora do gerenciador** (fluxo de WhatsApp, e-mail, bio, botão de LP, link encaminhado). Recorrência baixa e constante (~2-5/mês) sugere ponto fixo.

- Produtos afetados: quase tudo "COMO PREPARAR TINTURAS" (Ticto), + "Articulabem - 3 Potes (VSL)" (Guru) e "Imersão Um Tempo pra Mim".
- Não dá para apontar o anúncio — os ids nunca foram preenchidos. Ação: **Matheus procurar onde o link com `{{campaign.name}}` literal foi reutilizado** nesses funis.
- Com o parser novo, esses placeholders deixam de virar "id" em qualquer campo (validação numérica), mas as vendas seguem sem atribuição até o link ser corrigido na origem.

## Lições

- Nome de campanha/conjunto/anúncio é **texto livre do gestor de tráfego** — parser de UTM não pode assumir formato do nome; ancorar no fim (id numérico) e não no separador.
- Helper de parsing compartilhado em `_shared/` — as 3 cópias já tinham divergido (a do Ticto tratava "Não Informado", as outras não).
