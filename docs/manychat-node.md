# Nó "ManyChat" no editor de flows (migração do n8n)

Adiciona um bloco **ManyChat (criar + tag)** ao editor de fluxos (`wz-automation`).
Num único nó, ele **cria ou localiza** o contato no ManyChat pelo telefone do lead e
**aplica uma tag** — que dispara a automação de lá. Substitui o fluxo equivalente do n8n.

## Por que existia o bug no n8n

O ManyChat **não tem upsert**: `createSubscriber` só cria e, quando o número já existe,
retorna erro `wa_id already exists` **sem** devolver o ID. E a busca por telefone
(`findBySystemField?phone`) **não acha** contatos de WhatsApp (o número vive no `wa_id`,
campo diferente do `phone`, que fica vazio sem a permissão de import). Resultado: lead novo
funcionava, lead repetido quebrava.

## Como foi resolvido

Um **custom field espelho** no ManyChat — `wa_busca` (id `14698343`) — guarda o número e é
pesquisável via `findByCustomField`. Toda criação grava o espelho, então re-cadastros passam
a ser localizáveis. Fluxo da função:

```
normaliza telefone → findByCustomField(wa_busca) → achou? usa o id
                                                  → não? createSubscriber → grava wa_busca
→ aplica a tag (addTagByName ou addTag)
```

## Arquitetura

| Camada | Arquivo | Papel |
|---|---|---|
| Edge `manychat-sync` | `supabase/functions/manychat-sync/index.ts` | O cérebro: find-or-create + espelho + tag. Auth via `MANYCHAT_SYNC_SECRET`. |
| Edge `manychat-tags` | `supabase/functions/manychat-tags/index.ts` | Lista as tags da conta p/ o dropdown. |
| Executor | `supabase/functions/wz-executor/index.ts` (branch `manychat`) | Quando o nó roda, chama a `manychat-sync` com telefone/nome/email do lead + a tag. |
| Nó visual | `src/components/wz-automation/nodes/WzManyChatNode.tsx` | O bloco arrastável. |
| Config | `WzNodeConfigPanel.tsx` (`ManyChatConfig`) + `useManyChatTags.ts` | Dropdown com as tags da conta. |
| Sidebar/registro | `WzFlowSidebar.tsx`, `WzFlowCanvasEditor.tsx` | Torna o nó arrastável e registrado. |

## Secrets (já configurados no Supabase)

- `MANYCHAT_API_TOKEN` — token da API do ManyChat.
- `MANYCHAT_WA_FIELD_ID` — `14698343` (id do custom field `wa_busca`).
- `MANYCHAT_SYNC_SECRET` — segredo interno entre `wz-executor` e `manychat-sync`.

## Status

- ✅ **Back no ar e testado** (deploy via `supabase functions deploy`): sync, tags e tag-por-nome validados em produção.
- ⏳ **Front commitado** na branch `claude/manychat-node` (a partir da `main`), **não publicado ainda**
  (precisa do token do Matheus p/ push + merge → Lovable deploya). Build local OK.

### Publicar o front

```bash
cd metric-streamer
git push -u origin claude/manychat-node     # precisa do token do Matheus
# abrir PR e mergear na main → Lovable deploya o site com o nó
```

## Como usar (depois de publicado)

1. Abrir o editor de flows → arrastar **ManyChat (criar + tag)**.
2. Selecionar a **tag** no dropdown (lista vem da conta).
3. Conectar após o gatilho **`signup`** (ou onde fizer sentido). Telefone/nome do lead são usados automaticamente.
4. Para sair do n8n de vez: apontar o formulário/landing para o webhook **`webhook-lead`** do CRM
   (com `event:"signup"`), em vez do webhook do n8n.

## Limitações conhecidas

- **Contatos legados** (criados antes, sem `wa_busca` nem `phone`) não são localizáveis pela API —
  a função responde `409 legacy_unfindable`. Eles se regularizam ao passar pelo fluxo. (Limitação do
  próprio ManyChat: não há endpoint para listar/buscar esses por número.)
- A API do ManyChat **não apaga contato**. Ficou 1 contato de teste "Teste AIOS" (número
  `5544988887777`) que pode ser apagado pela interface do ManyChat.
