

## Plano: Mover lead de etapa direto pelo painel do WhatsApp

### Problema
Hoje a seção "Funis" no painel lateral do WhatsApp apenas exibe em qual etapa o lead está. Para mover, o usuário precisa ir ao Kanban, encontrar o lead e arrastar. Em alto volume isso é impraticável.

### Solução
Transformar cada item de funil no `ContactPanel.tsx` em um seletor de etapa. O usuário verá a etapa atual e poderá clicar para trocar, direto da conversa.

### Implementação

**1. Buscar etapas disponíveis por funil**
- Cada item do `journey` já traz `funnel_id` e `stage_id`. Precisamos buscar todas as etapas de cada funil envolvido.
- Criar um hook simples `useLeadFunnelStages(funnelIds: string[])` que faz `SELECT * FROM lead_funnel_stages WHERE funnel_id IN (...)` agrupando por funil. Ou reutilizar dados já carregados se houver hook existente.

**2. Adicionar Select de etapa no ContactPanel**
- Na seção "Funis" (linhas ~206-225 de `ContactPanel.tsx`), substituir o badge estático da etapa por um `<Select>` compacto com as etapas do funil correspondente.
- O select mostra a etapa atual selecionada, com bolinhas coloridas para cada opção.

**3. Usar `useMoveLeadStage` ao trocar**
- O hook `useMoveLeadStage` já existe e faz tudo: atualiza `lead_stage_positions`, insere evento `stage_change` e invalida queries.
- Ao mudar o select, chamar `moveLeadStage.mutate({ positionId: j.id, leadId: lead.id, funnelId: j.funnel_id, fromStageId: j.stage_id, toStageId: novaEtapa, toStageName })`.

### Arquivos alterados
- `src/components/whatsapp/ContactPanel.tsx` -- adicionar select de etapa + import do hook
- `src/hooks/useLeadPurchases.ts` (ou novo hook) -- buscar etapas dos funis do journey

### Resultado
O usuário poderá mover o lead de etapa do funil direto pela conversa do WhatsApp, sem sair do chat.

