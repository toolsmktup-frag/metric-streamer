
Plano: Fase 1 — Auditoria de uso das colunas legacy

### Objetivo
Mapear TODAS as referências a `funnels.platform` e `funnels.webhook_token` no código (frontend + edge functions) pra decidir com segurança se dá pra dropar as colunas ou se precisa refatorar antes.

### O que vou fazer (read-only, zero risco)

**1. Buscar referências no código**
- `code--search_files` por `webhook_token` em `src/**` e `supabase/functions/**`
- `code--search_files` por `\.platform\b` em contexto de `funnels` (filtrar falsos positivos de `funnel_platforms.platform`)
- `code--search_files` por `from('funnels')` e `.from("funnels")` pra ver todo SELECT/UPDATE na tabela

**2. Classificar cada ocorrência em 3 buckets**
- 🟢 **OK** — já lê/escreve em `funnel_platforms` (não bloqueia drop)
- 🟡 **Fallback legacy** — lê de `funnels.webhook_token` como fallback (precisa remover antes do drop)
- 🔴 **Legacy puro** — só lê de `funnels.platform`/`funnels.webhook_token` (precisa refatorar pra `funnel_platforms`)

**3. Inspecionar pontos críticos esperados**
- `supabase/functions/ticto-webhook/index.ts`
- `supabase/functions/guru-webhook/index.ts`
- `supabase/functions/eduzz-webhook/index.ts`
- `src/hooks/useFunnels.ts` (já vi — usa `platform` no tipo)
- `src/components/lead-funnels/WebhookConfig.tsx` (usa `funnel.webhook_token`)
- Páginas de configuração de funil (`FunisConfigurar.tsx`)
- Tipos TS (`src/types/`, `src/integrations/supabase/types.ts`)

### Entregável (no chat)
Relatório no formato:
```
## Auditoria de uso — funnels.platform / funnels.webhook_token

### 🟢 OK (X ocorrências) — não bloqueia drop
- arquivo:linha — descrição

### 🟡 Fallback legacy (Y ocorrências) — remover antes do drop
- arquivo:linha — descrição + ação sugerida

### 🔴 Legacy puro (Z ocorrências) — refatorar antes do drop
- arquivo:linha — descrição + ação sugerida

### Veredito
- ✅ Pode dropar agora / ⚠️ Precisa refatorar N arquivos / ❌ Bloqueado
- Estimativa de trabalho pra Fase 2 (drop)
```

### Próximo passo (não é dessa fase)
Com o relatório na mão, você decide:
- **Verde:** vou direto pra Fase 2 (migration de drop + remoção do fallback nas edge functions)
- **Amarelo/Vermelho:** te mostro o plano de refatoração antes da Fase 2

Tudo aqui é leitura — nenhum arquivo alterado, nenhum SQL rodado.
