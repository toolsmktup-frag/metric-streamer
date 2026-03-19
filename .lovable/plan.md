

## Plano: Corrigir perda de vínculos ao salvar produtos

### Causa raiz
`useUpsertLeadFunnelProducts` faz DELETE ALL + INSERT nos produtos. Como `lead_product_mappings.lead_funnel_product_id` tem `ON DELETE CASCADE`, os vínculos são destruídos em cascata a cada save.

### Solução
Mudar a estratégia de save de "delete all + insert" para **upsert real**:
- Produtos com `id` existente → UPDATE
- Produtos novos (sem `id`) → INSERT
- Produtos removidos (IDs que existiam mas não estão mais na lista) → DELETE

Isso preserva os IDs dos produtos existentes e, consequentemente, os vínculos de mapeamento.

### Mudanças

**1. `src/hooks/useLeadFunnelProducts.ts`** — Reescrever `useUpsertLeadFunnelProducts`:
- Receber os produtos com seus `id` opcionais
- Buscar IDs atuais do banco
- DELETE apenas os que foram removidos
- UPDATE os existentes
- INSERT os novos
- Retornar os dados atualizados

**2. `src/components/lead-funnels/FunnelProductsConfig.tsx`** — Passar o `id` dos produtos existentes no `onSave`:
- Atualmente o `handleSave` faz `Omit<..., 'id'>`, precisa incluir o `id` quando existente para que o hook saiba quais são updates

**3. `src/components/lead-funnels/FunnelConfigTab.tsx`** — Ajustar tipo do `onSaveProducts` para aceitar `id` opcional

