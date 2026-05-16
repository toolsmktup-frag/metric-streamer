# Permitir deletar automação do funil

Adicionar botão de exclusão em cada card de automação na aba **Automações** do funil (`FunnelAutomationsTab.tsx`).

## Comportamento

- Ícone de lixeira (vermelho discreto) ao lado do botão "Editar" em cada card.
- Ao clicar, abre `AlertDialog` de confirmação.
- Se a automação está marcada como **"Só neste funil"** (`show_in_automations = false`): desvincula **e apaga o fluxo** (`wz_flows`), já que ele só existe para esse funil.
- Se está **"Visível em Automações"** (`show_in_automations = true`): apenas **desvincula** do funil (mantém o fluxo, pois pode estar em uso em outros lugares). O diálogo deixa isso claro no texto.
- Após sucesso: invalida `lead-funnel-automations` e `wz-flows`, toast de confirmação.

## Detalhes técnicos

- Reusa `useUnlinkFunnelAutomation` (já existe em `useLeadFunnelAutomations.ts`).
- Delete do flow via `supabase.from('wz_flows').delete().eq('id', wz_flow_id)` quando aplicável.
- Sem mudanças em hooks, schema ou outras telas.
