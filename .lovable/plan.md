

## Optimistic Send (Mensagem Instantânea)

### O que muda
Quando o usuário pressiona Enter, a mensagem aparece **imediatamente** no chat com um ícone de relógio (⏱). Após a confirmação do servidor, o status muda para o tiquezinho (✓). Se falhar, mostra ✗ com opção de reenviar.

### Implementação

**1. ChatInput.tsx — Envio otimista**
- Ao clicar em enviar, **imediatamente** limpar o input e criar uma mensagem temporária com `status: 'pending'` e um `id` temporário (UUID local)
- Adicionar essa mensagem ao estado via um callback `onOptimisticSend` passado pelo pai
- Disparar o `sendWhatsAppMessage` em background (sem `setSending(true)` — o input fica livre)
- Em caso de erro, atualizar o status da mensagem temporária para `'failed'`
- Remover o `disabled={sending}` do input para não travar

**2. WhatsAppChat.tsx (página pai) — Gerenciar mensagens otimistas**
- Criar estado `optimisticMessages` para armazenar mensagens temporárias pendentes
- Passar `onOptimisticSend` e `onOptimisticUpdate` como props ao `ChatInput`
- Combinar `messages` (do hook) + `optimisticMessages` no array passado ao `ChatThread`
- Quando a mensagem real chega via Realtime (mesmo `body`+`phone`+`direction`), remover a otimista correspondente

**3. ChatThread.tsx — Já funciona**
- O `StatusIcon` já renderiza `Clock` para `pending`, `Check` para `sent`, `Ban` para `failed` — nenhuma mudança necessária

### Fluxo
```text
Enter → msg aparece (⏱ pending) → input limpo → API dispara em background
  ├─ sucesso → Realtime insere msg real → remove otimista
  └─ falha → status muda para 'failed' (✗) + toast de erro
```

