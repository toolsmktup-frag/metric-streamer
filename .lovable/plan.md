

# Fix: Status da instância WhatsApp não sincroniza

## Problema raiz

Existem **dois problemas** causando o status incorreto:

1. **Edge function retorna resposta crua da UAZAPI** — a edge function `whatsapp-instance` processa o status corretamente e atualiza o banco, mas retorna o JSON bruto da UAZAPI como resposta ao cliente.

2. **Cliente re-interpreta a resposta crua com lógica diferente** — o hook `useWhatsApp.ts` (linha 89) tenta parsear a resposta bruta da UAZAPI novamente, mas com lógica diferente da edge function, resultando em status errado.

Resultado: o banco é atualizado corretamente para "disconnected", mas o estado local no React continua "connected".

## Solução

### 1. Edge function: retornar status processado junto com a resposta

**`supabase/functions/whatsapp-instance/index.ts`** — no case `status`, após processar, retornar um objeto com o status processado:

```js
result = {
  raw: rawResult,
  processed: { status: newStatus, display_name, profile_pic_url, phone_number }
}
```

### 2. Hook: usar o status processado da edge function

**`src/hooks/useWhatsApp.ts`** — na validação (linhas 87-104), usar `data.processed.status` em vez de re-parsear a resposta bruta. Se falhar a chamada, fazer refetch do banco como fallback.

### 3. Instância nova com status hardcoded

**`src/pages/WhatsAppChat.tsx`** (linha 54) — ao criar instância nova, inserir com `status: 'disconnected'` em vez de `'connected'`, já que não foi validada ainda.

