# Filtros de Coluna no Kanban do Funil

Adicionar uma barra de filtros no Kanban (logo abaixo da busca atual) que afeta a renderização dos cards em todas as colunas simultaneamente, com salvar/compartilhar visões.

## UX

**Local:** entre a busca "Buscar por nome..." e o botão "Recontato".

**Botão:** `🎚️ Filtros` (com badge mostrando quantos filtros ativos). Abre um Popover.

**Dentro do popover — 2 grupos:**

### 1. Produto comprado
- Input multi-select com lista de produtos (vinda de `customer_purchases` + mapeamentos do funil via `useDistinctProductNames` / `useLeadProductMappings`).
- Toggle por produto: `Tem` / `Não tem` / `Ignorar`.
- Combinação entre produtos = AND (ex: "tem Tinturas E não tem Chás").

### 2. Status financeiro
- Checkboxes:
  - [ ] Tem pendência (PIX/Boleto em aberto)
  - [ ] Sem pendência
  - [ ] Só "recuperar" (abandonado/recusado/reembolsado)
  - [ ] Aprovado (compra confirmada)

**Chips ativos:** abaixo da busca, mostrando filtros aplicados com `x` pra remover individual + botão "Limpar tudo".

### Visões salvas (compartilhadas no time)
- Dropdown ao lado do botão Filtros: `📁 Visões ▾`
- Lista visões do funil: "Compradores Tinturas sem Chás", "PIX pendente últimos 7d" etc.
- Ações: `Aplicar`, `Salvar atual como...`, `Atualizar`, `Excluir`.
- Toda visão fica visível pra todos com acesso ao funil.

### Comportamento nos totais
- Header da coluna passa de `204` para `47 de 204`.
- Valores em R$ da coluna recalculados só com os cards visíveis.
- Header geral "786 leads / R$ 14.626" também recalcula.

## Dados (Lovable Cloud)

### Nova tabela: `kanban_saved_views`
```
id              uuid pk
funnel_id       uuid fk lead_funnels
name            text
filters         jsonb         -- { products: [{name, mode}], financial: [...] }
created_by      uuid fk auth.users
org_id          uuid          -- pra RLS por organização
created_at      timestamptz
updated_at      timestamptz
```
- RLS: SELECT/INSERT/UPDATE/DELETE para membros com acesso ao funil (reaproveita `has_funnel_access`).
- GRANT pra `authenticated` + `service_role`.

### Sem mudança em outras tabelas
- Filtros aplicados no client em cima dos hooks já existentes:
  - `useLeadsByFunnel` (cards do funil)
  - `useBulkLeadPurchases` / `useBulkLeadPurchaseProducts` (produtos comprados — já bulk fetch)
  - `lead_events` + `metadata` (status financeiro pendente)

## Implementação (frontend)

### Novos arquivos
- `src/components/kanban/KanbanFilters.tsx` — popover com os 2 grupos.
- `src/components/kanban/KanbanFilterChips.tsx` — chips ativos.
- `src/components/kanban/KanbanSavedViews.tsx` — dropdown de visões.
- `src/hooks/useKanbanFilters.ts` — estado dos filtros (Zustand ou contexto local) + função `applyFilters(leads, purchasesMap)` pura.
- `src/hooks/useKanbanSavedViews.ts` — CRUD da tabela `kanban_saved_views`.

### Tipo dos filtros
```ts
type KanbanFilters = {
  products: { name: string; mode: 'has' | 'not_has' }[];
  financial: ('has_pending' | 'no_pending' | 'recover' | 'approved')[];
};
```

### Onde aplicar
- Página do Kanban do funil (provavelmente `src/components/lead-funnels/FunnelKanbanBoard.tsx` — verificar no build).
- Aplicar `applyFilters` antes de agrupar leads por `stage_id`.
- Recalcular totais da coluna a partir do array filtrado.

### Performance
- Produtos por lead já vêm via `useBulkLeadPurchases` (cache 5min) — sem novas queries.
- Filtro 100% no client (operação O(n) sobre ~1k leads, instantâneo).
- Visões salvas: 1 fetch ao abrir o funil + invalidação no save.

## Migration SQL

```sql
CREATE TABLE public.kanban_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.lead_funnels(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_kanban_saved_views_funnel ON public.kanban_saved_views(funnel_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_saved_views TO authenticated;
GRANT ALL ON public.kanban_saved_views TO service_role;

ALTER TABLE public.kanban_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_funnel_access_select"
  ON public.kanban_saved_views FOR SELECT TO authenticated
  USING (public.has_funnel_access(auth.uid(), funnel_id));

CREATE POLICY "members_funnel_access_write"
  ON public.kanban_saved_views FOR ALL TO authenticated
  USING (public.has_funnel_access(auth.uid(), funnel_id))
  WITH CHECK (public.has_funnel_access(auth.uid(), funnel_id));
```

## Fora do escopo (v2 futuro)
- Período de compra, UTM, Tags, Recontato, Vendedor — adicionar depois.
- Filtros server-side (só se passar de ~5k leads por funil).
- Compartilhar visão por link.
