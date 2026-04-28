
# Sistema de Follow-ups no CRM

Vamos adicionar **Follow-ups** — uma forma simples de "lembrar de falar com fulano daqui X dias" ou já "deixar a mensagem pronta para o sistema enviar sozinho". Tudo plugado nos lugares onde você já trabalha hoje (Kanban, chat WhatsApp, card do lead) + uma central pra acompanhar.

## Conceito (1 entidade, 2 modos)

Cada follow-up tem **um modo**:

1. **Lembrete** → o sistema só te avisa na hora marcada (badge no menu, na home/Resumo, no card do lead). Você fala manualmente.
2. **Envio automático** → você escreve a mensagem agora, escolhe a data/hora e a instância do WhatsApp. Na hora marcada o sistema dispara sozinho (mesma engine das automações WZ que já existe).

Cada follow-up pertence a **um lead** (telefone + nome) e opcionalmente a um funil/etapa. Tem responsável (quem foi designado), status (`pending`, `done`, `sent`, `cancelled`, `snoozed`, `failed`) e prazo (`due_at`).

## Onde encaixa na UI (4 pontos de entrada)

### 1. Botão "Agendar follow-up" no Card do Kanban
No `LeadCard` (mesmo menu do GripVertical que abre o popover de mover de estágio) adicionar item **"Agendar follow-up"**. Abre um `Dialog` rápido:
- Modo: Lembrete / Mensagem automática
- Quando: presets (hoje +3h, amanhã, +3 dias, +7 dias, +10 dias, +30 dias) ou data custom
- Título/observação (lembrete) **ou** mensagem + instância WhatsApp (automático)
- Salvar

### 2. Aba "Follow-ups" dentro do detalhe do lead
Na página do lead/timeline, uma aba lista todos os follow-ups daquele contato (passados + futuros), com ações: marcar feito, reagendar (snooze: +1h, +1d, +1 sem), cancelar, editar.

### 3. Botão no Chat do WhatsApp
No `ContactPanel` (lateral direita do chat) e no `ChatInput` (ao lado do botão de enviar): **"Agendar"** — mesma dialog. Caso clássico: "manda essa mensagem amanhã 9h", "lembra de falar com ele em 10 dias".

### 4. Página central /tarefas (acompanhamento)
Nova rota `/tarefas` no sidebar com 4 abas:
- **Hoje** (vencendo hoje)
- **Atrasadas** (vencidas e ainda pending)
- **Próximas 7 dias**
- **Concluídas / Histórico**

Filtros: por responsável, por funil, por modo (lembrete vs auto). Cada linha mostra lead, prazo, prévia da mensagem, ações rápidas (concluir / reagendar / abrir chat / abrir lead).

### 5. Badge global no header
Contador de follow-ups vencendo hoje + atrasadas, igual notificação. Click → vai pra `/tarefas`.

### 6. Widget no `/resumo`
Card "Meus follow-ups de hoje" com os 5 primeiros + botão "ver todos".

## Boas práticas que vamos aplicar

- **Snooze rápido**: em 1 clique adia +1h / +1d / +1 sem (padrão de CRMs como Pipedrive/HubSpot).
- **Presets de prazo** (3d, 7d, 10d, 30d) — você raramente digita data, é 1 clique.
- **Auto-criação opcional**: regra por etapa do funil — ex: "lead entrou em 'Sem resposta' → cria follow-up automático em +3 dias". Configurável na aba de configuração do funil (fica pra v2 depois que o básico estiver de pé).
- **Cancelamento automático**: se o lead responder no WhatsApp, follow-ups pendentes do tipo "envio automático" são cancelados (igual o `skipIfReplied` que já existe nas automações). Opção marcável por follow-up.
- **Variáveis**: na mensagem automática suportar `{{nome}}`, `{{primeiro_nome}}` (mesmo padrão das automações).
- **Permissões**: vendedor vê só os próprios follow-ups; admin vê todos.

## Arquitetura técnica

### Banco (1 tabela nova)
```sql
create table public.lead_follow_ups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid references leads(id) on delete cascade,
  funnel_id uuid references funnels(id) on delete set null,
  stage_id uuid references lead_funnel_stages(id) on delete set null,
  assigned_to uuid references auth.users(id),
  created_by uuid references auth.users(id),
  mode text not null check (mode in ('reminder','auto_send')),
  title text,
  message text,                    -- usada quando mode='auto_send'
  instance_id uuid,                -- WhatsApp instance pra disparar
  skip_if_replied boolean default true,
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','done','sent','cancelled','snoozed','failed')),
  completed_at timestamptz,
  sent_at timestamptz,
  error_message text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_followups_due_pending
  on lead_follow_ups (due_at) where status = 'pending';
create index idx_followups_lead on lead_follow_ups (lead_id);
create index idx_followups_assigned on lead_follow_ups (assigned_to, status, due_at);
```
+ RLS por `organization_id` e `assigned_to` (mesmo padrão de `lead_funnels`).

### Worker (cron)
Edge function `follow-up-dispatcher` rodando a cada 1 min via pg_cron (mesma estrutura do `wz-scheduler`):
- pega `lead_follow_ups` com `status='pending'` e `due_at <= now()`
- se `mode='reminder'` → marca `status='due'`/cria notificação (não envia nada)
- se `mode='auto_send'` → checa `skip_if_replied` (última mensagem do lead foi recebida depois da criação?), se ok dispara via UAZAPI usando `instance_id`, marca `sent`. Em erro → `failed` + `error_message`.

### Frontend
- Hook `useFollowUps` (lista/filtros), `useCreateFollowUp`, `useUpdateFollowUp` (snooze/done/cancel).
- Componente `FollowUpDialog` reutilizado nos 4 pontos de entrada.
- Componente `FollowUpList` reutilizado no card do lead, na página `/tarefas` e no widget do Resumo.
- Realtime: subscribe na tabela pra atualizar contador do badge.

## Roadmap de entrega

**Fase 1 (MVP — entrega tudo o que você pediu):**
1. Migration da tabela + RLS (SQL pra você rodar manualmente no Supabase, como sempre).
2. Hooks + `FollowUpDialog`.
3. Botão no `LeadCard` (Kanban) e no `ContactPanel`/`ChatInput` (WhatsApp).
4. Página `/tarefas` com as 4 abas + filtros básicos.
5. Edge function `follow-up-dispatcher` + cron 1 min.
6. Badge no header + widget no `/resumo`.

**Fase 2 (depois, se quiser):**
- Auto-criação por etapa do funil.
- Templates rápidos de mensagem ("Oi {{primeiro_nome}}, ainda tem interesse?").
- Métricas: taxa de resposta após follow-up, conversão por SDR.

## O que você precisa decidir antes

1. **Notificação fora do app**: só badge dentro do sistema, ou quer também receber no seu próprio WhatsApp quando um lembrete vencer? (recomendo só badge no MVP)
2. **Quem vê o quê**: vendedor vê só os dele, admin vê todos? (recomendo sim)
3. **Cancelar se responder**: ligado por padrão pros envios automáticos? (recomendo sim)

Se topar, sigo pra implementação na ordem do roadmap fase 1.
