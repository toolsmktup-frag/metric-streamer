

## Plano: Integrar controle de acesso a Campanhas/Funis na página de Equipe

### Situação atual
- O componente `FunnelAccessManager` existe em `src/components/lead-funnels/FunnelAccessManager.tsx` mas **nunca é importado ou renderizado** em nenhuma página.
- Na página `/equipe`, ao expandir um vendedor, aparecem apenas: permissões de módulo e instâncias WhatsApp. Falta a seção de acesso a campanhas/funis.
- A tabela `lead_funnel_access` e os hooks (`useGrantFunnelAccess`, `useRevokeFunnelAccess`) já funcionam.

### O que será feito

**1. Adicionar seção "Acesso a Campanhas/Funis" na página de Equipe (`src/pages/Equipe.tsx`)**
- No painel expandido de cada vendedor (abaixo das instâncias WhatsApp), adicionar uma nova seção.
- Listar todas as campanhas da organização com checkboxes para conceder acesso à campanha inteira.
- Dentro de cada campanha, listar os funis com checkboxes individuais.
- Se o vendedor já tem acesso à campanha, os funis internos aparecem marcados e desabilitados (acesso herdado).
- Usar os hooks existentes (`useLeadCampaigns`, `useLeadFunnels`, `useOrgFunnelAccess`, `useGrantFunnelAccess`, `useRevokeFunnelAccess`).

**2. Arquivos modificados**
- `src/pages/Equipe.tsx` — importar hooks de campanhas/funis e adicionar a seção de acesso no painel expandido de cada vendedor.

### Detalhes técnicos
- Reutilizar a lógica já existente no `FunnelAccessManager` (verificação de acesso campanha vs funil, toggle campaign/funnel).
- Layout: grid com campanhas como grupos, funis indentados abaixo, usando `Checkbox` consistente com o padrão das instâncias WhatsApp.
- Só exibir para vendedores/suporte (admins e gestores já têm acesso total).

