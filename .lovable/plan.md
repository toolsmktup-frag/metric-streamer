

## Auditoria Completa: Modulo Automacoes WhatsApp

### Status Geral

O modulo esta **estruturalmente completo** para o fluxo basico (webhook -> trigger -> mensagem WhatsApp). Porem ha **1 problema critico** e **3 problemas importantes**.

---

### CRITICO: Nao existe `wz-scheduler` (Timer nao funciona)

O `wz-executor` cria registros em `wz_scheduled_steps` com `run_at` e `status = 'pending'`, mas **nao existe nenhuma funcao que processe esses agendamentos**. Ou seja:

- Fluxos com no de **Timer** (espera 1h, espera 1 dia, etc.) ficam **presos para sempre** no status `waiting`
- O no apos o timer **nunca sera executado**

**Solucao**: Criar uma Edge Function `wz-scheduler` que:
1. Consulta `wz_scheduled_steps` onde `status = 'pending'` e `run_at <= now()`
2. Para cada step, chama `wz-executor` com o proximo no (via edges)
3. Marca o step como `completed`
4. Configurar um cron job no Supabase (pg_cron ou cron externo) para chamar essa funcao a cada 1-2 minutos

---

### IMPORTANTE 1: Instancias WZ vs Instancias WhatsApp (tabelas separadas)

O `WzInstanceManager` usa a tabela `wz_instances` (api_url + api_key). O `WzNodeConfigPanel` busca instancias de `wz_instances` via `useWzInstances`. Porem o modulo de WhatsApp principal (chat) usa `whatsapp_instances` (tabela diferente com `organization_id`, `api_token`, etc.).

**Risco**: O usuario pode ter instancias configuradas no chat que nao aparecem na automacao e vice-versa. Funciona, mas requer configuracao duplicada.

**Sugestao**: Unificar eventualmente, ou ao menos oferecer importacao cruzada.

---

### IMPORTANTE 2: `wz_instances` nao tem `organization_id`

A tabela `wz_instances` nao tem filtro por organizacao. A RLS permite que qualquer usuario autenticado veja todas as instancias de automacao. Em ambiente multi-tenant isso e um problema de seguranca.

---

### IMPORTANTE 3: `wz_flows` nao tem `organization_id`

Mesmo problema. Qualquer usuario autenticado pode ver/editar todos os fluxos de automacao de qualquer organizacao.

---

### O que FUNCIONA hoje (sem timer)

```text
Ticto/Guru webhook
  └─> ticto-webhook / guru-webhook
       └─> wz-receiver (await, nao fire-and-forget)
            ├─ Detecta plataforma
            ├─ Normaliza payload (phone, produto, status, PIX, boleto)
            ├─ Busca fluxos ativos (wz_flows.is_active = true)
            ├─ Filtra por trigger (tipo evento + product_id)
            ├─ Deduplicacao atomica (UUID v5 do event_id)
            ├─ Auto-cancel pre-venda se compra aprovada
            ├─ Cria execucao em wz_executions
            └─> wz-executor (await)
                 ├─ WhatsApp node: envia via UAZAPI (/send/text, /send/media)
                 │   ├─ Variavel substitution ({{nome}}, {{codigo_pix}}, etc.)
                 │   ├─ Multi-bloco (varias bolhas)
                 │   ├─ skipIfReplied
                 │   └─ Delay humanizado entre blocos
                 ├─ Condition node: avalia e segue yes/no
                 ├─ Stop node: para ou cancela anteriores
                 └─ Timer node: agenda mas NAO EXECUTA (bug)
```

---

### Plano de Implementacao

**Passo 1 -- Criar `wz-scheduler` Edge Function**
- Nova funcao em `supabase/functions/wz-scheduler/index.ts`
- Consulta steps pendentes com `run_at <= now()`
- Para cada step: busca execucao, busca flow, encontra o proximo no via edges, chama `wz-executor`
- Marca step como `completed` e execucao volta a `running`

**Passo 2 -- Configurar cron**
- Fornecer SQL para criar um pg_cron job que chama `wz-scheduler` a cada 1 minuto
- Alternativa: usar `pg_net` + `pg_cron` para chamar a Edge Function via HTTP

**Passo 3 (opcional) -- Adicionar `organization_id` a `wz_instances` e `wz_flows`**
- Migration para adicionar a coluna
- Atualizar RLS policies
- Atualizar hooks do frontend para filtrar por org

### Arquivos a criar/editar
- **Criar**: `supabase/functions/wz-scheduler/index.ts`
- **Criar**: `docs/migration_wz_scheduler_cron.sql` (pg_cron setup)
- Nenhuma alteracao no frontend necessaria para o scheduler

### Para voce testar hoje (sem timer)
Se seu fluxo usa apenas Trigger -> WhatsApp (sem Timer), esta pronto:
1. Crie uma instancia WZ com URL e token da UAZAPI
2. Crie um fluxo com trigger (ex: `pix_generated` + product_id do seu produto)
3. Adicione um no WhatsApp, selecione a instancia, escreva a mensagem
4. Ative o fluxo
5. Simule um webhook da Ticto/Guru -- a mensagem deve ser enviada

Se precisar de Timer, precisamos implementar o scheduler primeiro.

