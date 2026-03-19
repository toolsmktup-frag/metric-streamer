

## Redistribuição de Leads entre Vendedores

### O que será construído

Um botão "Redistribuir Leads" na aba **Configuração** do funil (FunnelConfigTab) que abre um dialog permitindo:

1. **Escolher o escopo**: "Leads sem vendedor", "Leads com vendedor", ou "Todos os leads"
2. **Filtrar por etapa** (opcional): selecionar uma ou mais etapas específicas do funil
3. **Ver os vendedores elegíveis**: lista automática dos vendedores que têm acesso ao funil (via `lead_funnel_access`) com checkbox para incluir/excluir
4. **Distribuição round-robin igualitária**: ao clicar "Redistribuir", o sistema distribui os leads sequencialmente entre os vendedores selecionados (ex: 3 vendedores com 100 leads = 34, 33, 33)
5. **Preview antes de confirmar**: mostra quantos leads cada vendedor receberá antes de executar

### Arquivos a criar/editar

**Novo: `src/components/lead-funnels/RedistributeLeadsDialog.tsx`**
- Dialog com as opções de escopo (sem vendedor / com vendedor / todos)
- Seletor de etapas (multi-select com checkboxes)
- Lista de vendedores com acesso ao funil (checkboxes)
- Preview da distribuição (ex: "João: 34 leads, Maria: 33 leads")
- Botão de confirmar que executa updates em batch via `supabase.from('leads').update({ assigned_to })`

**Novo: `src/hooks/useRedistributeLeads.ts`**
- Mutation que recebe `{ funnelId, scope, stageIds[], sellerIds[] }`
- Busca lead_ids das posições filtradas
- Distribui round-robin e faz batch update do `assigned_to`
- Invalida queries relevantes (`leads-by-funnel`, `all-leads`)

**Editar: `src/components/lead-funnels/FunnelConfigTab.tsx`**
- Adicionar botão "Redistribuir Leads" na seção de configuração (junto ao botão de bulk move)

**Editar: `src/pages/LeadFunnelDetail.tsx`**
- Passar `positions` e dados de acesso ao FunnelConfigTab para alimentar o dialog

### Lógica de distribuição

```text
Leads filtrados: [L1, L2, L3, L4, L5, L6, L7]
Vendedores selecionados: [V1, V2, V3]

Resultado:
  V1 ← L1, L4, L7  (3 leads)
  V2 ← L2, L5      (2 leads)
  V3 ← L3, L6      (2 leads)
```

A ordem dos leads segue a entrada no funil (entered_at) para distribuição justa.

### Fluxo do usuário

1. Admin abre aba "Configuração" do funil
2. Clica "Redistribuir Leads"
3. Seleciona escopo (sem vendedor / com vendedor / todos)
4. Opcionalmente filtra por etapa(s)
5. Vê lista de vendedores com acesso ao funil, marca quais participam
6. Vê preview: "34 leads → João, 33 → Maria, 33 → Pedro"
7. Confirma → toast de sucesso → Kanban atualizado

