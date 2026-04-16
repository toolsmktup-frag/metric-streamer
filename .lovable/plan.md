

## Plano

### Parte 1 — Corrigir badge "Instância" genérico no modo "Todas as instâncias"

**Causa**: `useWhatsAppMultiChats` recebe só as instâncias visíveis ao usuário (filtradas por `whatsapp_instance_access`). Mas a edge function retorna chats de instâncias da org inteira. Quando o `instance_id` do chat não bate com nada no array, cai no fallback `'Instância'`.

Pior: o backend já filtra os chats por permissão do vendedor, mas mesmo pro admin/gestor, a lista de `instances` recebida pode estar com nomes desatualizados ou faltando alguma instância recém-criada que ainda não foi recarregada.

**Correção em `src/hooks/useWhatsAppMultiChat.ts`**:
- Buscar uma vez (e cachear via state) **todas** as instâncias da org direto da tabela `whatsapp_instances` só para montar o mapa `instance_id → { name, color }`
- Usar essa lista global no `instanceMeta`, ignorando o array `instances` filtrado
- Manter o array `instances` filtrado só para definir as cores estáveis (ordem por `created_at`)

Resultado: o badge mostra o nome real da instância (`gabi-01--`, `dani-02--`, etc.) ou o nickname configurado, nunca mais o fallback genérico.

### Parte 2 — Persistir mídia no Supabase Storage (resolver 404 da UAZAPI)

**Causa**: UAZAPI expira mídia depois de alguns dias. Quando o usuário tenta abrir áudio/imagem antiga, o `whatsapp-media` retorna 404.

**Correção em duas frentes**:

1. **Bucket de Storage** (migration):
   - Criar bucket `whatsapp-media` (privado)
   - Policy permitindo leitura para usuários autenticados da org dona do arquivo (via path `{org_id}/{instance_id}/{message_id}.{ext}`)

2. **Webhook `uazapi-webhook`**:
   - Quando chegar mensagem de mídia (image/audio/video/document/sticker), disparar download imediato via UAZAPI (`/message/download`)
   - Salvar binário no bucket `whatsapp-media` com path determinístico
   - Atualizar `whatsapp_messages.media_url` com a URL signed/pública do Storage
   - Fire-and-forget (não bloquear o webhook se download falhar; deixa o `media_url` original do WhatsApp como fallback)

3. **Edge function `whatsapp-media`**:
   - Antes de chamar UAZAPI, verificar se `media_url` já aponta pro Storage interno → retornar direto
   - Só chamar UAZAPI se ainda não foi persistido
   - Quando conseguir baixar com sucesso, salvar no Storage também (backfill on-demand)

4. **Front (`MediaMessage` / componente que toca áudio/imagem)**:
   - Tratar resposta `{ fallback: true, error: 'MESSAGE_NOT_FOUND' }` mostrando placeholder amigável

### Arquivos tocados

- `src/hooks/useWhatsAppMultiChat.ts` — buscar todas instâncias da org pro badge
- `supabase/migrations/<new>.sql` — bucket `whatsapp-media` + policies
- `supabase/functions/uazapi-webhook/index.ts` — persistir mídia ao receber
- `supabase/functions/whatsapp-media/index.ts` — preferir Storage, fazer backfill
- `src/components/whatsapp/MediaMessage.tsx` (ou equivalente) — placeholder pra mídia indisponível

### Resultado esperado

- Badge no modo "Todas as instâncias" mostra o nome correto de cada instância
- Mídias novas ficam armazenadas pra sempre no nosso Storage
- Mídias antigas que ainda existem na UAZAPI são copiadas pro Storage no primeiro acesso
- Mídias já expiradas mostram placeholder em vez de erro

### O que NÃO entra agora

- Migração retroativa de mídias antigas (vai sendo feita on-demand conforme abrirem)
- Limpeza/expiração automática do bucket (definir depois conforme volume)

