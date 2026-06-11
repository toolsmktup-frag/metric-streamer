# Auditoria de Segurança e Bugs — metric-streamer (Tráfego Lovable)

**Data:** 2026-06-10
**Escopo:** Blindar edge functions expostas + corrigir bugs de confiabilidade + limpeza
**Contexto:** App **interno** (1 organização, 8 usuários, ~54.880 leads, 8 instâncias WhatsApp). Sem clientes externos.

---

## 1. Resumo executivo

A varredura combinou: advisors do Supabase, auditoria de código das 31 edge functions, auditoria do frontend (288 arquivos), testes empíricos de exposição e verificações estáticas (typecheck/lint/build).

**Boa notícia:** os dados **não vazam para a internet** — a chave anônima pública é barrada pelo RLS (testado: `leads`, `chat_messages`, `customer_purchases`, `whatsapp_messages` retornam 0 linhas para quem não está logado). As tabelas sensíveis (`leads`, `whatsapp_messages`, `user_profiles`) já têm isolamento por organização.

**Risco real encontrado e corrigido:** ~10 **edge functions estavam abertas na internet sem autenticação** — qualquer pessoa que conhecesse a URL do projeto (que fica no bundle público) podia injetar vendas falsas, disparar WhatsApp em massa, sequestrar instâncias e queimar orçamento de anúncios via conversões falsas no Meta.

| Métrica | Antes | Depois |
|---|---|---|
| Edge functions sem autenticação | ~10 | 0 |
| Erros de segurança (advisor) | 5 | 2 (views — ver §5) |
| Tabelas públicas sem RLS | 3 | 0 |
| Proteção contra senha vazada (HIBP) | desligada | ligada |
| Build / Typecheck | ok / ok | ok / ok |

---

## 2. Edge functions blindadas (13 arquivos)

### Funções internas — passam a exigir a `service_role` key
Confirmei que **todas** as chamadas legítimas (webhooks internos e cron jobs) já enviam `Authorization: Bearer <SERVICE_ROLE_KEY>`. As funções agora rejeitam (401) qualquer chamada externa:

- `meta-capi-sync` — impedia disparo de **conversões falsas no Meta** (queima de orçamento/otimização).
- `stock-deductor` — impedia manipulação de estoque.
- `wz-receiver`, `wz-executor`, `wz-scheduler` — impediam forçar execução de fluxos de automação.
- `auto-rules-engine` — impedia acionar regras que pausam/alteram campanhas.

### Funções manuais — passam a exigir usuário logado
O front já chama via `supabase.functions.invoke` (envia o JWT do usuário):

- `wz-bulk-enroll` — fechava o disparo **anônimo de WhatsApp em massa** (risco de ban da conta).
- `import-ticto-csv` — fechava a injeção anônima de transações falsas.

### Webhooks de venda — token obrigatório
`ticto-webhook`, `guru-webhook`, `eduzz-webhook` agora **rejeitam (401) payloads cujo `webhook_token` não resolve um funil válido**, antes de qualquer escrita. Confirmado no banco que **todos os funis ticto (5/5) e guru (6/6) já têm `webhook_token` configurado** — portanto não afeta vendas legítimas.

### IDOR e SSRF
- `whatsapp-instance` — o lookup de instância agora filtra por `organization_id` do usuário autenticado (antes buscava só por `id` com service_role → qualquer usuário podia **deletar/sequestrar instâncias e roubar tokens** de outra org). Criação de instância já setava `organization_id` (não quebra).
- `verify-tracking-snippet` — passa a **exigir login** e a **bloquear IPs internos/privados** (127/8, 10/8, 192.168/16, 172.16-31, 169.254 metadata, etc.), corrigindo o SSRF.

> Implementação: guards inline em cada função (sem dependência compartilhada nova), para não alterar o empacotamento do deploy.

---

## 3. Banco de dados (aplicado)

