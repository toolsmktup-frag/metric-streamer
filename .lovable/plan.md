## Disparar webhook de teste para o n8n

Vou simular um signup do lead do print 02 (`+5544998685747`) chamando o endpoint público de captura do funnel Influencers, que por sua vez vai disparar a automação e enviar o payload pro webhook do n8n.

### Passos

1. **POST no endpoint de captura do funnel** usando o token fornecido:
   ```
   POST https://emfbocpmphtftqcezaib.supabase.co/functions/v1/public-lead-capture
   Body: {
     "token": "3a9b5990ed26751eb832f572a6d64b3e338ccfe1aec40fca",
     "name": "<nome do lead do print>",
     "phone": "+5544998685747",
     "email": "<email do lead, se houver>",
     "event": "signup"
   }
   ```

2. **Verificar resposta** (status 200 + lead_id retornado).

3. **Conferir no banco** se a execução da automação foi disparada (tabela `wz_executions` / `wz_node_executions`) e se o nó Webhook HTTP rodou com sucesso (status code da resposta do n8n).

4. **Reportar resultado**: status do disparo + se o n8n recebeu (você confirma do lado de lá clicando em "Listen for test event" antes, ou olhando o histórico de execuções).

### Antes de eu disparar, preciso confirmar:

- Você já configurou o nó **Webhook HTTP** dentro da automação ligada ao funnel Influencers com a URL/body que te mandei? Se não, o disparo vai criar o lead mas não vai mandar nada pro n8n.
- A automação está **ativa** e tem o trigger configurado pra `signup` (ou pra criação de lead nesse funnel)?
- Você quer que eu use a **Production URL** (`/webhook/...`) ou prefere trocar pra **Test URL** (`/webhook-test/...`) antes do disparo pra você ver chegando ao vivo no editor do n8n?

Confirma esses 3 pontos que eu mando o disparo na sequência.