

## Diagnóstico

As Edge Functions estão funcionando (todas retornando 200). O problema agora e diferente: **a lista de chats está vazia** porque não existem mensagens na tabela `whatsapp_messages`.

Para mensagens inbound (recebidas) aparecerem na plataforma, a UAZAPI precisa enviar um webhook para a edge function `uazapi-webhook` toda vez que chega uma mensagem. A função já existe e está correta no código.

## O que falta configurar

Você precisa configurar a **URL do webhook na UAZAPI** para cada instância. A URL é:

```
https://emfbocpmphtftqcezaib.supabase.co/functions/v1/uazapi-webhook
```

### Passo a passo

1. Acesse o painel da UAZAPI (tracker1.uazapi.com)
2. Para cada instância (matheus-colombo-teste, soulnaturi), configure o webhook URL acima
3. O evento que deve estar habilitado é `messages.upsert` (mensagens recebidas) e `messages.update` (status de leitura/entrega)
4. Envie uma mensagem de teste para o número conectado (soulnaturi - 554891575679)
5. A mensagem deve aparecer automaticamente na plataforma via Supabase Realtime

### Verificação

Após configurar o webhook na UAZAPI, se ainda não funcionar:
- Verifique nos logs da edge function `uazapi-webhook` no Dashboard do Supabase se o payload está chegando
- A instância `soulnaturi` está connected, então use ela para testar

Nenhuma alteração de código e necessária. O problema e de configuração na UAZAPI.

