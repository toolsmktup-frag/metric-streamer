

## Plano: Controle de Acesso por Campanha e Funil para Vendedores

### Conceito
Criar um sistema de acesso granular onde o admin pode:
1. **Na campanha**: dar acesso total a todos os funis da campanha para um vendedor
2. **No funil**: dar acesso individual a funis específicos dentro de uma campanha

Admins e gestores sempre têm acesso a tudo. O controle se aplica apenas a vendedores/suporte.

### Modelo de Dados

Nova tabela `lead_funnel_access`:

```text
lead_funnel_access
├── id (uuid, PK)
├── user_id (uuid, FK → auth.users)
├── campaign_id (uuid, FK → lead_campaigns, nullable)
├── funnel_id (uuid, FK → lead_funnels, nullable)
├── organization_id (uuid)
├── created_at (timestamp)
└── CONSTRAINT: campaign_id OR funnel_id must be set
```

**Lógica de acesso:**
- Se existe registro com `campaign_id` preenchido → acesso a TODOS os funis da campanha
- Se existe registro com `funnel_id` preenchido → acesso apenas àquele funil
- Sem nenhum registro → sem acesso (para vendedores)
- Admin/gestor → ignora a tabela, acesso total

### Componente de UI

Reutilizar o padrão já existente no `InstanceAccessManager` (WhatsApp), que usa checkboxes por vendedor. Criar um componente similar `FunnelAccessManager` com duas seções:

1. **Na página de campanhas** — checkbox "Acesso total à campanha" por vendedor
2. **Dentro do funil (aba Config)** — checkbox por vendedor para acesso individual

### Arquivos

| Arquivo | Ação |
|---|---|
| **Migration** | Criar tabela `lead_funnel_access` com RLS |
| `src/hooks/useLeadFunnelAccess.ts` | **Novo** — CRUD de acessos + hook `useMyFunnelAccess` |
| `src/components/lead-funnels/FunnelAccessManager.tsx` | **Novo** — UI de checkboxes (similar ao WhatsApp) |
| `src/pages/LeadCampaigns.tsx` | Adicionar botão/seção de "Gerenciar Acesso" por campanha |
| `src/components/lead-funnels/FunnelConfigTab.tsx` | Adicionar seção de acesso por vendedor |
| `src/pages/LeadCampaigns.tsx` | Filtrar funis/campanhas visíveis para vendedores |
| `src/pages/LeadFunnelDetail.tsx` | Verificar acesso antes de renderizar |

### Segurança (RLS)

- `SELECT`: usuário vê apenas seus próprios registros de acesso
- `INSERT/DELETE`: apenas admin/gestor pode gerenciar acessos
- Função `has_funnel_access(user_id, funnel_id)` como SECURITY DEFINER para verificar acesso (checa tanto por campanha quanto por funil individual)

### Fluxo

```text
Admin abre Campanha X
  → Seção "Acesso de Vendedores"
  → Checkbox por vendedor: "Todos os funis" ← insere com campaign_id
  
Admin abre Funil Y (dentro de Campanha X)
  → Aba Config → Seção "Acesso de Vendedores"  
  → Checkbox por vendedor ← insere com funnel_id

Vendedor faz login
  → Vê apenas campanhas onde tem ao menos 1 funil com acesso
  → Dentro da campanha, vê apenas funis permitidos
```

