<final-text>Achei o problema real: hoje o painel do WhatsApp só funciona se já existir um registro em `leads` para aquele número. No seu caso o chat existe, mas o painel mostra `Lead não encontrado`, então:

- TAGS não monta `TagsEditor`
- FUNIS não monta `FunnelLinker` quando `journey.length === 0`

Ou seja: o SQL das tags não é o bloqueio principal. O bloqueio está na resolução/criação do lead dentro do painel.

### O que vou corrigir

1. Corrigir a identificação do lead no `ContactPanel`
- parar de depender só de `useLeadByPhone(phone)`
- passar também o contexto do chat selecionado para o painel
- criar um resolver próprio para chat do WhatsApp

2. Criar um fluxo de “garantir lead” antes de editar CRM
- se o chat ainda não tiver lead, criar o lead na hora
- se for vendedor, já atribuir ao usuário atual, senão o `canSeeCrm` trava o painel de novo
- depois disso liberar funil e tags imediatamente

3. Fazer FUNIS funcionar mesmo sem lead prévio
- ao tentar vincular, garantir/criar o lead primeiro
- em seguida salvar `funnel_id + stage_id` em `lead_stage_positions`

4. Fazer TAGS funcionar mesmo sem lead prévio
- ao adicionar/remover tag, garantir/criar o lead primeiro
- manter sugestão de tags existentes + criação de nova + gestão global

5. Corrigir a inconsistência do backend do WhatsApp
- `uazapi-webhook` hoje grava `unified_customers.id` em `whatsapp_messages.lead_id`
- isso não é confiável como `leads.id`
- vou alinhar isso para o painel não depender de ID errado

### Arquivos que entram
- `src/pages/WhatsAppChat.tsx`
- `src/components/whatsapp/ContactPanel.tsx`
- `src/components/whatsapp/FunnelLinker.tsx`
- `src/components/whatsapp/TagsEditor.tsx`
- novo hook/mutation para “ensure lead from chat”
- `supabase/functions/uazapi-webhook/index.ts` ou uma RPC segura para criar/atribuir lead

### Resultado esperado
- chat sem lead: você consegue vincular ao funil e mexer nas tags dali mesmo
- chat com lead: continua funcionando normal
- vendedor não fica bloqueado por “Lead não atribuído a você” logo após criar
- sem te mandar rodar SQL à toa de novo

### Detalhe técnico importante
Seu print bate exatamente com o bug:
- `Lead não encontrado` em TAGS = o painel não tem `lead.id`
- `Nenhum funil vinculado` em FUNIS = como `lead.id` está nulo, o componente de vincular nem aparece

Então o próximo passo certo é consertar o fluxo do painel/lead, não mais SQL de tag.</final-text>