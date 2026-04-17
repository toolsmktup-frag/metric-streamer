

## Objetivo
Botão "Inserir venda manualmente" no `/crm-analytics` que registra uma venda PIX direto vinculada a uma vendedora, refletindo automaticamente no painel dela (`/leads/metas`) e nas tabelas/KPIs de CRM Analytics.

## Como vai funcionar (estratégia)
A venda manual vai entrar na tabela `customer_purchases` com:
- `platform = 'manual'`
- `ingestion_type = 'manual'`
- `status = 'authorized'`
- `affiliate_name` = nome da vendedora (assim cai automático no match fuzzy que já existe nos dois lados)
- `affiliate_commission` = valor calculado (revenue × %)
- `gross_amount` / `net_amount` = valor informado

Como `v_all_sales` já faz UNION de `customer_purchases` e os hooks (`useSellerStats`, queries do CrmAnalytics) já filtram por `status='authorized'` e leem `affiliate_name`/`affiliate_commission`, a venda aparece sem mudar nada nas leituras.

## Mudanças

**1. Backend (SQL — uma migration)**
- RPC `insert_manual_sale(p_seller_id uuid, p_product_name text, p_amount numeric, p_commission_pct numeric, p_sale_date timestamptz)` com `SECURITY DEFINER`:
  - Valida org do usuário (admin/gestor only).
  - Pega `full_name` da vendedora pelo `id`.
  - INSERT em `customer_purchases` com os campos acima + `id = gen_random_uuid()`, `unified_customer_id = NULL`, `purchased_at = p_sale_date`, `created_at = now()`, `organization_id`, `ingestion_type='manual'`, `platform='manual'`.
  - Retorna o id criado.
- Garantir que `v_all_sales` cobre `platform = 'manual'` (a view atual filtra `cp.platform != 'ticto'`, então 'manual' já passa — só confirmar).
- GRANT EXECUTE para `authenticated`.

**2. Frontend — novo componente `ManualSaleDialog.tsx`**
- Disparado por botão "Inserir venda manual" no header do `CrmAnalytics.tsx` (ao lado do filtro de período).
- Campos: vendedora (Select com `sellers`), produto (input), valor (R$, mask), comissão % (default 10), data da venda (date picker, default hoje).
- Validação zod: vendedora obrigatória, produto não-vazio (≤200), valor > 0, comissão 0–100, data ≤ hoje.
- Submit chama RPC `insert_manual_sale`.
- Em sucesso: toast, fecha dialog, `queryClient.invalidateQueries` em `['crm-sales']`, `['crm-lead-activities']`, `['seller-stats']`, `['seller-goals-all']`.

**3. Visibilidade**
- Botão visível só para `admin`/`gestor` (usar hook `useCurrentUserRole` já existente).

## Arquivos
- `supabase/migrations/<ts>_insert_manual_sale.sql` — nova RPC
- `src/components/crm/ManualSaleDialog.tsx` — novo
- `src/pages/CrmAnalytics.tsx` — adicionar botão + dialog no header

## Validação após implementar
1. Logar como admin → CRM Analytics → "Inserir venda manual" → escolher vendedora, R$ 500, 10%, hoje.
2. Confirmar linha nova na tabela de vendedoras (sales+1, revenue +500, commission +50).
3. Abrir `/leads/metas` logada como aquela vendedora → ver `monthRevenue` somando os 500 e meta avançando.
4. Tentar como vendedora comum → botão não aparece.

