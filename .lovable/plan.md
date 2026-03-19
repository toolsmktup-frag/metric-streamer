

## Plano: Padronizar status de compra para `authorized`

### Problema

O sistema usa dois padrões de status diferentes para a mesma coisa ("compra aprovada"):

| Local | Status usado | Onde |
|-------|-------------|------|
| **Banco (SQL, triggers, RFM, views)** | `authorized` | 21+ arquivos, todas as RPCs e migrations |
| **Frontend (Leads/CRM)** | `approved` / `Aprovada` | 3 arquivos TypeScript |

Isso causa divergência nos cálculos de LTV entre módulos.

### Solução

Padronizar tudo para `authorized`, que já é o padrão dominante (usado em 95% do código). Apenas 3 arquivos frontend precisam de ajuste.

### Alterações

**1. `src/hooks/useLeadPurchases.ts`** (linha 63)
- Trocar `p.status === 'approved' || p.status === 'Aprovada'` por `p.status === 'authorized'`
- Trocar `net_amount ?? gross_amount` por `gross_amount` (alinhar com RFM)

**2. `src/components/lead-funnels/LeadTimeline.tsx`** (linha 164)
- Trocar `p.status === 'approved' || p.status === 'Aprovada'` por `p.status === 'authorized'`

**3. `src/components/whatsapp/ContactPanel.tsx`** (linha 174)
- Trocar `p.status === 'approved' || p.status === 'Aprovada'` por `p.status === 'authorized'`

**4. `src/components/lead-funnels/LeadCard.tsx`** (STATUS_LABELS)
- Adicionar `authorized: 'Aprovado'` ao mapa de labels (para exibir "Aprovado" no card)

### Resultado

Após a correção, o LTV no CRM (Base de Leads) vai usar a mesma lógica do RFM (Inteligência de Cliente), eliminando a divergência.

