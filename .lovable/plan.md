## Problema real

Não precisa rodar nada no Supabase para o último ajuste que fiz, mas ele não resolveu porque a tela ainda pode estar calculando o badge a partir de `lead_events` do lead atual. Esse caminho é frágil: evento sincronizado antigo/fora de ordem ou de outro produto consegue puxar o prazo para `-1074d`.

No caso da Ana, a fonte confiável que aparece no detalhe é a lista de compras do cliente: ArticulaBEM em `19/02/26`, SUPER COMBO em `08/11/24`, Guia em `06/06/23`. Para esse funil, o badge deve usar somente a compra real mais recente que casa com o produto configurado no funil.

## Plano de correção

1. **Parar de depender de `lead_events` para o prazo do card**
   - Criar/ajustar a busca em lote para trazer as compras reais por email/telefone a partir da mesma fonte do detalhe de compras (`customer_purchases` / identidade unificada), não da timeline de eventos.
   - Cada compra terá `{ productName, purchasedAt, status }`.

2. **Calcular recontato por compra casada com o produto do funil**
   - Para cada lead, filtrar só compras aprovadas/autorizadas.
   - Casar o produto comprado com a configuração do funil (`lead_funnel_products` + mapeamentos).
   - Calcular: `data_da_compra_real + recontact_days`.
   - Se houver várias compras que casam, usar a compra/deadline mais recente.

3. **Garantir que ArticulaBEM não use Guia de Tinturas**
   - Compra `Guia de Tinturas` não deve influenciar o badge do funil ArticulaBEM se ela não casa com o produto configurado.
   - Para a Ana, o esperado é usar `Pote Grátis ArticulaBEM - Soulnaturi` de `19/02/26` + `23 dias`.

4. **Remover ruído visual do badge antigo**
   - Manter oculto o badge genérico de “dias desde primeira compra” quando existir recontato configurado, para não confundir com o prazo de reabordagem.

5. **Adicionar logs temporários direcionados para esse caso**
   - Logar no navegador, só em desenvolvimento, qual compra/produto/data venceu o cálculo do recontato.
   - Assim dá para confirmar se a Ana está vindo de `19/02/26` e não de `06/06/23`.

## Sem migration

Não vou pedir para você rodar SQL agora. A correção é no frontend/fonte de dados da consulta. Só precisaria Supabase se descobrirmos que a função RPC atual retorna a primeira compra em vez da última, mas dá para contornar direto pela consulta de compras reais.