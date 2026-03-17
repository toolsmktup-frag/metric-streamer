
Problema identificado: hoje o sistema está mostrando o valor salvo no banco, não o status real da UAZAPI.

O que encontrei no código e nos logs:
- As chamadas para `whatsapp-instance` e `whatsapp-chats` estão falhando no navegador com `NetworkError when attempting to fetch resource`.
- Ao mesmo tempo, a leitura direta da tabela `whatsapp_instances` funciona e retorna `status: "connected"`.
- Resultado: como a validação online falha, a UI continua exibindo o status antigo salvo no banco.
- Há também um bug de leitura no front: `InstanceManagement.tsx` consulta `statusData.instance.status`, mas a edge function `whatsapp-instance` retorna `status` no formato `processed.status`. Então mesmo quando a função responder, essa tela pode ignorar o valor correto.
- Em `supabase/config.toml`, a função `whatsapp-instance` nem está listada, o que é forte sinal de configuração/deploy incompleto.

Plano de correção:

1. Corrigir a camada de Edge Functions
- Adicionar `[functions.whatsapp-instance] verify_jwt = false` em `supabase/config.toml`.
- Padronizar os `corsHeaders` com os headers completos recomendados pelo Supabase.
- Garantir que `whatsapp-instance` e `whatsapp-chats` estejam de fato deployadas.
- Se necessário, redeploy das funções WhatsApp já usadas pela tela.

2. Parar de chamar a function por URL manual no frontend
- Substituir os `fetch("https://.../functions/v1/...")` por `supabase.functions.invoke(...)` em:
  - `src/hooks/useWhatsApp.ts`
  - `src/components/whatsapp/InstanceManagement.tsx`
- Isso reduz risco de erro de CORS/gateway e centraliza auth corretamente.

3. Corrigir a leitura do status no frontend
- Em `InstanceManagement.tsx`, usar `data.processed.status`, `data.processed.display_name`, `data.processed.profile_pic_url` e `data.processed.phone_number`.
- Ajustar também o polling de conexão para ler o formato novo (`processed`) em vez de `data.instance`.
- Manter um shape consistente no estado local para não depender do JSON cru da UAZAPI.

4. Evitar que a UI “minta” quando a validação falhar
- Se a chamada de status falhar, não continuar exibindo “Conectado” como se estivesse validado.
- Mostrar estado intermediário como:
  - “Status não verificado”, ou
  - tratar como desconectado até validação bem-sucedida.
- Liberar o botão de QR Code/reconexão sempre que o status validado não for `connected`.

5. Sincronizar nome e foto corretamente
- Após uma resposta válida de status, atualizar a UI com:
  - nome de exibição
  - foto do perfil
  - telefone
- Usar esses valores tanto no topo do chat quanto no painel “Gerenciar Instância”.

6. Validação final
- Desconectar a instância na UAZAPI.
- Abrir `/whatsapp`.
- Confirmar que:
  - a chamada de status responde sem `NetworkError`
  - o banco muda para `disconnected`
  - a badge da UI muda para desconectado
  - o botão de QR Code aparece
  - nome/foto são exibidos quando retornados pela UAZAPI

Resumo da causa raiz:
- Não é falta de webhook para esse problema específico.
- O problema principal é: a consulta de status não está chegando/funcionando no frontend, então o app fica preso no último status salvo no banco.
- Depois disso, ainda existe um segundo bug: a tela de gerenciamento lê o campo errado da resposta (`instance.status` em vez de `processed.status`).
