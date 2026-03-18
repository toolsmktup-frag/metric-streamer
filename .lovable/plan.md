

## Correção de bugs no envio otimista

### Bug encontrado: mensagens otimistas vazam entre chats

Quando o usuário troca de conversa (`selectedPhone` muda), as mensagens otimistas do chat anterior continuam no estado `optimisticMessages`. Como o `mergedMessages` filtra por `opt.phone === real.phone`, elas nao aparecem visualmente no chat errado -- porem elas se acumulam na memoria indefinidamente e nunca sao limpas se a mensagem real nao chegar enquanto o chat esta aberto.

### Correções

**1. WhatsAppChat.tsx -- Limpar otimistas ao trocar de chat**
- Adicionar um `useEffect` que limpa `optimisticMessages` quando `selectedPhone` muda. Isso evita acumulo de lixo e garante estado limpo.

**2. WhatsAppChat.tsx -- Auto-limpar otimistas antigas (failsafe)**
- Adicionar um `useEffect` com timer de 60s que remove qualquer mensagem otimista com mais de 60 segundos. Isso cobre o caso onde o Realtime falha e a mensagem fica "presa" como pending para sempre.

**3. ChatInput.tsx -- Prevenir duplo-envio**
- Adicionar um `ref` de `isSending` para prevenir que o usuario clique Enter duas vezes rapido e dispare dois envios identicos antes do `setText('')` tomar efeito.

### Arquivos alterados
- `src/pages/WhatsAppChat.tsx` -- adicionar 2 useEffects (limpeza por troca de chat + failsafe de timeout)
- `src/components/whatsapp/ChatInput.tsx` -- adicionar guard contra duplo-envio

