

## Vincular Automações (wz_flows) ao Funil de Leads

### Ideia

Em vez de o usuário navegar até "Automações WhatsApp" separadamente, ele vincula automações diretamente dentro do funil. Na aba **Configuração** do funil aparece uma seção "Automações vinculadas" onde ele seleciona quais `wz_flows` rodam para aquele funil. Opcionalmente, uma nova aba **Automações** dentro do funil mostra os flows vinculados com atalhos para editar/ver execuções.

### O que muda

**1. Migration — Tabela de vínculo `lead_funnel_automations`**

```sql
CREATE TABLE public.lead_funnel_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  wz_flow_id uuid NOT NULL REFERENCES public.wz_flows(id) ON DELETE CASCADE,
  trigger_events text[] DEFAULT '{}',  -- ex: ['purchase','pix_generated']
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(funnel_id, wz_flow_id)
);
```

Com RLS filtrando por organização.

**2. FunnelConfigTab — Nova seção "Automações"**

Na aba Configuração do funil, abaixo dos produtos, adicionar:
- Select multi para escolher `wz_flows` disponíveis
- Para cada flow vinculado: toggle ativo/inativo + seletor de eventos gatilho (purchase, pix_generated, etc.)
- Botão "Editar flow" que abre o editor do wz_flow

**3. Nova aba "Automações" no funil (atalho)**

No `LeadFunnelDetail.tsx`, adicionar uma tab "Automações" (visível só para admin) que lista os flows vinculados com:
- Status (ativo/inativo)
- Últimas execuções inline
- Link direto para o editor do flow

**4. Hook `useLeadFunnelAutomations`**

CRUD para a tabela de vínculo — listar, vincular, desvincular, toggle ativo.

**5. Executor — Respeitar vínculo**

No `wz-executor`, ao receber um evento de um funil, consultar `lead_funnel_automations` para disparar apenas os flows vinculados àquele funil com aquele evento.

### Arquivos

| Arquivo | Ação |
|---|---|
| `supabase/migrations/xxx_lead_funnel_automations.sql` | Criar tabela de vínculo + RLS |
| `src/hooks/useLeadFunnelAutomations.ts` | Novo hook CRUD |
| `src/components/lead-funnels/FunnelAutomationsConfig.tsx` | Seção na config para vincular flows |
| `src/components/lead-funnels/FunnelAutomationsTab.tsx` | Nova aba com lista de flows vinculados |
| `src/components/lead-funnels/FunnelConfigTab.tsx` | Importar FunnelAutomationsConfig |
| `src/pages/LeadFunnelDetail.tsx` | Adicionar aba "Automações" + passar dados |
| `src/types/wz-automation.ts` | Tipo `LeadFunnelAutomation` |

