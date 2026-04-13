

## Melhorar a listagem de vinculação de produtos

### Problema atual
A lista mostra todos os 51 produtos encontrados nos eventos dos leads, sem distinção. Fica difícil encontrar os que precisam de atenção (não vinculados) ou os que já existem em outros funis.

### Solução
Reorganizar a UI em seções com destaque visual, e adicionar um hook para buscar mapeamentos de **outros funis**.

### Alterações

**1. Novo hook `useAllLeadProductMappings`** (em `useLeadProductMappings.ts`)
- Busca todos os registros de `lead_product_mappings` (sem filtro de funnel) + join em `lead_funnel_products(display_name, product_name_contains)` e `lead_funnels(name)`
- Retorna um mapa: `raw_product_name → { funnel_name, product_display_name }[]`
- Permite saber se "3 potes ArticulaBEM - Soulnaturi (VSL)" já está vinculado em outro funil

**2. Refatorar `ProductMappingConfig.tsx`**
- Dividir a lista em 2 seções colapsáveis:
  - **"Sem vínculo"** (destaque amarelo/amber) — produtos não mapeados neste funil. Mostrados abertos por padrão
  - **"Vinculados"** (destaque verde) — produtos já mapeados. Colapsado por padrão
- Para cada produto, se ele existir em mapeamento de outro funil, mostrar um badge discreto: "Também em: [Nome do Funil]"
- Manter o seletor e o botão Salvar como estão
- Contador no header de cada seção: "12 sem vínculo", "7 vinculados"

**3. Passar dados do novo hook** (em `FunnelConfigTab.tsx`)
- Chamar `useAllLeadProductMappings()` e passar para `ProductMappingConfig`

### Arquivos editados
1. `src/hooks/useLeadProductMappings.ts` — novo hook `useAllLeadProductMappings`
2. `src/components/lead-funnels/ProductMappingConfig.tsx` — seções colapsáveis + badge de outros funis
3. `src/components/lead-funnels/FunnelConfigTab.tsx` — passar prop extra

