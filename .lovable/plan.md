

## Diagnóstico

A RPC `ensure_lead_for_phone` que mandei rodar tenta `INSERT ... source = 'whatsapp_chat'`, mas a tabela `public.leads` não tem essa coluna (confirmado em `webhook-lead/index.ts` que só insere `organization_id`, `phone`, `email`, `name`, `utm_*`, `metadata`). Resultado: erro `42703`, lead nunca é criado, painel mostra "Lead indisponível" / "Não foi possível preparar o lead deste contato".

Outro problema secundário: a RPC olha `public.user_roles`, mas o app usa `public.user_profiles.role` (visto em `useCurrentUserRole.ts`). Então mesmo se a RPC rodasse, o vendedor não recebia `assigned_to` e ficava travado em "Lead não atribuído a você".

## Correção

**1. Recriar a RPC `ensure_lead_for_phone` (SQL)**
- Remover `source` do INSERT.
- Trocar lookup de role para `public.user_profiles.role` (com fallback p/ `user_roles` se existir).
- Guardar `'whatsapp_chat'` dentro de `metadata.source` (jsonb), que existe.
- Manter: variações de telefone, atribuição automática a vendedor, evento `criado`.

**2. Mostrar o erro real no painel**
- `useEnsureLead`: expor `error` e fazer `toast.error` quando RPC falhar.
- `ContactPanel`: se `ensureLead.isError`, mostrar mensagem real (não genérica) + botão "Tentar de novo" que reseta `ensuredFor` e re-dispara.

**3. Passar nome certo do contato (não o atendente)**
- Em `WhatsAppChat.tsx`, ao montar `ContactPanel`, usar `chat.contact_name` do payload do chat (ex.: `payload_raw.chat.name` / `wa_name`) em vez de `sender_name` (que vem como "Equipe Matheus Colombo" nas mensagens outbound).

## Arquivos
- `docs/sql/ensure-lead-and-tags.sql` — RPC corrigida (sem `source`, com `user_profiles`)
- `src/hooks/useEnsureLead.ts` — toast de erro + retornar `error`
- `src/components/whatsapp/ContactPanel.tsx` — mensagem real + retry
- `src/pages/WhatsAppChat.tsx` — passar `contact_name` correto

## Validação
Abrir um chat sem lead (ex.: 554184465322 do print), confirmar que:
- Painel cria o lead automaticamente
- Tags e funil aparecem editáveis
- Nome salvo é do contato, não "Equipe Matheus Colombo"
- Se a RPC falhar, aparece o erro real (não "indisponível" mudo)

