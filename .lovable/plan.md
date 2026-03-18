

## Abrir Chat do WhatsApp direto pelo Card do Lead no Funil

### O que muda

Quando o lead tem telefone, adicionar um botão de WhatsApp no card. Ao clicar, navega para `/whatsapp` já com o chat daquele número aberto.

### Como funciona hoje

- `LeadCard` tem `onClick` → abre timeline do lead
- A página `/whatsapp` (`WhatsAppChat.tsx`) aceita seleção de instância e telefone via estado interno
- Não há integração entre os dois módulos

### Implementação

**1. Botão WhatsApp no `LeadCard.tsx`**

Adicionar um ícone de WhatsApp (MessageCircle ou um SVG dedicado) ao lado do telefone. O clique nesse ícone chama `onWhatsAppClick(phone)` (com `stopPropagation` para não abrir a timeline).

**2. Prop `onWhatsAppClick` no `KanbanBoard.tsx`**

Propagar a nova callback do Kanban até o card.

**3. Navegação no `LeadFunnelDetail.tsx`**

Ao receber `onWhatsAppClick(phone)`, navegar para `/whatsapp?phone={phone}` usando `useNavigate`.

**4. Ler query param em `WhatsAppChat.tsx`**

Na montagem, ler `searchParams.get('phone')`. Se presente, auto-selecionar o chat correspondente (buscar na lista de chats ou abrir conversa nova com esse número).

### Arquivos a editar
1. `src/components/lead-funnels/LeadCard.tsx` — botão WhatsApp + callback
2. `src/components/lead-funnels/KanbanBoard.tsx` — propagar `onWhatsAppClick`
3. `src/pages/LeadFunnelDetail.tsx` — `navigate('/whatsapp?phone=...')`
4. `src/pages/WhatsAppChat.tsx` — ler `?phone=` e auto-abrir conversa

