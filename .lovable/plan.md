

# Plano: Vendedor Responsável por Lead

## Situação Atual

- **Tabela `leads`**: Não possui campo de vendedor responsável.
- **Tabela `whatsapp_messages`**: Tem `lead_id`, `instance_id`, `phone`, mas sem referência a vendedor.
- **Controle de acesso atual**: Vendedores são filtrados por `whatsapp_instance_access` (instâncias) e `lead_funnel_access` (funis/campanhas), mas não por lead individual.
- **Chat WhatsApp**: Mensagens inbound chegam na fila geral por instância, sem roteamento por vendedor.

## O Que Precisa Ser Construído

### 1. Coluna `assigned_to` na tabela `leads`
- Adicionar `assigned_to uuid REFERENCES auth.users(id)` na tabela `leads`.
- Índice para queries rápidas.
- Quando preenchido, indica o vendedor responsável pelo lead.

### 2. Interface de Atribuição no CRM (Kanban / Detalhe do Lead)
- No card ou detalhe do lead, exibir dropdown com vendedores da organização.
- Permitir atribuir/reatribuir vendedor manualmente.
- Opção de atribuição em lote (selecionar vários leads → atribuir vendedor).

### 3. Filtro de Visibilidade no Kanban por Vendedor
- Se o usuário logado é `vendedor`, o Kanban filtra apenas leads onde `assigned_to = auth.uid()` **OU** leads ainda sem atribuição (conforme regra que você definir).
- Admins/gestores continuam vendo tudo.
- Opcionalmente, a partir de uma etapa configurável, leads sem vendedor ficam invisíveis para vendedores.

### 4. Roteamento de Chat WhatsApp pelo Vendedor
- Quando uma mensagem inbound chega de um `phone` vinculado a um lead com `assigned_to`, a conversa aparece **apenas** para esse vendedor (e admins).
- Se o lead não tem vendedor, a mensagem vai para a fila geral.
- Isso exige: na listagem de chats do vendedor, filtrar por `lead_id` → `assigned_to`.

### 5. Atribuição Automática (opcional, fase futura)
- Regras como: "ao entrar na etapa X, atribuir ao vendedor que enviou a última mensagem".
- Round-robin entre vendedores disponíveis.

---

## Detalhes Técnicos

### Migration SQL
```text
ALTER TABLE public.leads
  ADD COLUMN assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX idx_leads_assigned_to ON public.leads(assigned_to);
```

### Arquivos Impactados

| Arquivo | Mudança |
|---|---|
| `src/types/leadFunnels.ts` | Adicionar `assigned_to` no tipo `Lead` |
| `src/hooks/useLeads.ts` | Incluir `assigned_to` nas queries |
| Componente Kanban (card do lead) | Mostrar avatar/nome do vendedor, dropdown para atribuir |
| `src/hooks/useWhatsApp.ts` | Filtrar chats por `assigned_to` quando vendedor |
| `supabase/functions/webhook-lead/index.ts` | Preservar `assigned_to` existente no upsert |
| Nova RLS ou filtro client-side | Vendedor só vê leads `assigned_to = auth.uid()` |

### Ordem de Implementação Sugerida

1. **Migration** — adicionar coluna `assigned_to`
2. **Tipos + hooks** — atualizar `Lead` type e queries
3. **UI de atribuição** — dropdown no detalhe/card do lead
4. **Filtro Kanban** — vendedor só vê seus leads
5. **Roteamento WhatsApp** — filtrar chat list por vendedor responsável

