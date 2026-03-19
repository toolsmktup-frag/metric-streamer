

## Plano: Aba de Vinculação de Produtos (Mapeamento)

### Problema
Os nomes dos produtos nos metadados dos leads (ex: "6 potes ArticulaBEM - S...") não batem com os `product_name_contains` configurados nos produtos do funil. O recontato não funciona porque o match por substring falha.

### Solução
Adicionar uma nova seção/aba **"Vincular Produtos"** na configuração do funil de leads que:

1. **Lista os produtos reais** encontrados nos metadados dos leads daquele funil (extraídos de `lead.metadata.product_name` via a query de positions)
2. **Permite vincular cada produto real** a um dos `lead_funnel_products` configurados (com recontact_days)
3. **Persiste os mapeamentos** numa nova tabela `lead_product_mappings`
4. **Atualiza o cálculo de recontato** para usar os mapeamentos em vez do match por substring

### Mudanças

**1. Nova tabela `lead_product_mappings`**
- `id`, `lead_funnel_id`, `raw_product_name` (texto exato do metadata), `lead_funnel_product_id` (FK para lead_funnel_products)
- RLS usando `get_user_org_id()` via join com lead_funnels

**2. Novo componente `ProductMappingConfig.tsx`**
- Busca todos os `product_name` distintos dos leads daquele funil
- Exibe cada um com um Select para vincular a um lead_funnel_product configurado
- Botão "Salvar Vínculos"

**3. Novo hook `useLeadProductMappings.ts`**
- Query para buscar/salvar os mapeamentos
- Query para buscar nomes de produtos distintos dos leads do funil

**4. Atualizar `useRecontactDeadlines.ts`**
- Primeiro tenta match via mapeamento explícito (tabela `lead_product_mappings`)
- Fallback para match por substring (`product_name_contains`) para compatibilidade

**5. Integrar na `FunnelConfigTab.tsx`**
- Adicionar o `ProductMappingConfig` abaixo do `FunnelProductsConfig` existente
- Só aparece quando já existem produtos configurados

### SQL Migration

```sql
CREATE TABLE public.lead_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  raw_product_name text NOT NULL,
  lead_funnel_product_id uuid NOT NULL REFERENCES public.lead_funnel_products(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(lead_funnel_id, raw_product_name)
);

ALTER TABLE public.lead_product_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_product_mappings_all" ON public.lead_product_mappings
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lead_funnels lf
    WHERE lf.id = lead_product_mappings.lead_funnel_id
    AND lf.organization_id = public.get_user_org_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.lead_funnels lf
    WHERE lf.id = lead_product_mappings.lead_funnel_id
    AND lf.organization_id = public.get_user_org_id()
  )
);
```

### Fluxo do Usuário
1. Configura produtos com recontact_days na seção "Produtos & Recontato" (já existe)
2. Na seção "Vincular Produtos" abaixo, vê todos os nomes reais dos leads (ex: "Pote Grátis ArticulaBEM...", "6 potes ArticulaBEM - S...")
3. Para cada nome, seleciona qual produto configurado ele representa
4. Salva — o recontato passa a funcionar corretamente

