# Importar leads do funil de tráfego para o funil de leads

Adicionar um botão na configuração do funil de leads que importa, em massa, leads vindos de um funil de tráfego (ex: Guia de Tinturas) para a primeira etapa do funil de leads atual.

## O que o usuário vê

- Na aba **Editar** do funil de leads, um novo card "Importar do funil de tráfego".
- Campos:
  - Select: funil de tráfego origem (lista `funnels` ativos).
  - Date range: período (default 01/01/2026 → hoje).
  - Checkbox: ✅ Incluir vendas atribuídas | ✅ Incluir leads com UTM/campanha do funil.
- Botão **Importar leads**.
- Após rodar: toast "X leads importados, Y já existiam no funil".

## Comportamento

1. Busca no Supabase:
   - **Vendas**: `v_all_sales` onde `funnel_id = <trafego>` e `created_at >= período`. Extrai `email`/`phone` de cada venda.
   - **UTM**: `leads` onde `utm_campaign` bate com keywords das campanhas do funil de tráfego (`meta_campaigns.name` cujo `funnel_id = <trafego>`), filtrado por `created_at >= período`.
2. Faz upsert em `leads` (por phone/email) — sem sobrescrever nome existente.
3. Para cada lead resolvido, cria `lead_stage_positions` no funil novo na **primeira etapa** (`sort_order ASC LIMIT 1`), pulando se já existe posição nesse funil.
4. Registra `lead_events` com `event_name = 'imported_from_traffic_funnel'` e metadata `{ source_funnel_id, period }`.

## Detalhes técnicos

- **Arquivo novo**: `src/components/lead-funnels/ImportFromTrafficFunnel.tsx` — card com form + botão.
- **Hook novo**: `src/hooks/useImportFromTrafficFunnel.ts` — mutation que:
  - Paginada (batches de 500) para evitar limite de 1000 do Supabase.
  - Resolve leads via `useEnsureLead` lógica reutilizada.
  - Insere posições em chunks.
- **Onde plugar**: dentro do `LeadFunnelEditor` (aba Editar do funil), abaixo de `ProductMappingConfig`.
- **Filtro de data**: usa `created_at` com offset de timezone local (padrão do projeto).
- **Dedupe**: confia no UNIQUE `(lead_id, funnel_id)` de `lead_stage_positions` — usa `upsert` com `ignoreDuplicates: true`.
- **Sem migração SQL** — todas as tabelas e constraints já existem.

## Fora de escopo

- Não atribui sellers automaticamente (lead entra como unassigned).
- Não dispara automações WhatsApp no import (evita disparo em massa indesejado).
- Não aplica mapeamentos product→stage (todos vão pra primeira etapa, como pedido).
