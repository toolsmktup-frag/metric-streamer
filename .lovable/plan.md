
Objetivo: corrigir o funil “Guia de Tinturas” para que o faturamento apareça no dashboard e entender por que, mesmo após os SQLs, o valor continuou zerado.

1. Diagnóstico já confirmado
- O vínculo do webhook_token com o funil está correto.
- As transações já foram atribuídas ao funnel_id correto.
- O problema atual não é mais “falta de vínculo”.
- Pela sua própria query, o banco mostra:
  - `COUNT(*) = 7`
  - `SUM(paid_amount) = 0`
- Ou seja: o dashboard está lendo o funil certo, mas os registros salvos para esse funil vieram com `paid_amount = 0`, então o faturamento fica zerado.
- A screenshot também mostra outro sintoma do mesmo problema: “Vendas por Produto” aparece como `Sem nome`, então parte dos payloads também está entrando sem `product_name`.

2. O que isso indica
Há forte evidência de problema na ingestão do webhook da Ticto, não no dashboard:
- o frontend soma `revenue` normalmente a partir de `v_all_sales`
- a view `v_all_sales` converte `paid_amount / 100`
- se `paid_amount` está 0 no banco, a receita sempre será 0 na interface

3. O que eu implementaria
A. Fazer um diagnóstico definitivo dos payloads gravados
- Ler `raw_payload` das linhas do funil Guia de Tinturas