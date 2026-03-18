

## Revisão do Projeto: Bugs, Inconsistências e Melhorias

Analisei o projeto inteiro. Aqui está o diagnóstico dividido em **bugs reais**, **riscos de dados** e **melhorias de visualização** para a seção de Análises.

---

### 🐛 Bugs e Inconsistências Encontrados

**1. Duplicação da função `classifyTransaction` (3 cópias diferentes)**
- `src/hooks/useTictoData.ts` — classifica como `principal/bump1/upsell1` baseado em "tinturas"/"chás"/"mestre das tinturas"
- `src/hooks/useAllSales.ts` — cópia idêntica chamada `classifySale`
- `src/pages/KpiGeral.tsx` — outra cópia idêntica
- **Risco**: Se alguém atualizar uma e esquecer as outras, os dados ficam inconsistentes entre páginas. Já que os produtos mudaram (agora são ~16 produtos em `useCustomerJourney.ts`), essas 3 funções legadas estão **classificando incorretamente** muitos produtos como "other".

**2. Resumo.tsx usa `paid_amount` dividido por 100, mas `useAllSales` já retorna `revenue` em reais**
- Linha 81 do Resumo: `allSales.filter(t => t.status === 'authorized' && t.purchased_at?.startsWith(d.date))` — busca da `v_all_sales` que já normaliza revenue
- Mas na Vendas.tsx (linha 49): `t.paid_amount / 100` — acessa `ticto_transactions` direto onde `paid_amount` está em centavos
- **Inconsistência**: Se alguma view/tabela muda a unidade, o cálculo quebra silenciosamente

**3. KpiGeral.tsx hardcoda preços e nomes de produtos**
- Linhas 15-19: `PRODUCTS = { principal: { price: 43.70 }, bump1: { price: 25.68 }, upsell1: { price: 186.37 } }`
- Esses preços são fixos no código. Se o preço mudar na plataforma, os cálculos de projeção ficam errados
- Conflita com a classificação mais rica de `useCustomerJourney.ts` que tem 16+ produtos

**4. `useMetaKPISummary` retorna `sales: 0` e `revenue: 0` hardcoded**
- `aggregateInsights()` (linha 70 de useMetaData.ts): `const sales = 0; // Sales come from Ticto webhook`
- Depois no Resumo.tsx o `kpiSummary` é **sobrescrito** com dados do Ticto, mas o campo `cpa: agg.sales > 0 ? totalSpend / agg.sales : 0` sempre retorna 0 do Meta
- Funciona porque o Resumo substitui, mas qualquer nova tela que use `useMetaKPISummary` direto vai mostrar CPA = 0

**5. `usePrevPeriodAllSales` pode calcular período anterior incorreto**
- Linha 149: `const prevEnd = new Date(dateRange.start.getTime() - 1)` — subtrai 1 **milissegundo**, não 1 dia
- Resultado: prevEnd pode ser 23:59:59.999 do dia anterior, o que é correto, mas `toLocalDate()` vai converter pra data anterior. Funciona por acidente.

**6. Seção "Análises" no menu lateral mistura páginas de tipos diferentes**
- Vendas, Demográficos, Geográfico, Criativos, Dispositivos = dados de anúncios
- Inteligência de Cliente (EscadaValor) = análise de clientes (RFM, Cohort, CAC, LTV)
- Ecommerce = estoque de produtos físicos
- Estão todas sob "Análises" sem separação lógica

---

### 📊 Melhorias para a Tela de Análises (Inteligência de Cliente)

A página `EscadaValor.tsx` tem 1169 linhas com 8 abas (RFM, Cohort, CAC, Escada, Cross-sell, Jornadas, Perfis, LTV) — tudo num arquivo só. Está funcional mas pode melhorar bastante visualmente:

**1. Separar em sub-páginas ou componentes menores**
- Cada aba é uma mini-página completa. Extrair para componentes separados melhora manutenção e performance (lazy loading)

**2. Melhorar visualizações do RFM**
- Adicionar um **treemap ou bubble chart** mostrando segmentos por tamanho (% da base) e cor (receita)
- Adicionar **matrix/heatmap RFM 5x5** clássico (R no eixo Y, F+M no eixo X)

**3. Cohort: melhorar o heatmap**
- Usar cores graduais (verde mais intenso = maior LTV) em vez de tabela plana
- Adicionar tooltip com valores absolutos e variação

**4. CAC vs LTV: gráfico comparativo**
- Adicionar um **gráfico de barras lado a lado** (CAC vs LTV por produto) com linha de break-even
- Curva de payback visual mostrando quando cada produto "se paga"

**5. Escada de Valor: visualização de fluxo**
- Usar um **Sankey diagram** ou **flow chart** mostrando a migração entre produtos (Front → Bump → Upsell → Backend)

---

### 🔧 Plano de Implementação (Prioridade)

**Fase 1 — Corrigir bugs (segurança de dados)**
1. Unificar `classifyTransaction` / `classifySale` numa única função reutilizável, usando o catálogo de `useCustomerJourney.ts`
2. Remover hardcoding de preços em `KpiGeral.tsx`
3. Garantir consistência de unidades (centavos vs reais) em todas as páginas

**Fase 2 — Reorganizar o menu**
4. Separar "Análises" em sub-seções no sidebar: "Anúncios" (Demo, Geo, Dispositivos, Criativos) e "Inteligência" (RFM, Cohort, CAC, LTV)

**Fase 3 — Melhorar visualizações**
5. Extrair abas de EscadaValor em componentes separados
6. Adicionar heatmap RFM 5x5, gráfico CAC vs LTV, e melhorar o cohort heatmap

---

### Detalhes Técnicos

- Classificação atual simplificada (3 tipos) diverge da classificação rica (16 produtos). A unificação deve usar `classifyProduct()` de `useCustomerJourney.ts` como fonte única
- `EscadaValor.tsx` com 1169 linhas é o arquivo mais crítico para refatorar — cada aba pode virar `src/components/intelligence/RFMTab.tsx`, `CohortTab.tsx`, etc.
- O `KpiGeral.tsx` (776 linhas) também é candidato para extração de componentes

