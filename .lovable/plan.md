

# Flow Editor Completo — Estilo Funnelytics

## Problema atual

O Flow Editor é apenas um visualizador estático. Os stages vêm da aba "Configuração" e aparecem soltos no canvas sem interação real. Não dá para adicionar nodes, configurar páginas, nem ver métricas em tempo real.

## O que vamos construir

Um editor visual completo com toolbar, drag-and-drop de novos elementos, configuração de cada node, e métricas em tempo real por etapa.

---

### 1. Toolbar lateral (palette de nodes)

Barra lateral esquerda dentro do editor com elementos arrastáveis:

- **Fontes de tráfego**: Instagram, Facebook, Google Ads, WhatsApp, YouTube, TikTok, Email, Orgânico
- **Tipos de página**: Captura, Vendas, Checkout, Obrigado, Upsell, Downsell, Conteúdo
- **Ações**: WhatsApp (enviar msg), Email (enviar), Delay (esperar X dias), Condição (if/else)

O usuário arrasta da toolbar para o canvas para criar novos nodes.

### 2. Nodes ricos com configuração

Ao clicar em um node, abre um painel lateral direito (drawer) com:

- **Nome** editável
- **Tipo de página** (captura / vendas / checkout / obrigado / upsell / downsell)
- **URL da página** (para tracking)
- **Cor** personalizável
- **Thumbnail** da página (upload ou auto-gerado)
- **Métricas em tempo real**: visitantes, conversões, taxa de conversão (vindas do `leadCounts`)

### 3. Nodes visuais melhorados

Cada tipo de node terá visual distinto:

- **Fonte de tráfego**: ícone + nome + badge com volume
- **Página**: thumbnail (ou ícone do tipo) + nome + métricas (visitantes / conversão / %)
- **Ação**: ícone de ação + label

### 4. Edges com métricas

As conexões entre nodes mostrarão:
- Contagem de leads que passaram por aquela transição
- Percentual de conversão entre etapas
- Animação de fluxo (já existe)

### 5. Persistência completa

- Salvar posições dos nodes (já tem `position_x/y` no banco)
- Salvar edges no banco (`funnel_edges` já existe)
- Salvar source nodes (`funnel_source_nodes` já existe)
- Auto-save ao mover/conectar nodes

### 6. Métricas em tempo real

- Polling dos `leadCounts` a cada 30s (ou Realtime via `lead_stage_positions`)
- Cada node de stage atualiza o contador automaticamente
- Edges mostram o fluxo de conversão entre etapas adjacentes

---

### Mudanças técnicas

**Novos componentes:**
- `src/components/lead-funnels/flow/FlowToolbar.tsx` — palette lateral de nodes arrastáveis
- `src/components/lead-funnels/flow/PageNode.tsx` — node rico com thumbnail, tipo e métricas
- `src/components/lead-funnels/flow/ActionNode.tsx` — node de ação (whatsapp, email, delay)
- `src/components/lead-funnels/flow/SourceNode.tsx` — node de fonte de tráfego melhorado
- `src/components/lead-funnels/flow/NodeConfigPanel.tsx` — drawer de configuração ao clicar
- `src/components/lead-funnels/flow/ConversionEdge.tsx` — edge customizado com métricas

**Arquivos editados:**
- `FunnelFlowEditor.tsx` — refatorar para incluir toolbar, config panel, drag-to-add, auto-save
- `LeadFunnelDetail.tsx` — passar dados de source_nodes e edges reais do banco
- `useLeadFunnels.ts` — adicionar hooks para CRUD de source_nodes e edges
- `leadFunnels.ts` (types) — adicionar `page_type` enum ao stage

**Migration SQL (novo):**
- Adicionar coluna `page_type` na tabela `lead_funnel_stages` (enum: capture, sales, checkout, thankyou, upsell, downsell, content)
- Adicionar coluna `visitors_count` para cache de métricas

**Sem dependências novas** — tudo usa `@xyflow/react` que já está instalado.

