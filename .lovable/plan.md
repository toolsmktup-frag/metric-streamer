

## Plano — Editor de Funil + Tags no painel lateral do chat

### Contexto

No `ContactPanel` (painel direito do `/whatsapp`) hoje as seções **FUNIS** e **TAGS** são read-only. O usuário quer:

1. **Funis**: vincular o lead a um funil escolhendo a etapa de destino (não só primeira). Também trocar/desvincular.
2. **Tags**: adicionar/remover tags do lead, com autocomplete sugerindo tags já usadas em outros leads da org, e permitindo criar novas livremente. Idealmente também permitir renomear/excluir tags globalmente, mas isso é gestão pesada — proponho separar (ver abaixo).

### Investigação necessária

Antes de codar preciso confirmar o schema:
- Tabela de tags (provavelmente `lead_tags` ou coluna `tags text[]` no `leads`)
- Tabela de funis/etapas (`funnels`, `funnel_stages`, `lead_stage_positions`)
- Se já existe RPC ou hook pra mover lead entre etapas (provavelmente sim, vi memória `stage-management`)

Vou ler `ContactPanel.tsx` e os hooks relacionados pra reaproveitar lógica existente.

### Implementação proposta

#### 1. Funis (seção FUNIS no painel)

**Quando lead tem funil vinculado:**
- Mostra nome do funil + etapa atual (já existe?)
- Botões: "Trocar etapa" (dropdown de etapas do mesmo funil), "Mover para outro funil", "Desvincular"

**Quando lead não tem funil:**
- Estado vazio: dropdown "Selecionar funil…" + dropdown "Selecionar etapa…" (carrega etapas após escolher funil) + botão "Vincular"

**Backend:**
- Reaproveitar a lógica de upsert em `lead_stage_positions` (já tem hook `useUpsertStages` ou similar pela memória)
- Disparar Realtime pra Kanban refletir

#### 2. Tags (seção TAGS no painel)

**Visual:**
- Chips das tags atuais com X pra remover
- Input com autocomplete: digita → sugere tags da org não-usadas pelo lead → Enter cria/adiciona
- Botão "+ Nova tag"

**Gestão global de tags (renomear/excluir em massa):**
- **Não** colocar no painel lateral (UX ruim, ação destrutiva escondida).
- Proposta: criar uma tela separada em `/leads/configuracoes/tags` ou um modal "Gerenciar tags da organização" acessível via ícone de engrenagem na seção TAGS. Lista todas as tags da org com contagem de uso, permite renomear (atualiza em todos os leads) e excluir (remove de todos).
- **Pra esta entrega**: já incluo o modal de gestão. Se preferir deixar pra depois, só falar.

**Backend:**
- Se for `tags text[]` em `leads`: update direto
- Se for tabela `lead_tags`: insert/delete + tabela `tags` da org pra autocomplete + RPC pra renomear (`UPDATE … WHERE tag = old`)
- Vou descobrir o schema antes de decidir

### Arquivos que devem ser tocados

- `src/components/whatsapp/ContactPanel.tsx` — UI das duas seções
- `src/components/whatsapp/FunnelLinker.tsx` — novo, dropdown funil+etapa
- `src/components/whatsapp/TagsEditor.tsx` — novo, chips+autocomplete
- `src/components/whatsapp/TagsManagerDialog.tsx` — novo, modal de gestão global
- `src/hooks/useLeadFunnel.ts` ou similar — reaproveitar/criar
- `src/hooks/useOrgTags.ts` — novo, lista + renomear + excluir
- Possível migration se faltar tabela/RPC (descubro depois de ver o schema)

### Resultado esperado

- Lead sem funil → vincular escolhendo funil + etapa, direto do chat
- Lead com funil → trocar etapa ou desvincular
- Tags: adicionar (com sugestão) e remover por chip
- Modal "Gerenciar tags" pra renomear/excluir tags da org de forma controlada

### O que NÃO entra agora

- Permissões granulares por vendedor pra editar funil/tags (assumo que quem tem acesso ao chat pode editar)
- Histórico/audit log de mudanças de etapa via painel (se não existir já)

