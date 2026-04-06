

## Plano: Permitir trocar o funil de leads pelo painel do WhatsApp + registrar evento

### O que muda

Hoje o dropdown no ContactPanel só troca a **etapa** dentro do mesmo funil. O usuário quer também poder **mover o lead para outro funil** direto da conversa, e registrar um evento claro no histórico.

### Implementação

**1. Novo hook `useMoveLeadFunnel`** (`src/hooks/useMoveLeadFunnel.ts`)
- Recebe: `positionId`, `leadId`, `fromFunnelId`, `toFunnelId`, `toFunnelName`
- Busca a primeira etapa (sort_order=0) do funil destino
- Atualiza `lead_stage_positions` com o novo `funnel_id`, `stage_id` e `entered_at`
- Insere evento em `lead_events` com `event_name: 'funnel_change'` e metadata: `{ from_funnel_id, to_funnel_id, moved_by: 'manual' }`
- Invalida queries relevantes (`lead-funnel-journey`, `leads-by-funnel`, `funnel-lead-counts`, `lead-events`)

**2. Buscar todos os funis disponíveis no ContactPanel**
- Importar `useLeadFunnels` no `ContactPanel.tsx`
- Usar o resultado para popular um segundo `<Select>` de funil

**3. Atualizar UI no ContactPanel** (`src/components/whatsapp/ContactPanel.tsx`)
- Acima do select de etapa, adicionar um select de funil mostrando o funil atual
- Opções: todos os funis da organização (exceto o atual, ou com o atual pré-selecionado)
- Ao trocar funil, chamar `useMoveLeadFunnel` que move o lead para a 1ª etapa do novo funil
- Toast: `"Lead movido para {novoFunil}"`

**4. Evento no histórico**
- O evento `funnel_change` será mapeado no `EVENT_MAP` do ContactPanel com label: `"Funil alterado manualmente"`, ícone `MapPin`, cor azul
- Metadata incluirá nomes dos funis para exibição legível na timeline

### Arquivos
- **Criar**: `src/hooks/useMoveLeadFunnel.ts`
- **Editar**: `src/components/whatsapp/ContactPanel.tsx` (import do hook + select de funil + mapeamento de evento)

