

## Plano: Corrigir Webhook para Receber Todas as Mensagens

### Problemas Identificados

**1. `excludeMessages: ['wasSentByApi']` esta filtrando mensagens enviadas pela API**
Voce tem razao -- esse filtro faz a UAZAPI **nao enviar** pro webhook as mensagens que foram enviadas pela propria API. Ou seja, quando voce envia uma mensagem pela plataforma, ela nao volta pro webhook. Precisamos remover esse filtro para registrar tudo (mensagens enviadas por voce, pelo cliente, audios, arquivos, etc).

**2. Mensagens reais nao estao chegando**
Alem do filtro, o webhook `uazapi-webhook` pode estar rejeitando mensagens reais por causa da logica de deteccao de `isFromMe` -- ele descarta mensagens outbound. Precisamos ajustar para que mensagens `fromMe` tambem sejam salvas no banco (nao apenas atualizadas).

### Alteracoes

**1. `whatsapp-instance/index.ts`** -- Remover `excludeMessages` em dois lugares:
- Linha 154: no `case 'connect'` (auto-configuracao)
- Linha 313: no `case 'set_webhook'`

**2. `uazapi-webhook/index.ts`** -- Ajustar tratamento de mensagens outbound:
- Em vez de ignorar mensagens `isFromMe`, salvar tambem no banco (para ter historico completo de audios, arquivos, textos enviados)
- Manter a deduplicacao por `message_id_external` para nao duplicar

**3. Re-deploy no Supabase**: Apos as alteracoes, voce precisara copiar o codigo atualizado das duas functions e re-deployar no Supabase Dashboard.

### Apos implementar
Voce precisara tambem re-configurar o webhook na UAZAPI (clicar "Configurar Webhook" na plataforma) para que a nova config sem `excludeMessages` seja aplicada.

