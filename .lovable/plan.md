
Objetivo: criar manualmente no Supabase apenas o que está faltando para o módulo de WhatsApp funcionar, já que no print as funções `whatsapp-*` não existem no projeto publicado.

O que você precisa criar no Supabase Dashboard:

1. `whatsapp-instance`
2. `whatsapp-chats`
3. `whatsapp-send`
4. `whatsapp-presence`
5. `whatsapp-contact-info`

O que cada uma faz:
- `whatsapp-instance`: essencial para gerar QR Code, conectar, desconectar e consultar status da instância.
- `whatsapp-chats`: lista conversas e mensagens.
- `whatsapp-send`: envia, edita e apaga mensagens.
- `whatsapp-presence`: envia presença “digitando”.
- `whatsapp-contact-info`: busca nome/foto do contato.

Mínimo para o QR Code funcionar:
- Se você quer só destravar o botão “Gerar QR Code”, a função crítica é `whatsapp-instance`.
- Para a tela completa de WhatsApp funcionar sem quebrar depois, crie as 5.

Como criar cada uma no Dashboard:
1. Supabase Dashboard → Edge Functions → New Function
2. Nome exato da função:
   - `whatsapp-instance`
   - `whatsapp-chats`
   - `whatsapp-send`
   - `whatsapp-presence`
   - `whatsapp-contact-info`
3. Em cada função, cole o conteúdo do arquivo correspondente do projeto:
   - `supabase/functions/whatsapp-instance/index.ts`
   - `supabase/functions/whatsapp-chats/index.ts`
   - `supabase/functions/whatsapp-send/index.ts`
   - `supabase/functions/whatsapp-presence/index.ts`
   - `supabase/functions/whatsapp-contact-info/index.ts`
4. Deploy da função
5. Depois de criada, abra as configurações da função e deixe `Verify JWT` desativado

Configuração importante para todas:
```text
Verify JWT = OFF
```

Confirmação no código do projeto:
- O frontend chama exatamente essas funções:
  - `whatsapp-instance` via `supabase.functions.invoke(...)`
  - `whatsapp-send` via `supabase.functions.invoke(...)`
  - `whatsapp-presence` via `supabase.functions.invoke(...)`
  - `whatsapp-chats` por URL `/functions/v1/whatsapp-chats?...`
  - `whatsapp-contact-info` por URL `/functions/v1/whatsapp-contact-info?...`

O que não precisa configurar manualmente nessas 5:
- `SUPABASE_URL` e `SUPABASE_ANON_KEY`: o ambiente do Edge Functions já fornece
- `UAZAPI_BASE_URL` e `UAZAPI_TOKEN`: não são usados nessas 5 funções; elas leem `api_url` e `api_token` da tabela `whatsapp_instances`

Ordem recomendada:
1. Criar `whatsapp-instance`
2. Testar gerar QR Code
3. Criar as outras 4
4. Testar tela inteira do WhatsApp

Checklist final de execução:
- [ ] Criar `whatsapp-instance`
- [ ] Colar código de `supabase/functions/whatsapp-instance/index.ts`
- [ ] Deploy
- [ ] Desativar `Verify JWT`
- [ ] Repetir para as outras 4 funções
- [ ] Voltar ao app e testar “Gerar QR Code”

Se aparecer erro mesmo depois disso, a próxima checagem deve ser:
- a linha da instância na tabela `whatsapp_instances` precisa ter `api_url` e `api_token` válidos
- a UAZAPI precisa responder ao endpoint `/instance/connect`

Detalhe técnico:
```text
Frontend -> whatsapp-instance -> UAZAPI /instance/connect
                           -> depois polling em /instance/status
```

Resultado esperado após criar tudo:
- o clique em “Gerar QR Code” deixa de falhar por função inexistente
- a conexão passa a depender apenas da resposta da UAZAPI e dos dados salvos da instância
