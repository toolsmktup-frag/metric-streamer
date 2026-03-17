

## Configuração automática de webhook ao conectar instância

### Problema atual
O webhook precisa ser configurado manualmente no painel da UAZAPI para cada instância. O usuário precisa copiar a URL e configurar eventos — processo propenso a erros.

### Solução
Configurar o webhook automaticamente via API da UAZAPI quando a instância é conectada (action `connect`) ou adicionada. A UAZAPI tem endpoint `POST /webhook/set` que aceita URL e eventos.

### O que será feito

**1. Edge Function `whatsapp-instance` — nova action `set_webhook`**
- Adicionar case `set_webhook` que chama `POST {apiUrl}/webhook/set` com:
  - `url`: `https://emfbocpmphtftqcezaib.supabase.co/functions/v1/uazapi-webhook`
  - `enabled`: true
  - `events`: `["messages.upsert", "messages.update", "connection.update"]`

**2. Chamar `set_webhook` automaticamente após `connect`**
- No case `connect`, após conectar com sucesso, fazer a chamada de configuração do webhook automaticamente dentro da mesma execução.

**3. Chamar `set_webhook` ao adicionar instância**
- No `AddInstanceDialog` (em `WhatsAppChat.tsx`), após inserir a instância no banco, chamar a action `set_webhook` para já deixar configurado.

**4. Botão manual na tela de gerenciamento**
- Adicionar no `InstanceManagement.tsx` um botão "Configurar Webhook" como fallback, mostrando a URL configurada e permitindo reconfigurar se necessário.

### Resultado
- Ao adicionar ou conectar uma instância, o webhook é configurado automaticamente
- Nenhuma ação manual no painel da UAZAPI é necessária
- Botão de fallback disponível para reconfigurar se algo der errado

