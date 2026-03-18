

## Status do Plano — O que falta

### ✅ Concluído
1. **classifyTransaction unificada** em `src/lib/classifyTransaction.ts` — todas as importações apontam para lá
2. **Preços hardcoded removidos** de KpiGeral.tsx e FunilKpi.tsx
3. **Bug de data corrigido** em `usePrevPeriodAllSales` (agora usa `setDate(-1)` correto)
4. **Sidebar reorganizado** (Anúncios vs Inteligência)
5. **3 abas extraídas** do EscadaValor: RFMTab, CohortTab, CACTab
6. **Heatmap RFM 5x5** adicionado
7. **Gráfico CAC vs LTV** adicionado
8. **Cohort heatmap melhorado** com gradiente de cores

### ⚠️ Pendente — 3 itens

**1. classifyTransaction ainda usa lógica simplificada (3 tipos), não o catálogo rico (16 produtos)**

O plano dizia: *"A unificação deve usar `classifyProduct()` de `useCustomerJourney.ts` como fonte única"*. Mas `classifyTransaction()` ainda classifica apenas em `principal/bump1/upsell1/other` com 3 regras hardcoded, enquanto `classifyProduct()` tem 16+ produtos com patterns ricos. Para o contexto de funil (KPI Geral, Resumo), a lógica simplificada faz sentido — são 3 posições de funil. Porém, `classifyTransaction` deveria delegar para `classifyProduct` internamente para aproveitar os patterns ricos e evitar falsos positivos.

**Ação**: Refatorar `classifyTransaction` para usar `classifyProduct()` internamente e mapear o resultado para `FunnelPosition`.

**2. 5 abas ainda inline no EscadaValor.tsx (336 linhas)**

Escada, Cross-sell, Jornadas, Perfis e LTV continuam dentro do arquivo principal. A extração ficou pela metade.

**Ação**: Extrair para `EscadaTab.tsx`, `CrossSellTab.tsx`, `JornadasTab.tsx`, `PerfisTab.tsx`, `LTVTab.tsx` em `src/components/intelligence/`.

**3. KpiGeral.tsx continua com 765 linhas**

O plano mencionava que era candidato para extração de componentes, mas não foi tocado (além da remoção de preços hardcoded).

**Ação**: Extrair seções do KpiGeral em sub-componentes (tabela diária, cards de resumo, seção de projeção).

---

### Plano de Implementação

1. **Refatorar `classifyTransaction`** para usar `classifyProduct()` como base, mapeando `front → principal`, `guia_chas → bump1`, `mestre_tinturas → upsell1`, demais → `other`
2. **Extrair 5 abas restantes** do EscadaValor em componentes separados (EscadaValor ficaria com ~60 linhas)
3. **Refatorar KpiGeral.tsx** em sub-componentes menores

