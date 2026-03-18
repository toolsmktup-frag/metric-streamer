

## Análise: Export → Import — o que acontece com os dados extras?

### Situação Atual

O **export** gera colunas ricas: `Nome`, `Email`, `Telefone`, `Produto`, `Oferta`, `Valor`, `Status`, `Pagamento`, `Plataforma`, `UTM Source`, etc.

O **import de leads** mapeia apenas: `Nome`, `Email`, `Telefone`, `UTM Source/Medium/Campaign/Content/Term`. **Todo o resto** (Produto, Valor, Status, Plataforma, etc.) vai para o campo `metadata` do lead — ou seja, os dados **são salvos**, mas ficam escondidos e não são usados para nada na interface.

**Resultado:** Hoje, ao importar, você **não consegue diferenciar** quem comprou de quem abandonou o carrinho, qual produto comprou, quanto pagou, etc.

---

### Plano: Tornar os dados de venda visíveis e úteis nos leads

**1. Melhorar o mapeamento de colunas no import** (`ImportLeadsDialog.tsx`)

- Adicionar mapeamentos para as colunas do export: `Produto`, `Valor`, `Status`, `Pagamento`, `Plataforma`, `Oferta` → guardar no `metadata` com chaves padronizadas (`product_name`, `amount`, `status`, `payment_method`, `platform`, `offer_name`)

**2. Mostrar metadata na timeline/detalhe do lead** (`LeadTimeline.tsx`)

- No evento de `import`, já mostra `product_name`, `amount` e `platform` (parcialmente implementado)
- Adicionar exibição de `status` e `payment_method` no evento de import

**3. Roteamento automático por status na importação** (`ImportLeadsDialog.tsx`)

- Adicionar opção "Separar por status" que cria/usa etapas diferentes: leads com status `authorized` vão para uma etapa, `abandoned_cart`/`open` para outra
- Isso permite diferenciar visualmente no funil quem comprou vs quem abandonou

**4. Mostrar produto e valor na listagem de leads** (painel lateral do funil)

- Exibir `metadata.product_name` e `metadata.amount` como badges no card do lead quando disponíveis

---

### Resumo

Sem mudanças, os dados extras ficam guardados mas invisíveis. Com este plano, o import vai:
- Padronizar as chaves de metadata
- Mostrar produto, valor, status nos cards e timeline
- Opcionalmente separar leads por status em etapas diferentes do funil

