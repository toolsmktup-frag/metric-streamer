

## Plano: Auto-mover leads vencidos para etapa configurada

### O que muda

Adicionar um campo **"Mover para etapa"** em cada produto configurado na seção "Produtos & Recontato". Quando o recontato vence, o sistema pode mover automaticamente os leads para a etapa selecionada. Um botão **"Atualizar Funil"** dispara a movimentação em lote.

### Mudanças

**1. Coluna `auto_move_stage_id` na tabela `lead_funnel_products`**

```sql
ALTER TABLE public.lead_funnel_products 
ADD COLUMN auto_move_stage_id uuid REFERENCES public.lead_funnel_stages(id) ON DELETE SET NULL;
```

**2. Atualizar `FunnelProductsConfig.tsx`**
- Adicionar um `Select` de etapa antes do botão de lixeira em cada linha de produto
- Placeholder: "Mover p/ etapa (opcional)"
- Receber `stages` como prop para popular o Select

**3. Atualizar `LeadFunnelProduct` interface e hook**
- Adicionar `auto_move_stage_id: string | null` no tipo e no fluxo de save

**4. Botão "Atualizar Funil" na seção de produtos**
- Ao clicar, percorre todos os leads com recontato vencido (`isOverdue`)
- Move cada lead para a `auto_move_stage_id` do produto correspondente via `useMoveLeadStage`
- Exibe toast com quantidade de leads movidos

**5. Integrar no `LeadFunnelDetail.tsx`**
- Passar `stages` para o `FunnelProductsConfig`
- Criar função `handleBulkMoveOverdue` que cruza `recontactMap` com os produtos configurados e move os vencidos

### Fluxo do usuário
1. Na config de produtos, seleciona "Mover para → Para abordar hoje" em cada produto
2. Clica "Salvar Produtos"
3. Clica "Atualizar Funil" → leads com recontato vencido são movidos automaticamente para a etapa escolhida

