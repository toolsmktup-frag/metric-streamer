

## Plano de Implementacao: Modulo Campanhas + Funis de Leads

### Contexto

O projeto atual tem `funnels` para agrupar dados de ads Meta. O novo modulo e um sistema separado de CRM/rastreamento de leads com Kanban, editor visual de fluxo e webhooks. Vamos criar tudo como entidades novas, sem tocar no existente.

### Fase 1 — Banco de dados (9 migrations)

Criar as seguintes tabelas vinculadas a `organizations`:

| Tabela | Colunas principais |
|--------|-------------------|
| `lead_campaigns` | id, organization_id, name, description, color, created_at |
| `lead_funnels` | id, organization_id, campaign_id (nullable FK), name, description, color, webhook_token (unique, auto-gen), is_active, sort_order |
| `lead_funnel_stages` | id, funnel_id FK, name, color, sort_order, page_url, thumbnail_url, position_x, position_y |
| `stage_transition_rules` | id, funnel_id FK, event_name, from_stage_id FK, to_stage_id FK |
| `leads` | id, organization_id, phone, email, name, utm_source/medium/campaign/content/term, metadata (jsonb), created_at |
| `lead_events` | id, lead_id FK, funnel_id FK, event_name, metadata (jsonb), created_at |
| `lead_stage_positions` | id, lead_id FK, funnel_id FK, stage_id FK, entered_at, unique(lead_id, funnel_id) |
| `funnel_source_nodes` | id, funnel_id FK, source_type, label, position_x, position_y |
| `funnel_edges` | id, funnel_id FK, source_node_id, target_node_id, source_type (stage/source) |

Todas com RLS habilitado, policies baseadas em `organization_id` do usuario autenticado. Unique constraint em `leads(organization_id, phone)` e `leads(organization_id, email)`.

### Fase 2 — Edge Function `webhook-lead`

Nova edge function em `supabase/functions/webhook-lead/index.ts`:
- `verify_jwt = false` (endpoint publico)
- Autentica via header `X-Funnel-Token` (busca funnel pelo token)
- Recebe POST com `{ event, phone, email, name, metadata, utm_* }`
- Deduplica lead por phone/email dentro da organization
- Cria `lead_events` 
- Aplica `stage_transition_rules` para mover o lead
- Atualiza/insere `lead_stage_positions`

### Fase 3 — Frontend: Estrutura + Paginas

**Novas rotas** (prefixo `/lead-funnels` para nao conflitar):
- `/lead-campaigns` — Lista de campanhas
- `/lead-campaigns/nova` — Criar campanha
- `/lead-campaigns/:id` — Detalhe
- `/lead-funnels` — Lista de funis
- `/lead-funnels/novo` — Criar funil
- `/lead-funnels/:id` — Detalhe com abas (Kanban, Visual, Flow, Config, Webhook)

**Novos componentes** em `src/components/lead-funnels/`:
- `KanbanBoard.tsx` — Colunas com cards de leads por etapa
- `LeadCard.tsx` — Card individual do lead
- `LeadTimeline.tsx` — Drawer com historico de eventos
- `FunnelVisual.tsx` — Visualizacao tipo funil de conversao (barras)
- `FunnelFlowEditor.tsx` — Editor visual com React Flow
- `FunnelFlowNode.tsx` — No customizado de etapa
- `TrafficSourceNode.tsx` — No de fonte de trafego
- `FunnelConfigTab.tsx` — CRUD de etapas + regras de transicao
- `WebhookConfig.tsx` — URL, token, payload de exemplo, botao copiar

**Novos hooks** em `src/hooks/`:
- `useLeadCampaigns.ts` — CRUD de campanhas
- `useLeadFunnels.ts` — CRUD de funis + stages + rules
- `useLeads.ts` — Query de leads por funil/etapa
- `useLeadEvents.ts` — Historico de eventos

**Dependencias npm novas:**
- `@xyflow/react` — Editor visual
- `@dagrejs/dagre` — Auto-layout

**Sidebar:** Adicionar nova secao "Funis de Leads" no `AppSidebar.tsx` abaixo de "Ferramentas", mantendo as cores e estilo existentes.

### Fase 4 — Editor Visual (React Flow)

Implementar o `FunnelFlowEditor` com:
- Nos de etapa (cor, nome, contagem de leads)
- Nos de fonte de trafego (Instagram, Facebook, Google, WhatsApp, etc.)
- Edges conectando nos
- Auto-layout com dagre
- Salvar posicoes no banco
- Drag-and-drop para reorganizar

### Ordem de execucao

1. Migrations (todas as tabelas + RLS)
2. Regenerar `types.ts`
3. Edge function `webhook-lead`
4. Hooks de dados
5. Paginas e componentes (Kanban, Config, Webhook primeiro)
6. Sidebar atualizado
7. Editor visual (React Flow) por ultimo

### Risco zero para o existente

- Nenhuma tabela existente sera alterada
- Nenhuma edge function existente sera tocada
- Novas rotas com prefixo proprio
- Componentes isolados em pasta propria

