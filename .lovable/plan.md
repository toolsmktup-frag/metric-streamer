

## Correção de 2 bugs: página caindo + mensagens duplicadas

### Bug 1: Página cai para Dani (e possivelmente outros vendedores)

**Causa**: Na screenshot da Dani, a página cai quando ela clica em opções do menu lateral. Isso provavelmente é causado pela query do `useTeamMembers` falhando quando a coluna `avatar_url` não existe no banco — o erro propaga para componentes que usam esse hook (como `LeadCard` via `LeadAssignSelect`). Qualquer página que renderiza cards de leads quebra.

**Correção**: Já foi feito o fallback no `useTeamMembers`, mas o SQL da migration ainda não foi rodado. No entanto, o fallback pode não estar funcionando corretamente porque o Supabase pode retornar erro de coluna inexistente de forma diferente. Vamos melhorar o tratamento de erro.

Além disso, o `useWhatsAppInstances` (dentro de `useWhatsApp.ts`) tem um risco de loop: o efeito de validação de status chama `setInstances` que pode re-triggar o efeito. Vamos estabilizar com um ref.

**Arquivos**:
- `src/hooks/useTeamMembers.ts` — melhorar fallback de avatar_url
- `src/hooks/useWhatsApp.ts` — estabilizar validação de status com ref para evitar loops

### Bug 2: Mensagens duplicadas ao enviar

**Causa**: Quando o usuário envia uma mensagem:
1. Msg otimista é adicionada a `optimisticMessages`
2. O `whatsapp-send` salva no banco
3. O Realtime INSERT dispara e adiciona a mesma msg ao array `messages`
4. O `mergedMessages` tenta filtrar duplicatas comparando `body + phone + tempo < 30s`

O problema: para mensagens de **mídia** (imagens, áudio), o `body` pode ser vazio em ambos, mas o `message_type` do otimista é `'text'` (pois é setado antes do upload) enquanto o real é `'image'`. A comparação de `body === body` (ambos null/vazio) **deveria** funcionar, mas o check `real.body === opt.body` falha quando um é `null` e outro é `''`.

**Correção**: Melhorar a deduplicação no `mergedMessages`:
- Normalizar body para comparação (`null` → `''`)
- Também limpar otimistas antigos (>60s) no callback do send, não só no interval

**Arquivo**: `src/pages/WhatsAppChat.tsx` — melhorar lógica de `mergedMessages`

### Resumo das mudanças

| Arquivo | Mudança |
|---|---|
| `src/hooks/useWhatsApp.ts` | Usar ref para evitar loop na validação de status |
| `src/hooks/useTeamMembers.ts` | Melhorar fallback quando avatar_url não existe |
| `src/pages/WhatsAppChat.tsx` | Melhorar deduplicação de mensagens otimistas |

### SQL necessário no Supabase

Nenhum novo SQL. Mas o SQL pendente da sessão anterior **precisa ser executado**:
```sql
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS avatar_url text;
```

Sem isso, o fallback do `useTeamMembers` continuará ativo e pode causar lentidão.

