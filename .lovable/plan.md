

## Plano: Adicionar colunas de métricas de mídia na tabela de campanhas

### Contexto
A tabela `PerformanceTable.tsx` já possui **Conv. Chk.** (conversão de checkout em vendas), mas faltam métricas de custo unitário e eficiência de mídia. Algumas colunas solicitadas já existem parcialmente:

- **Conv. Chk.** → já existe (linha 175), mostra `vendas / initiate_checkout`
- **Vis. Pág.** e **Init. Chk.** → já existem como contagens brutas

### Colunas a adicionar

| Coluna | Fórmula | Posição |
|---|---|---|
| **Custo p/ Chk.** | `spend / initiate_checkout` | Após "Conv. Chk." |
| **Custo p/ Vis. Pág.** | `spend / landing_page_views` | Após "Custo p/ Chk." |
| **CPC** | `spend / link_clicks` | Após "CTR" |
| **CPM** | `(spend / impressions) × 1000` | Após "CPC" |

A coluna **Conv. Chk.** já está presente — nenhuma alteração necessária nela.

### Alterações técnicas

**Arquivo: `src/components/dashboard/PerformanceTable.tsx`**

1. Adicionar 4 novas `ColumnDef` no array `columns` (após as colunas existentes de Conv. Chk. / antes das métricas brutas):
   - `custo_checkout`: `spend / initiate_checkout`
   - `custo_pageview`: `spend / landing_page_views`
   - `cpc`: `spend / link_clicks`
   - `cpm`: `(spend / impressions) * 1000`

2. Atualizar o objeto `totals` para incluir os 4 novos cálculos agregados.

3. Atualizar o `<tfoot>` para renderizar as 4 novas células de totais na posição correta, mantendo o alinhamento com os headers.

Todas as fórmulas usam dados já disponíveis no objeto `Campaign` (spend, link_clicks, impressions, landing_page_views, initiate_checkout) — nenhuma alteração em hooks ou banco de dados é necessária.

