

## Liberar visão completa do lead pra vendedora no chat WhatsApp

### Comportamento novo

**Visualização (sempre liberada):**
- Toda vendedora vê painel completo do lead aberto no chat: notas, vendas, LTV, funis, tags, timeline, jornada — igual admin.
- Continua respeitando a flag de privacidade existente (`hide_ltv_revenue` para vendedor) → LTV/receita seguem ocultos quando configurado, sem mudança.

**Edição (gated por "assumir"):**
- Lead **sem responsável** → ao abrir o chat, vendedora assume automaticamente (já é o comportamento de `useEnsureLead` para leads novos; estendemos pra leads existentes sem dono).
- Lead **de outra vendedora** → painel mostra tudo em modo leitura + banner discreto no topo: *"Lead de [Nome da vendedora]. [Assumir este lead]"*. Clicar pede confirmação ("Vai transferir o lead pra você. A responsável atual perde a edição. Confirmar?") e reatribui.
- Após assumir, todos os controles de edição liberam: notas, mover funil/etapa, tags.
- Admin/gestor: zero mudança, continua editando tudo direto.

### Mudanças por arquivo

**`src/components/whatsapp/ContactPanel.tsx`**
- Remove o early return do bloco `Lock` ("Lead não atribuído a você").
- Cria duas flags: `canSeeCrm = true` (sempre, exceto privacidade de LTV) e `canEditCrm = isAdmin || lead.assigned_to === currentUserId`.
- Hooks de dados (`useContactNotes`, `useLeadPurchases`, `useLeadFunnelJourney`, `useLeadEvents`) passam a receber `phone`/`lead.id` sempre que existir, sem o gate de `canSeeCrm`.
- Notas, `FunnelLinker`, `TagsEditor`, `Select` de etapa e funil recebem prop `disabled={!canEditCrm}` (ou são renderizados como read-only).
- Renderiza `<ClaimLeadBanner />` quando `lead.assigned_to && !canEditCrm` (lead com outro dono).
- LTV/receita continuam consultando `useTeamPrivacySettings` ou flag equivalente já existente — sem mudança.

**`src/components/whatsapp/ClaimLeadBanner.tsx`** (novo)
- Banner compacto no topo do painel: avatar + nome do dono atual + botão "Assumir".
- Ao clicar, abre `AlertDialog` de confirmação e dispara `useAssignLead` com `assignedTo = currentUserId`.
- Toast de sucesso e invalidação de queries (`lead-by-phone`, `leads-by-funnel`).

**`src/hooks/useEnsureLead.ts` + RPC `ensure_lead_for_phone`**
- Hoje só auto-atribui em lead novo. Mantém esse comportamento.
- Para o caso de lead existente sem dono, NÃO mexemos no auto-claim silencioso (evita reivindicar lead alheio sem intenção). A vendedora clica no banner.

**`src/components/whatsapp/ContactPanel.tsx` — controles de edição**
- `addNote`/`deleteNote` no `useContactNotes`: continuar permitindo no DB se RLS permitir, mas no UI bloquear (`disabled`) quando `!canEditCrm`.
- `moveLeadStage`/`moveLeadFunnel`: select fica `disabled` com tooltip "Assuma o lead para editar".

### RLS / backend

Verificar (não alterar ainda — confirmo após ler):
- Políticas SELECT em `lead_notes`, `lead_events`, `lead_stage_positions`, `lead_funnel_journey`, `customer_purchases` precisam permitir vendedor da mesma org ler leads de outros vendedores.
- Se hoje estão restritas a `assigned_to = auth.uid()`, eu ajusto pra `same org` (SELECT) mantendo INSERT/UPDATE/DELETE no dono ou admin.

Se alguma policy bloquear, faço migration adicionando policy de leitura por organização. Sem migration de dados, só DDL de policies.

### O que NÃO muda
- Permissões de admin/gestor.
- Privacidade de LTV (flag existente é respeitada).
- Visibilidade da lista de conversas (já mostra todas conforme acesso da instância).
- Copiloto de Vendas (já funciona independente de assigned_to).
- Botão "Configurar Vendedor" no card do lead (`LeadAssignSelect`) mantém a regra atual de transferência.

### Validação após implementar
1. Logar como vendedora, abrir chat de lead de outra vendedora → deve ver tudo em read-only com banner "Assumir".
2. Clicar "Assumir" → confirmar → painel libera edição, lead aparece na lista da nova dona.
3. Abrir chat de lead sem dono → assume automático (comportamento atual), edita direto.
4. Logar como admin → zero diferença.
5. Verificar que LTV continua oculto se a flag `hide_ltv_revenue` estiver ativa pra vendedor.

