
## Auditoria do problema

Confirmei que o vazamento existe e ele não está só na interface — hoje o isolamento do chat por vendedor está quebrado em vários pontos.

### Achados críticos
1. **A rota `/whatsapp` não está protegida por permissão de módulo**
   - Em `src/App.tsx`, o chat usa só `Protected`, sem `PermissionRoute`.
   - Ou seja: qualquer usuário autenticado que conheça a URL pode tentar entrar no chat.

2. **As Edge Functions do WhatsApp validam só a organização**
   - `supabase/functions/whatsapp-chats/index.ts`
   - `supabase/functions/whatsapp-send/index.ts`
   - `supabase/functions/whatsapp-media/index.ts`
   - Hoje elas conferem basicamente `organization_id` e, em alguns casos, `instance_id`.
   - **Não conferem se o lead/conversa pertence àquela vendedora**.

3. **No modo unificado, a conversa é identificada só por telefone**
   - Em `src/pages/WhatsAppChat.tsx`, o `handleSelectChat` ignora o `instanceId`.
   - `selectedChat` também procura só por `phone`.
   - Resultado: se o mesmo número existir em mais de um contexto, a conversa pode ser mesclada/aberta errada.

4. **Realtime também está frouxo**
   - Em `src/hooks/useWhatsApp.ts`, a assinatura do realtime filtra só por `phone`.
   - Não filtra por `instance_id`.
   - Isso pode injetar mensagens de outra instância/conversa na thread aberta.

5. **O painel lateral amplia o vazamento**
   - `ContactPanel` carrega lead, compras, notas, funis e eventos por `phone/leadId` sem aplicar a mesma regra de vendedor responsável.
   - Então, quando a conversa abre, a pessoa pode ver também os dados internos do CRM e até mover lead de etapa/funil.

6. **A proteção atual está acontecendo muito no client**
   - `useWhatsAppInstances()` busca instâncias no front e filtra depois.
   - Isso é fraco como segurança.
   - Pior: o tipo inclui `api_token`, então precisamos remover qualquer exposição disso no browser.

## Plano de correção

### P0 — Fechamento imediato do acesso
1. Proteger `/whatsapp` com `PermissionRoute requiredPermission="mod_whatsapp"`.
2. Remover qualquer confiança em filtro client-side como controle real de acesso.
3. Fazer o servidor virar a fonte de verdade para:
   - quais instâncias o usuário pode acessar
   - quais conversas/leads ele pode ver
   - quais ações ele pode executar

### P1 — Blindar o backend do chat
4. Criar uma checagem única de autorização no backend do WhatsApp:
   - admin/gestor: acesso total da organização
   - vendedor/suporte: acesso **somente aos leads permitidos**
5. Aplicar essa checagem em:
   - `whatsapp-chats`
   - `whatsapp-send`
   - `whatsapp-media`
6. Bloquear `instance_id=all` quando ele extrapolar as instâncias permitidas do usuário.
7. Para vendedores, filtrar chats e mensagens por:
   - `instance_id` permitido
   - lead autorizado
   - nunca só por `organization_id`
8. Se o número não estiver vinculado a um lead permitido, retornar estado bloqueado em vez de mostrar a conversa.

### P1 — Corrigir a identidade da conversa no frontend
9. Trocar a seleção de conversa para chave composta:
```text
instance_id + phone
```
10. Em `WhatsAppChat`, salvar a conversa selecionada com contexto da instância.
11. Em `ChatList`, usar o `instanceId` clicado de verdade.
12. No modo “todas as instâncias”, não mesclar thread por telefone puro.
13. No realtime, filtrar por `phone + instance_id`, não só telefone.

### P1 — Fechar o vazamento no painel lateral
14. Aplicar a mesma regra de autorização no `ContactPanel` e nos hooks:
   - `useLeadByPhone`
   - `useLeadPurchases`
   - `useLeadFunnelJourney`
   - `useLeadEvents`
   - `useContactNotes`
15. Se a vendedora não for responsável pelo lead, não mostrar:
   - notas
   - compras
   - timeline
   - funis
   - ações de mover etapa/funil

### P2 — Alinhar o CRM com a mesma regra
16. Auditar os pontos que abrem o WhatsApp a partir do CRM:
   - `LeadFunnelDetail`
   - `KanbanBoard`
   - `BaseLeadsList`
17. Garantir que a regra seja a mesma em tudo:
   - funil
   - base de leads
   - chat
   - painel lateral
18. Padronizar a regra de visibilidade do “vendedor responsável” para não existir brecha por tela.

## Regra recomendada
A forma mais segura é esta:

- **Admin/Gestor**: vê tudo
- **Vendedor/Suporte**: vê **somente leads atribuídos a ele**
- **Leads sem responsável**: decidir se:
  - ficam invisíveis no chat até alguém assumir, ou
  - entram numa fila separada de “não atribuídos”

Para corrigir isso sem ambiguidade, eu sugiro que o chat do vendedor fique **estrito por responsável**. É a opção mais segura e evita exatamente esse problema de duas pessoas responderem o mesmo lead.

## Detalhe técnico
```text
Hoje o fluxo vaza assim:
rota /whatsapp abre
-> backend aceita consulta por organização
-> conversa é resolvida por telefone
-> realtime também escuta por telefone
-> painel lateral carrega CRM por telefone
=> uma vendedora pode enxergar conversa/dados de outra
```

## Arquivos que entram na correção
- `src/App.tsx`
- `src/pages/WhatsAppChat.tsx`
- `src/hooks/useWhatsApp.ts`
- `src/hooks/useWhatsAppMultiChat.ts`
- `src/components/whatsapp/ChatList.tsx`
- `src/components/whatsapp/ContactPanel.tsx`
- `src/hooks/useLeadByPhone.ts`
- `src/hooks/useContactNotes.ts`
- `src/hooks/useLeadPurchases.ts`
- `supabase/functions/whatsapp-chats/index.ts`
- `supabase/functions/whatsapp-send/index.ts`
- `supabase/functions/whatsapp-media/index.ts`

## Resultado esperado
Depois da correção:
- uma vendedora não verá mais conversa de outra
- não conseguirá abrir por URL manual
- não conseguirá puxar mídia ou enviar mensagem fora da sua alçada
- não verá notas, compras e timeline de lead alheio
- admin/gestor continua com visão completa
- o servidor passa a bloquear de verdade, não só esconder na interface

## Ordem de implementação
1. Travar rota e permissões
2. Endurecer Edge Functions
3. Corrigir seleção da conversa por `instance_id + phone`
4. Fechar `ContactPanel` e hooks ligados ao lead
5. Validar ponta a ponta com duas vendedoras no mesmo funil/mesma instância
