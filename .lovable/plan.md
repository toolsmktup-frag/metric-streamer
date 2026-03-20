

## 3 melhorias no chat WhatsApp

### A) Aumentar campo de mensagem (input expandível)

O input atual usa `<Input>` (single line). Trocar por `<textarea>` auto-expansível que cresce conforme o texto, até um máximo (ex: 6 linhas), permitindo ver mensagens longas antes de enviar.

**Arquivo**: `src/components/whatsapp/ChatInput.tsx`
- Substituir `<Input>` por `<textarea>` com `rows={1}` e auto-resize via `onInput`
- Max height de ~120px (aprox 6 linhas)
- Manter Enter para enviar, Shift+Enter para nova linha

### B) Imagens aparecerem no chat

O código já tem `MediaRenderer` com suporte a imagens (linha 227-233 do ChatThread). O problema é que **imagens enviadas por você** (outbound) ou recebidas podem não ter `media_url` preenchido, ou a URL pode precisar de proxy (como os áudios).

**Arquivo**: `src/components/whatsapp/ChatThread.tsx`
- Na `MediaRenderer`, para imagens com URL encriptada (`.enc` / `mmg.whatsapp.net`), usar o mesmo proxy `whatsapp-media` que já funciona para áudios
- Criar componente `ProxiedImage` que resolve via edge function quando necessário
- Para outbound: garantir que o `media_url` salvo pelo `whatsapp-send` é acessível (geralmente já é uma URL pública do storage)

### C) Vídeos aparecerem no chat

Mesma lógica das imagens — o código já renderiza `<video>` (linha 236-239), mas URLs encriptadas não carregam no browser.

**Arquivo**: `src/components/whatsapp/ChatThread.tsx`
- Criar componente `ProxiedVideo` similar ao `ProxiedImage`
- Para vídeos grandes, mostrar thumbnail + botão play que resolve via proxy sob demanda

### Resumo de mudanças

| Arquivo | Mudança |
|---|---|
| `src/components/whatsapp/ChatInput.tsx` | Trocar Input por textarea auto-expansível |
| `src/components/whatsapp/ChatThread.tsx` | Adicionar ProxiedImage e ProxiedVideo para resolver URLs encriptadas via edge function |

