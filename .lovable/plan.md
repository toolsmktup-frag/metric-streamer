

## Plan: Centralizar controle de acesso de vendedores no Gerenciar Instâncias

### Problema atual
O controle de acesso de vendedores está espalhado em 3 lugares diferentes:
1. **Gerenciar Instâncias** (WhatsApp) — `InstanceAccessManager` ✅ manter
2. **Página de Campanhas** (botão 👥 por campanha) — `FunnelAccessManager` ❌ remover
3. **Aba Config do Funil** (seção de acesso) — `FunnelAccessManager` ❌ remover

Além disso, o `InstanceAccessManager` mostra "Nenhum vendedor encontrado" porque a query filtra por `organization_id` mas possivelmente não encontra os perfis.

### Alterações

**1. Remover acesso de vendedores da página de Campanhas (`LeadCampaigns.tsx`)**
- Remover import do `FunnelAccessManager`
- Remover import do ícone `Users`
- Remover estado `accessCampaignId`
- Remover botão 👥 no header da campanha
- Remover bloco expandível do `FunnelAccessManager`

**2. Remover acesso de vendedores da aba Config do Funil (`FunnelConfigTab.tsx`)**
- Remover import do `FunnelAccessManager`
- Remover seção `{funnelId && <FunnelAccessManager ... />}`

**3. Corrigir InstanceAccessManager para encontrar vendedores**
- Investigar e corrigir a query que busca membros da organização (possivelmente o `get_user_org_id` retorna null ou a query de `user_profiles` precisa ajuste)
- Garantir que lista todos os membros não-admin da organização corretamente

### Arquivos modificados
- `src/pages/LeadCampaigns.tsx`
- `src/components/lead-funnels/FunnelConfigTab.tsx`
- `src/components/whatsapp/InstanceAccessManager.tsx` (fix query)

