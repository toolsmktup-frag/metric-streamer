

# Importar Leads + Histórico de Compras no Funil

## Visão Geral

Duas grandes entregas:
1. **Importar leads da planilha Guru** diretamente para um funil/etapa
2. **Enriquecer LeadCard e LeadTimeline** com histórico de compras do `customer_purchases`

A planilha do Guru tem colunas como `nome contato`, `email contato`, `telefone contato`, `valor líquido`, `nome produto`, `status`, `data pedido`, UTMs, etc. O sistema já tem a tabela `customer_purchases` com todos esses dados de compra — basta cruzar por email/telefone.

## Implementação

### 1. Importação de Leads via Planilha

**Novo arquivo `src/components/lead-funnels/ImportLeadsDialog.tsx`**
- Dialog com upload de arquivo (.xlsx/.csv)
- Parsing via biblioteca `xlsx`
- Mapeamento automático das colunas Guru → campos do lead:
  - `nome contato` → name, `email contato` → email, `telefone contato` → phone, UTMs
- Seletor de etapa destino no funil
- Preview dos primeiros registros antes de confirmar
- Importação em lote: insert em `leads` (com deduplicação por email/phone) + `lead_stage_positions` + `lead_events` (evento "import")
- Barra de progresso durante importação

**Novo arquivo `src/hooks/useImportLeads.ts`**
- Mutation que recebe array de leads + funnelId + stageId
- Para cada lead: upsert em `leads`, insert em `lead_stage_positions`, insert em `lead_events`
- Processamento em lotes de 20

**Editar `src/pages/LeadFunnelDetail.tsx`**
- Adicionar botão "Importar Leads" no header ao lado do título

### 2. Histórico de Compras no Lead

**Novo hook `src/hooks/useLeadPurchases.ts`**
- Recebe email e/ou phone do lead
- Busca em `customer_purchases` por match de email ou phone (via campo no `raw_data` ou join com tabela de clientes)
- Retorna: lista de compras, total gasto, quantidade de compras

**Enriquecer `LeadCard.tsx`** (card no Kanban)
- Exibir no card: valor total de compras (ex: "R$ 353,74") em verde
- Badge com quantidade de compras (ex: "×13")
- Exibir tag do evento que trouxe o lead (ex: "import")
- Visual igual ao screenshot de referência: avatar com iniciais, valor destacado, badge de contagem

**Enriquecer `LeadTimeline.tsx`** (sheet lateral ao clicar no lead)
- Seção **Compras**: card com receita total, quantidade, badge "Multi-comprador" se > 1 produto
- Lista de produtos comprados com valor, data, plataforma, tipo (assinatura/avulso)
- Seção **Jornada nos Funis**: em quais funis esse lead está, em qual etapa, há quanto tempo
- Seção **Timeline de Eventos**: já existe, mas enriquecer os eventos de compra com ícone de carrinho, valor, tempo desde evento anterior ("+32d 0h 59min"), plataforma de origem
- Dots coloridos: verde para compra, azul para eventos de funil

### 3. Busca e Filtros no Kanban

**Editar `KanbanBoard.tsx`**
- Barra de busca por nome, email ou telefone
- Ordenação: "Mais recentes" e "Maior valor" (baseado no total de compras)
- Contador de leads visíveis vs total (ex: "mostrando 200")

## Arquivos

| Arquivo | Ação |
|---------|------|
| `src/components/lead-funnels/ImportLeadsDialog.tsx` | Criar |
| `src/hooks/useImportLeads.ts` | Criar |
| `src/hooks/useLeadPurchases.ts` | Criar |
| `src/components/lead-funnels/LeadCard.tsx` | Editar — adicionar valor, badge, avatar |
| `src/components/lead-funnels/LeadTimeline.tsx` | Editar — seções de compras e jornada |
| `src/components/lead-funnels/KanbanBoard.tsx` | Editar — busca, filtros, ordenação |
| `src/pages/LeadFunnelDetail.tsx` | Editar — botão importar |
| `package.json` | Editar — adicionar `xlsx` |

Sem migrations necessárias — `customer_purchases` e `leads` já existem.

