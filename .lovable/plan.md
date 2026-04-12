

## Auditoria Completa - Automações WhatsApp

### Resumo: o que funciona e o que falta

---

### FRONTEND (UI do Canvas) - Tudo OK

| Componente | Drag & Drop | Config Panel | Visual do Nó | Status |
|---|---|---|---|---|
| **Trigger** (9 tipos) | OK | OK (tipo, plataforma, produto, oferta) | OK | OK |
| **WhatsApp** | OK | OK (instância, variações, blocos, skip if replied) | OK | OK |
| **Timer** | OK | OK (delay + unidade) | OK | OK |
| **Condição If/Else** | OK | OK (variável, operador, valor) | OK (SIM/NAO handles) | OK |
| **Parar Fluxo** | OK | N/A | OK | OK |
| **Cancelar Anteriores** | OK | N/A | OK | OK |
| **Anotação** | OK | OK (texto + cor) | OK | OK |
| **Divisor A/B** | OK | OK (paths + slider %) | OK (handles múltiplos) | OK |
| **Smart Delay** | OK | OK (horário, dia, dias úteis) | OK | OK |
| **Webhook HTTP** | OK | OK (método, URL, headers, body) | OK | OK |
| **Tag** | OK | OK (ação + nome) | OK | OK |
| **Goto** | OK | OK (ID + label destino) | OK | OK |

Sidebar, drag-and-drop, save/load no Supabase (`wz_flows` JSONB) -- tudo funcional.

---

### BACKEND (Edge Functions) - Problemas encontrados

O `wz-executor` processa os nós em runtime. Atualmente ele suporta **apenas 4 tipos**:

| Tipo | Suportado no executor? | Problema |
|---|---|---|
| `whatsapp` | SIM | OK |
| `timer` | SIM | OK |
| `condition` | SIM | OK |
| `stop` | SIM (incl. cancel_previous) | OK |
| **`ab_split`** | **NAO** | Cai no fallback e pula para o próximo edge genérico, ignorando a lógica de % |
| **`smart_delay`** | **NAO** | Tratado como nó genérico, avança imediatamente sem esperar horário/dia |
| **`webhook`** | **NAO** | Avança sem disparar HTTP |
| **`tag`** | **NAO** | Avança sem marcar/remover tag |
| **`goto`** | **NAO** | Avança pelo edge normal, ignora targetNodeId |
| `note` | N/A | Correto -- anotação não deve ser processada |
| `trigger` | N/A | Processado pelo `wz-receiver`, não pelo executor |

**Impacto**: Os 5 novos nós aparecem no canvas e salvam no banco, mas quando o fluxo roda de verdade via `wz-executor`, eles são ignorados silenciosamente.

---

### Correções necessárias no `wz-executor`

Adicionar handlers para cada novo tipo no bloco `PROCESS NODE` (linhas 123-165):

1. **`ab_split`**: Ler `paths` com %, sortear random 0-100, selecionar o `path_X` handle correspondente, buscar edge com `sourceHandle === "path_X"` e avançar

2. **`smart_delay`**: Calcular `run_at` baseado em `targetTime`, `targetDay`, `businessDaysOnly`. Criar `wz_scheduled_steps` (igual ao timer) e parar execução

3. **`webhook`**: Fazer `fetch()` para `data.url` com `data.method`, parsear `data.headers` (JSON string), substituir variáveis no `data.body`, executar a chamada, e avançar

4. **`tag`**: Atualizar metadata do lead (via `supabase.from('leads').update(...)` ou RPC) para adicionar/remover tag, e avançar

5. **`goto`**: Ler `targetNodeId` do data, e chamar `advanceToNext()` diretamente para esse nó (bypass da busca por edge)

6. **`note`**: Adicionar skip explícito (avançar sem processar) para que não quebre se alguém conectar um edge acidentalmente

### Supabase - Nenhuma migration necessária

As tabelas `wz_flows`, `wz_executions`, `wz_scheduled_steps` já existem e suportam os novos tipos via JSONB. Nenhuma coluna nova é necessária.

### Plano de implementação

1. **Atualizar `supabase/functions/wz-executor/index.ts`** com os 6 handlers acima
2. **Deploy manual** no Dashboard do Supabase (copiar/colar o código atualizado)

O código do frontend está 100% funcional. A única lacuna é o backend que não processa os novos tipos de nó.

