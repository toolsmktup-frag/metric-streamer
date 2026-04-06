

## Plano: Vincular Funil de Tráfego ao Funil de Leads + Ajustes Pendentes

Você tem razão -- eu mencionei que faltava esse link e outras coisas, mas depois disse "nenhuma alteração de código necessária". Vamos corrigir isso.

### O que realmente falta (código/schema)

**1. Coluna `traffic_funnel_id` em `lead_funnels`**

Hoje os dois mundos (funil de tráfego = tabela `funnels`, funil de leads = tabela `lead_funnels`) não têm nenhuma referência cruzada. Isso impede:
- Ver KPIs de receita dentro do painel de leads
- Saber qual funil de tráfego corresponde a qual funil de leads
- Unificar a experiência no dashboard

**Alteração:**
- Migration: `ALTER TABLE lead_funnels ADD COLUMN traffic_funnel_id UUID REFERENCES funnels(id) ON DELETE SET NULL;`
- Atualizar o tipo `LeadFunnel` em `src/types/leadFunnels.ts` com `traffic_funnel_id?: string | null`
- Atualizar hooks de criação/edição para aceitar o campo
- Na UI de criação/edição do funil de leads (`LeadCampaigns.tsx` / `LeadFunnelDetail.tsx`), adicionar um dropdown "Funil de Tráfego associado" que lista os funis da tabela `funnels`

**2. UI para configurar `stage_transition_rules` por evento**

O banco já suporta `stage_transition_rules` (evento → mover lead de etapa), mas preciso verificar se a UI de configuração já existe no detalhe do funil.

**3. UI para vincular produtos ao funil de leads (`lead_product_mappings`)**

O hook `useLeadProductMappings` já existe, mas preciso verificar se há uma interface na tela do funil para o usuário fazer o mapeamento "nome do produto na plataforma → funil de leads".

### O que NÃO precisa de código (configuração manual)

- Ativar eventos de Venda Aprovada na Ticto
- Criar etapas no funil de leads via UI existente
- Configurar fluxos de automação WhatsApp via editor existente

---

### Passos de implementação

**Passo 1 -- Migration: adicionar `traffic_funnel_id`**
- Criar migration SQL adicionando a coluna nullable com FK para `funnels(id)`

**Passo 2 -- Atualizar tipos e hooks**
- `src/types/leadFunnels.ts`: adicionar `traffic_funnel_id`
- `src/hooks/useLeadFunnels.ts`: incluir campo nas mutations de create/update
- Criar hook `useTrafficFunnels()` (ou reutilizar o existente que busca da tabela `funnels`) para popular o dropdown

**Passo 3 -- UI: dropdown de associação**
- Na tela de criação/edição de funil de leads, adicionar select "Funil de Tráfego associado"
- Listar funis da tabela `funnels` como opções
- Salvar o `traffic_funnel_id` selecionado

**Passo 4 -- Verificar e completar UI de transition rules e product mappings**
- Confirmar se as telas de configuração de regras de transição e mapeamento de produtos já estão acessíveis na UI do funil de leads
- Se não estiverem, expor na interface

### Resultado
O usuário poderá associar um funil de tráfego a um funil de leads, ver dados de receita no contexto do CRM, e configurar todo o pipeline (etapas, transições, produtos, automações) por uma interface unificada.

