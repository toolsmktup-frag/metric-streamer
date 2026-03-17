

## Diagnóstico

O problema é claro: o **gateway do Supabase** continua rejeitando as requisições com `{"code":401,"message":"Invalid JWT"}` **antes** do código da função executar. Isso significa que o `verify_jwt = false` do `config.toml` não foi aplicado nas funções que você criou manualmente pelo Dashboard.

O `config.toml` só funciona quando as funções são deployadas via CLI ou pelo Lovable — criar manualmente pelo Dashboard ignora esse arquivo.

## Evidência

- A instância está "connected" na tabela do Supabase (sua imagem mostra isso)
- Mas o app mostra "Desconectado" porque a chamada à edge function `whatsapp-instance` (action: status) retorna 401
- Todas as 5 funções retornam o mesmo 401 do gateway

## Solução

Forçar o redeploy das edge functions pelo Lovable, fazendo uma pequena alteração nos arquivos. Quando o Lovable deploya, ele usa o `config.toml` que já tem `verify_jwt = false` para todas as 5 funções.

### O que será feito

1. Adicionar um comentário de versão em cada uma das 5 edge functions (`whatsapp-instance`, `whatsapp-chats`, `whatsapp-send`, `whatsapp-presence`, `whatsapp-contact-info`) para forçar o redeploy pelo pipeline do Lovable
2. O `config.toml` já está correto com `verify_jwt = false` — o deploy vai aplicar essa configuração automaticamente

### Resultado esperado

- O gateway para de rejeitar as requisições com 401
- O app consegue chamar `whatsapp-instance` (action: status) e mostra o status real "Conectado"
- A lista de chats carrega normalmente

