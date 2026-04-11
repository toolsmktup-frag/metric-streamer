

## Fase 5: Motor de Regras Automáticas (Auto-Rules)

Pagina global separada em `/auto-rules` com criacao/edicao de regras que monitoram metricas e executam acoes automaticas na API do Meta Ads.

---

### O que sera construido

**1. Migration: tabela `automation_rules`**
```sql
CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  -- Condicoes (array de condicoes AND)
  conditions JSONB NOT NULL DEFAULT '[]',
  -- Ex: [{"metric":"cpa","operator":">","value":50},{"metric":"roi","operator":"<","value":0}]
  action TEXT NOT NULL, -- 'pause_campaign' | 'reduce_budget' | 'alert'
  action_params JSONB DEFAULT '{}',
  -- Escopo
  scope_type TEXT DEFAULT 'campaign', -- 'campaign' | 'adset' | 'ad'
  scope_ids TEXT[] DEFAULT '{}', -- IDs especificos ou vazio = todos
  funnel_id UUID REFERENCES funnels(id),
  -- Controle
  check_interval_minutes INT DEFAULT 15,
  last_checked_at TIMESTAMPTZ,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**2. Migration: tabela `automation_rule_logs`**
```sql
CREATE TABLE automation_rule_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ DEFAULT now(),
  conditions_snapshot JSONB,
  action_taken TEXT,
  target_id TEXT, -- campaign/adset/ad ID
  meta_response JSONB,
  status TEXT DEFAULT 'success' -- 'success' | 'error'
);
```

**3. Pagina `src/pages/AutoRules.tsx`**
- Lista de regras com toggle ativo/inativo
- Botao "Nova Regra" abre dialog/drawer
- Formulario: nome, condicoes (metric + operator + value), acao, escopo
- Metricas disponiveis: CPA, ROI, ROAS, Spend, Revenue
- Acoes: Pausar Campanha, Reduzir Orcamento (%), Enviar Alerta
- Tabela de logs recentes mostrando quando cada regra disparou

**4. Sidebar: novo item em "Trafego & ADS"**
- Icone `Zap` ou `Shield`, label "Auto-Rules"
- Path: `/auto-rules`

**5. Rota em `App.tsx`**
- `<Route path="/auto-rules" element={<Protected><AutoRules /></Protected>} />`

**6. Edge Function `auto-rules-engine/index.ts`**
- Chamada via pg_cron a cada 15 min
- Busca regras ativas, calcula metricas cruzando `meta_insights` + `v_all_sales`
- Se condicoes atendidas: executa acao via Meta Ads API (pause/budget)
- Registra log em `automation_rule_logs`

---

### Arquivos

| Arquivo | Acao |
|---------|------|
| `supabase/migrations/xxx_automation_rules.sql` | Criar tabelas |
| `src/pages/AutoRules.tsx` | Criar pagina |
| `src/hooks/useAutoRules.ts` | Criar hook CRUD |
| `src/components/layout/AppSidebar.tsx` | Adicionar item |
| `src/App.tsx` | Adicionar rota |
| `supabase/functions/auto-rules-engine/index.ts` | Criar Edge Function |
| `supabase/migrations/xxx_auto_rules_cron.sql` | pg_cron a cada 15min |