- **RLS habilitado** em `product_catalog`, `product_name_aliases` e `_backup_ticto_webhook_dupes_20260316` — estavam com RLS desligado e grant total para `anon` (leitura **e escrita** sem login via PostgREST). Não são usadas pelo código → RLS sem policy (deny-by-default) não causa impacto. Migration: `supabase/migrations/20260610120000_enable_rls_orphan_catalog_tables.sql`.
- **Proteção contra senha vazada (HIBP)** habilitada no Auth.

---

## 4. Bugs de confiabilidade e limpeza

- **NaN nos KPIs** (`src/hooks/useMetaData.ts` — `aggregateInsights`): `Number(r.spend)` etc. viravam `NaN` quando o valor era nulo/vazio, contaminando totais de gasto/alcance/cliques (exibindo "R$ NaN"). Adicionado `|| 0`.
- **ESLint** passou a ignorar o framework e docs (`.aiox-core`, `.claude`, `docs`, `tmp`, backups) — os 1029 "erros" incluíam ~300 de templates do framework. Lint do app agora isola o código real.
- **Arquivos-lixo removidos:** `EOF` (0 bytes), `.prewarm` (0 bytes), `tailwind.config.backup.ts`, `src/index.backup.css`.

### Falsos positivos verificados (NÃO eram bugs)
- **"Fuso horário errado"** em `AgenteIA.tsx`/`Ecommerce.tsx`: o cálculo `new Date(Date.now() - 3h).toISOString()` está **correto** — `getTime()`/`toISOString()` operam em UTC, independente do fuso da máquina. Mantido.
- **"Delete global do chat"** em `AgenteIA.tsx`: `chat_messages` **não tem coluna de dono** (`id, role, content, created_at`) — é um histórico compartilhado da empresa; "limpar histórico" apagar tudo é o comportamento esperado para uso interno. Mantido.

---

## 5. Pendências recomendadas (NÃO aplicadas — exigem teste)

| Prioridade | Item | Por quê não apliquei agora |
|---|---|---|
| Média | 2 views `SECURITY DEFINER` (`v_all_sales`, `v_customers_needs_review`) | Recriar como `security_invoker` pode alterar quem enxerga os dados; precisa testar com a equipe logada. |
| Média | 15 funções com `search_path` mutável | Requer recriar cada função com `SET search_path`; baixo risco real para app interno. |
| Baixa | RLS `USING(true)` em tabelas da org | Aceitável para app interno de 1 org (todos da equipe veem os dados da empresa). Endurecer só se virar multi-cliente. |
| Baixa | 733 `as any` no front | Dívida de tipagem; reduzir aos poucos. |
| Baixa | 3 lockfiles concorrentes (`bun.lock`, `bun.lockb`, `package-lock.json`) | Remover exige saber qual o deploy/Lovable usa — não toquei para não quebrar o build. |
| Baixa | Cobertura de testes ≈ 0 (1 teste) | Adicionar testes nos hooks financeiros e nas edge functions. |
| Baixa | Performance: 42 FKs sem índice, índices duplicados/não usados | Otimização; sem urgência no volume atual. |

---

## 6. ⚠️ Checklist ANTES de republicar pela Lovable

As mudanças nas edge functions e no banco **endurecem autenticação**. Teste estes fluxos após o deploy:

- [ ] **Webhook de venda:** faça uma venda de teste (ou reenvie um webhook) em Ticto/Guru/Eduzz e confirme que a transação entra. *Se não entrar:* confirme que a URL de webhook configurada na plataforma contém `?token=<webhook_token>`.
- [ ] **Disparo em massa (wz-bulk-enroll):** rode pela UI logado — deve funcionar; deslogado/externo deve dar 401.
- [ ] **Importar CSV (import-ticto-csv):** rode pela UI logado.
- [ ] **Instâncias WhatsApp:** criar/conectar/deletar uma instância pela UI continua funcionando.
- [ ] **Crons:** confirme nos logs do Supabase que `wz-scheduler` (a cada 1min) e `auto-rules-engine` (a cada 15min) seguem retornando 200.
- [ ] **Verificar snippet de tracking:** a verificação pela UI continua funcionando (agora exige login).

> Reversão: cada guard é um bloco isolado e comentado (`🔒`), fácil de remover se algum fluxo legítimo for barrado. A migration de RLS é reversível com `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`.
