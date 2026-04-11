

## Revisão do Plano v2 — Status de Implementação por Fase

### FASE 1: Fundação do Tracking Server-Side ✅ COMPLETA
- **Script JS leve** para landing pages — implementado (gera `visitor_id`, captura UTMs, `fbclid`, `fbc`, `fbp`, `gclid`, fingerprinting)
- **Edge Function `track-event`** — implementada e deployada, recebe eventos via `sendBeacon`/`fetch`, extrai IP real dos headers

### FASE 2: Banco de Dados de Jornada e Captura de E-mail ✅ COMPLETA
- **Tabela `clicks`** — criada no Supabase (visitor_id, event_type, UTMs, fbclid, fbc, fbp, gclid, ip_address, user_agent, email)
- **Edge Function `track-event`** — faz INSERT na tabela `clicks` usando `service_role`
- **Captura de e-mail** — script JS escuta evento `blur` em campos de e-mail e envia `email_capture` para o `track-event`

### FASE 3: Integração Meta CAPI e Deduplicação ✅ COMPLETA
- **Edge Function `meta-capi-sync`** — criada e funcionando
- **Webhooks chamam CAPI** — Ticto, Eduzz e Guru webhooks fazem `await fetch()` para `meta-capi-sync` após salvar venda
- **Enriquecimento via `clicks`** — a função busca o registro de clique pelo e-mail do comprador para resgatar IP, User-Agent, `fbp`, `fbc`
- **Deduplicação** — usa `external_id` (transaction hash/order ID)
- **Hash SHA-256** — aplicado em e-mail e telefone

### FASE 4: Sincronização de Custos e Dashboard de ROI ✅ COMPLETA
- **Edge Function `sync-meta`** — busca `spend` por campaign/adset/ad via Meta Ads API
- **Tabela `meta_insights`** — armazena custos diários (spend, impressions, clicks, reach, actions)
- **Dashboard de ROI** — cruza receita das vendas com custos do `meta_insights`, exibindo Custo, Receita, Lucro e ROI

### FASE 5: Motor de Regras Automáticas (Auto-Rules) ⚠️ PARCIALMENTE COMPLETA

**O que está pronto:**
- Página `/auto-rules` com UI completa (lista, toggle ativo/inativo, criação/edição de regras)
- Hook `useAutoRules.ts` com CRUD completo
- Edge Function `auto-rules-engine` com lógica de avaliação de métricas
- Rota no `App.tsx` e item na Sidebar
- Configuração no `config.toml`

**O que falta:**
1. **Migration SQL não foi aplicada** — as tabelas `automation_rules` e `automation_rule_logs` não existem no banco. A migration nunca foi criada como arquivo em `supabase/migrations/`. O SQL foi fornecido para execução manual, mas precisa ser confirmado se foi rodado no Supabase Dashboard.
2. **pg_cron não configurado** — a migration de cron para rodar a Edge Function a cada 15 minutos não foi criada
3. **Integração real com Meta Ads API** — as ações `pause_campaign` e `reduce_budget` estão como placeholder (logam "pending"), não executam chamadas reais à API do Meta

---

### Resumo

| Fase | Status |
|------|--------|
| 1 - Tracking Server-Side | ✅ Completa |
| 2 - Banco de Jornada + E-mail | ✅ Completa |
| 3 - Meta CAPI + Deduplicação | ✅ Completa |
| 4 - Sync Custos + Dashboard ROI | ✅ Completa |
| 5 - Auto-Rules Engine | ⚠️ 70% — falta migration no banco, pg_cron e ações reais na Meta API |

### Próximos passos para fechar a Fase 5

1. **Criar migration** para as tabelas `automation_rules` e `automation_rule_logs` com RLS policies (via ferramenta de migration do Lovable)
2. **Criar migration pg_cron** para agendar execução da Edge Function a cada 15 minutos
3. **Implementar ações reais na Meta API** dentro da Edge Function (pausar campanha, alterar orçamento) — requer o `access_token` do Meta por funil/organização

