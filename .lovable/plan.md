# Automações por coluna do funil — 3 peças que faltam

Hoje os triggers da automação são todos por **evento** (signup, purchase, pix...). Não tem trigger "entrou na coluna X", nem "está na coluna X" pra puxar lead que já existe. Pra fechar o caso do Webinário (e qualquer outro funil de cadência), precisamos de **3 peças**:

## Peça 1 — Novo gatilho: "Entrou na coluna"

No `WzTriggerNode`, adicionar opção `stage_entered`:
- Seletor de **funil**
- Seletor de **coluna(s)** (multi)
- Toggle: "Disparar também pra leads que já estão" → faz **backfill** (opcional, ver Peça 3)

**Como dispara:** sempre que `lead_stage_positions` é inserido/atualizado pra uma das colunas selecionadas, o `wz-receiver` cria uma execução do flow com `trigger_event = 'stage_entered'` e contexto do lead.

Implementação: trigger de banco em `lead_stage_positions` (AFTER INSERT/UPDATE de `stage_id`) que chama `pg_net` → edge function `wz-stage-trigger` → cria execução.

## Peça 2 — Novo nó: "Mover para coluna"

`WzMoveStageNode`:
- Seletor de funil (default: do trigger)
- Seletor de coluna destino
- Executor no `wz-scheduler`: upsert em `lead_stage_positions` + grava `lead_events` (`stage_change`, `moved_by: 'automation'`).

Com isso + o `WzWebhookNode` que já existe, você monta:

```
[Trigger: entrou em "Aula do Dia 1"]
   ↓
[Aguardar 24h]
   ↓
[Mover para "Aula do Dia 2"]
   ↓
[HTTP → n8n com {{phone}}, {{stage_name}}]
   ↓
[Aguardar 24h]
   ↓
[Mover para "Aula do Dia 3"]
   ↓ ...
```

## Peça 3 — "Enrolar" leads existentes na automação

Esse é o ponto que você levantou: "como faço o lead que JÁ está no webinário entrar no fluxo agora?".

Botão no flow editor: **"Aplicar a leads existentes"**, abre modal com:
- Filtro por **funil + coluna(s)** (multi-select)
- Filtros extras: data de entrada na coluna (últimos X dias), tags, UTM
- Preview: "X leads serão adicionados"
- Botão **"Adicionar à automação"** → cria N execuções (uma por lead), começando do nó após o trigger

Backend: nova edge function `wz-bulk-enroll`:
- Recebe `flow_id` + filtros
- Faz `SELECT lead_id FROM lead_stage_positions WHERE funnel_id = ? AND stage_id IN (?)`
- Cria execuções em batch (chunks de 500) com deduplicação (não enrola lead que já tem execução ativa naquele flow)

## Resumo do que muda

| Arquivo | Mudança |
|---|---|
| `WzTriggerNode` + config panel | Adicionar tipo `stage_entered` com funil/colunas |
| `WzMoveStageNode` (novo) | Nó visual + ícone + paleta |
| `wz-scheduler` (edge function) | Handler pro `node_type === 'move_stage'` |
| `wz-stage-trigger` (edge function nova) | Cria execução quando lead entra em coluna mapeada |
| Migration | Trigger SQL em `lead_stage_positions` → `pg_net` |
| `wz-bulk-enroll` (edge function nova) | Enrolar leads existentes em batch |
| `BulkEnrollModal` (componente novo) | UI dos filtros + preview + confirmar |
| Botão no canvas/lista de flows | Abre o modal |

## Ordem sugerida de entrega
1. **Peça 2** primeiro (nó "Mover para coluna") — sozinho já vale pra fluxos que começam de `signup`/`purchase`
2. **Peça 3** (bulk enroll) — destrava o caso "tenho 500 leads parados, joga eles no fluxo"
3. **Peça 1** (trigger `stage_entered`) — fecha o ciclo, automação reage quando você arrasta lead manual no kanban

## Pergunta pra fechar
Topa essa ordem (Mover → Bulk Enroll → Trigger de coluna), ou prefere atacar primeiro o **Bulk Enroll** que é o que mais te dói agora pros leads já parados no Webinário?
