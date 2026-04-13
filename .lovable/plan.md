

## Adicionar "Tag" como variável de condição nos fluxos

### Situação atual
- O nó de **Tag** (add/remove) já funciona e persiste em `metadata.tags` do lead
- O nó de **Condição** tem as variáveis: Valor, Produto, Plataforma, Nome, Método de Pagamento
- **Falta "Tag"** na lista de variáveis da condição
- No executor, `vars` não inclui as tags do lead — ele só lê `execution.variables` + contato

### Solução

**1. `WzNodeConfigPanel.tsx`** — Adicionar opção "Tag" na lista de variáveis
- Acrescentar `{ value: 'tag', label: 'Tag' }` ao array `conditionVariables`

**2. `wz-executor/index.ts`** — Carregar tags do lead antes de avaliar condição
- Antes do bloco `evaluateCondition`, buscar o lead pelo telefone e extrair `metadata.tags`
- Quando `variable === 'tag'`, tratar de forma especial:
  - Operador `contains` / `equals`: verificar se o array de tags inclui o valor comparado
  - Operador `not_equals`: verificar se NÃO inclui
- Setar `vars.tag` como string concatenada (join com vírgula) para manter compatibilidade com os demais operadores

### Arquivos editados
1. `src/components/wz-automation/WzNodeConfigPanel.tsx` — adicionar "Tag" em `conditionVariables`
2. `supabase/functions/wz-executor/index.ts` — buscar tags do lead e injetar em `vars` antes da avaliação de condição

