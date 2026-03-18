

## Chat Unificado — Histórico Cross-Instância + Seletor de Resposta

Faz total sentido: suporte, vendedores e gestores conversam com o mesmo número por instâncias diferentes, e todos precisam ver o histórico completo.

### O que será feito

1. **Edge Function `whatsapp-chats` — suporte a `instance_id=all`**
   - Na action `messages`: quando `instance_id=all`, buscar mensagens por `organization_id + phone` sem filtro de instância, mescladas cronologicamente
   - Na action `list_chats`: quando `instance_id=all`, buscar todas as mensagens da org, agrupar por phone, pegar a mais recente como `last_message`
   - Cada mensagem já tem `instance_id` no banco, então o frontend sabe de qual instância veio

2. **Hook `useWhatsAppMessages` — aceitar `instance_id=all`**
   - Quando `effectiveInstanceId === 'all'`, passar `instance_id=all` para a edge function
   - Realtime subscription: escutar por `phone` sem filtro de instância

3. **`ChatThread.tsx` — badge de instância nas mensagens outbound**
   - Quando há múltiplas instâncias, mostrar um badge pequeno (nome/cor da instância) nas bolhas outbound
   - Receber `instances` como prop para mapear `instance_id` → nome/cor

4. **`ChatInput.tsx` — seletor de instância para resposta**
   - Adicionar um dropdown compacto antes do campo de texto mostrando por qual instância responder
   - Default: instância que enviou/recebeu a mensagem mais recente daquele número
   - Receber `instances` como prop + `selectedReplyInstanceId` / `onReplyInstanceChange`

5. **`WhatsAppChat.tsx` — orquestração**
   - Quando no modo "all" e um phone é selecionado, passar `instance_id=all` para buscar mensagens
   - Determinar a instância padrão de resposta (mais recente) e gerenciar o estado do seletor
   - Passar `instances` para ChatThread e ChatInput
   - Deep-link do funil: abrir em modo unificado por padrão

### Arquivos a editar
1. `supabase/functions/whatsapp-chats/index.ts`
2. `src/hooks/useWhatsApp.ts`
3. `src/components/whatsapp/ChatThread.tsx`
4. `src/components/whatsapp/ChatInput.tsx`
5. `src/pages/WhatsAppChat.tsx`

