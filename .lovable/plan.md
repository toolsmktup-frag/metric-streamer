

## Revisão: Status das Fases

### Fase 1 — Modelagem e Backend ✅ Completa

**Tabelas criadas no Supabase:**
- `lead_campaigns` — campanhas de agrupamento
- `lead_funnels` — funis com `webhook_token`, `is_active`, vínculo a campaign
- `lead_funnel_stages` — etapas do funil com `sort_order`, cor, posição
- `stage_transition_rules` — regras de transição por evento
- `leads` — leads com phone, email, name, UTMs, metadata
- `lead_events` — log de eventos por lead/funil
- `lead_stage_positions` — posição atual do lead no funil
- `funnel_source_nodes` / `funnel_edges` — nós do flow editor

**Edge Function `webhook-lead`:**
- Deployada em `https://emfbocpmphtftqcezaib.supabase.co/functions/v1/webhook-lead`
- `verify_jwt = false` no `config.toml`
- Valida `X-Funnel-Token`, deduplica lead por phone/email, loga evento, aplica regras de transição

**Types e Hooks:**
- `src/types/leadFunnels.ts` — interfaces completas
- `src/hooks/useLeadFunnels.ts` — CRUD de funis, stages, rules
- `src/hooks/useLeads.ts` — leads por funil, eventos, contagens
- `src/hooks/useLeadCampaigns.ts` — CRUD de campanhas

### Fase 2 — Frontend ✅ Completa

**Páginas e Componentes:**
- `LeadCampaigns.tsx` — listagem de campanhas e funis, criação via dialog
- `LeadFunnelDetail.tsx` — página de detalhe com 5 abas:
  - **Kanban** — `KanbanBoard.tsx` com colunas por stage e cards de lead
  - **Funil** — `FunnelVisual.tsx` com visualização de conversão
  - **Flow Editor** — `FunnelFlowEditor.tsx`
  - **Configuração** — `FunnelConfigTab.tsx` para stages e rules
  - **Webhook** — `WebhookConfig.tsx` com URL, token, payload de exemplo, cURL
- `LeadCard.tsx` — card de lead no kanban
- `LeadTimeline.tsx` — timeline de eventos do lead (sheet lateral)

**Roteamento:** `/lead-campaigns` e `/lead-funnels/:id` configurados no `App.tsx` com `<Protected>`.
**Sidebar:** Item "Funis de Leads" presente em `AppSidebar.tsx`.

### Conclusão: Pronto para Fase 3

Tudo está implementado e deployado. O sistema tem:
1. Backend completo (tabelas + edge function deployada)
2. Frontend completo (listagem, CRUD, kanban, visual, webhook config)
3. Webhook funcional esperando requests

**Para iniciar a Fase 3**, o próximo passo lógico seria:
- Testar o fluxo end-to-end (criar funil → configurar stages → enviar webhook → ver lead no kanban)
- Ou avançar para funcionalidades adicionais como: drag-and-drop no kanban, filtros de leads, dashboard de métricas, integração com automações externas

Confirme o que a Fase 3 contempla para eu preparar o plano de implementação.

