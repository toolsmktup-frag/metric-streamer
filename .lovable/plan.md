## Auditoria — sincronização Funil de Tráfego ↔ Funil de Leads (CRM) ↔ Automações

### O que eu olhei
- `FunisConfigurar` (funis de tráfego/pagamento + plataformas + produtos)
- `LeadFunnelDetail` com 7 abas: Kanban, Funil, Flow, Métricas, **Configuração**, Automações, Webhook
- `FunnelConfigTab` (577 linhas) que **dentro dele** ainda agrupa: etapas, regras de transição, produtos, mappings, redistribuição, WhatsApp Group Sync, Meta CAPI, traffic_funnel link
- Webhooks por plataforma (`ticto-webhook`, `guru-webhook`, `eduzz-webhook`) → `webhook-lead` → regras → `lead_stage_positions`
- `wz-executor` / `wz-scheduler` / `wz_flows` + `lead_funnel_automations` (vínculo flow ↔ funil)
- Memórias do projeto (event-naming, dual-pipeline-webhooks, automation-integration, product-identification, traffic-funnel-link)

### Diagnóstico honesto

**1. A arquitetura por baixo está boa.** Os pilares estão certos:
- nomes canônicos de eventos (`purchase`, `pix_generated`...) ✅
- regras de transição declarativas em `stage_transition_rules` ✅
- automações desacopladas em `wz_flows` linkadas via `lead_funnel_automations` ✅
- webhook → CRM antes de disparar automação (dual-pipeline) ✅
- traffic_funnel link para ROI ✅

O problema **não é arquitetural, é de UX de configuração**. Hoje, pra colocar um funil novo no ar, o usuário precisa visitar **6+ telas** e entender **4 conceitos diferentes** (funil de tráfego, funil de leads, produtos do funil, mappings raw→produto, regras de transição, vínculo de automação).

**2. Onde dói mais (ranqueado por fricção):**

| # | Fricção | Por quê dói |
|---|---|---|
| 1 | Aba **Configuração** virou um "tudo aqui dentro" de 577 linhas com 7 sub-seções empilhadas | Sem hierarquia visual, sem "passo 1/2/3", o usuário rola e perde contexto |
| 2 | **Funis de Tráfego e Funis de Leads são entidades separadas** que precisam ser ligadas manualmente em 2 lugares (campanha OU funil) | Duplica trabalho. 90% dos casos: 1 funil de tráfego = 1 funil de leads |
| 3 | **Produtos** existem em 3 lugares: `funnel_products` (catálogo de tráfego), `lead_funnel_products` (do CRM) e `lead_product_mappings` (raw→canonical) | Mesmo conceito modelado 3x. Usuário não sabe qual mexer |
| 4 | **Regras de transição** são montadas evento-a-evento, etapa-a-etapa, manualmente | Funil novo = 5 etapas × 4 eventos = 20 regras pra clicar. Deveria ter template |
| 5 | **Automações** ficam em 2 abas distintas (`Automações` no CRM e `/wz/automacoes` global) sem visão unificada de "o que dispara quando" | Difícil saber se um lead vai cair em automação ou não |
| 6 | **Webhook por plataforma** exige criar plataforma → copiar URL → colar no Ticto/Guru/Eduzz, um por um | Onboarding de 15-20 min antes de ver o 1º lead |
| 7 | **Meta Pixel + CAPI** está enterrado dentro da aba Configuração do CRM, não na integração de tráfego | Quem configura Meta espera achar em Integrações ou no funil de tráfego |

**3. O que NÃO está em boas práticas:**
- Falta um **wizard de criação de funil** ("plataforma → produtos → etapas-padrão → automação opcional") que entregue um funil funcionando em 3 cliques
- Falta **templates de funil** (ex.: "Lançamento", "Perpétuo com bump+upsell", "Recompra") que pré-criem etapas + regras + produtos
- Falta **auto-vínculo tráfego↔leads**: quando o usuário cria um funil de leads escolhendo a mesma plataforma+produto principal de um funil de tráfego, deveria ligar sozinho
- Falta **status visual de saúde do funil** ("3 webhooks recebendo OK, 0 leads sem etapa, última automação rodou 2min atrás") — hoje a única forma de saber é ir em logs

### Plano de simplificação (3 ondas)

```text
Onda 1 (alto impacto, baixo risco) ─ UX da configuração
 ├─ Quebrar FunnelConfigTab em sub-rotas/sub-abas: Etapas · Produtos · Regras · Integrações
 ├─ Mover Meta Pixel/CAPI da aba "Configuração" do CRM pra aba do Funil de Tráfego
 ├─ Adicionar painel "Saúde do funil" no topo do LeadFunnelDetail
 └─ Botão "Aplicar template" (Lançamento / Perpétuo / Recompra) que cria etapas+regras de uma vez

Onda 2 (médio risco) ─ Reduzir conceitos duplicados
 ├─ Auto-vincular funil de leads ↔ funil de tráfego pelo product_id (já temos a infra)
 ├─ Unificar lead_funnel_products + lead_product_mappings numa UI só ("Produtos do funil" com sub-tab "Variações detectadas")
 └─ Wizard de "Novo funil" (4 passos) que cria tráfego + leads + webhook + 1ª automação opcional

Onda 3 (visão de longo prazo) ─ Observabilidade
 ├─ Tela única "Status de sincronização" (último webhook por plataforma, leads sem etapa, automações falhando)
 ├─ Visão "linha do tempo do lead" mostrando evento → regra aplicada → automação disparada
 └─ Alertas proativos (token Meta expirando, plataforma sem webhook há 24h, regra que nunca disparou)
```

### Detalhe técnico (referência)
- A onda 1 é só refator de UI — não toca em DB nem em edge functions. Risco baixo
- A onda 2 reaproveita `useLeadProductMappings` + `useLeadFunnelProducts` num único hook composto; auto-link usa `funnel_products.product_id` que já casa com `lead_funnel_products.product_id`
- A onda 3 precisa de: `meta_sync_log` (já existe), `wz_executions` (já existe), e uma view nova `v_funnel_health` agregando os dois + webhook timestamps

### O que eu recomendo começar agora
**Onda 1 inteira** numa única story — entrega ganho de UX visível em 1-2 dias de trabalho sem mexer em nada crítico. Depois decidimos onda 2 com base no feedback.

Quer que eu detalhe a Onda 1 em sub-tarefas concretas pra implementar, ou prefere ajustar o escopo antes (ex.: tirar templates, adicionar algo)?
