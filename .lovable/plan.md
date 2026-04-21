
## Sincronização de Grupos WhatsApp com etapas do CRM

Sim, faz sentido. A melhor prática aqui é separar em 3 movimentos:

```text
1. Sincronização manual/assistida
   Ver quem está no grupo agora e mover no Kanban

2. Convite assistido
   Convidar quem não está no grupo e mover para uma etapa escolhida

3. Monitoramento por webhook
   Quando a UAZAPI avisar entrada/saída do grupo, atualizar a etapa automaticamente
```

Ou seja: o grupo não vira a fonte principal do lead. O CRM continua mandando. O grupo vira um “validador de presença”.

## Fluxo final desejado

Dentro do funil de leads, na aba de configuração:

```text
Instância manual UAZAPI administradora do grupo
        ↓
Buscar grupos disponíveis
        ↓
Escolher quais grupos monitorar
        ↓
Escolher etapa para quem ESTÁ no grupo
        ↓
Opcional: escolher etapa para quem NÃO está no grupo
        ↓
Opcional: escolher etapa para quem FOI CONVIDADO
        ↓
Simular
        ↓
Aplicar movimentação
        ↓
Opcional: convidar ausentes
        ↓
Monitorar entrada/saída via webhook
```

## Como vai ficar na interface

Criar uma seção nova no funil:

```text
Grupos WhatsApp

Instância:
[ Wasap - d6210ceb-af74-4cda-929a-0b5c079dfd96 ]

Grupos monitorados:
[ ] Grupo Produto A
[ ] Grupo VIP
[ ] Grupo Aquecimento

Quando o lead ESTÁ no grupo:
Mover para: [ Entrou no Grupo ]

Quando o lead NÃO está no grupo:
[ ] Mover ausentes para uma etapa
Mover para: [ Não entrou no Grupo ]

Quando eu CONVIDAR o lead para o grupo:
[ ] Mover convidados para uma etapa
Mover para: [ Convite enviado / Aguardando entrada ]

Webhook de entrada/saída:
[ ] Atualizar automaticamente quando entrar no grupo
Ao entrar: [ Entrou no Grupo ]

[ ] Atualizar automaticamente quando sair do grupo
Ao sair: [ Saiu do Grupo / Não está no grupo ]

[Buscar grupos]
[Simular sincronização]
[Aplicar movimentação]
[Convidar ausentes]
```

## Comportamento de cada ação

### 1. Buscar grupos disponíveis

Usar a instância manual salva em `wz_instances`.

Endpoint UAZAPI confirmado pelo arquivo enviado:

```text
GET /group/list?force=true&noparticipants=true
```

Isso lista os grupos sem puxar todos os membros ainda, deixando a tela leve.

### 2. Simular sincronização

Ao clicar em **Simular**, o sistema:

1. Busca os grupos selecionados.
2. Para cada grupo, busca participantes com:

```text
POST /group/info
{
  "groupjid": "120363...@g.us",
  "force": true,
  "getInviteLink": true,
  "getRequestsParticipants": true
}
```

3. Pega os participantes em `Participants`.
4. Normaliza os telefones:
   - `JID`
   - `PhoneNumber`
   - `LID`, quando aplicável
5. Busca os contatos atuais do Kanban pelo `funnel_id`.
6. Compara por variações de telefone, seguindo a regra já usada no projeto:
   - com/sem `+`
   - com/sem DDI `55`
   - apenas dígitos
   - variações comuns de WhatsApp

Mostra uma prévia:

```text
Resultado da simulação

Leads no Kanban: 842
Encontrados no grupo: 613
Não encontrados no grupo: 229
Sem telefone válido: 18
Já estavam na etapa correta: 401

Vai mover para "Entrou no Grupo": 212
Vai mover para "Não entrou no Grupo": 229
Pode convidar: 211
Não pode convidar / telefone inválido: 18
```

Nenhum lead é movido nessa etapa.

### 3. Aplicar movimentação

Ao clicar em **Aplicar movimentação**, o sistema move:

```text
Quem está no grupo
→ etapa escolhida em "Quando o lead ESTÁ no grupo"

Quem não está no grupo
→ etapa escolhida em "Quando o lead NÃO está no grupo"
```

A etapa “não está no grupo” é opcional. Se não escolher, o sistema só move os encontrados.

Para cada lead movido:

- Atualiza `lead_stage_positions.stage_id`
- Atualiza `lead_stage_positions.entered_at`
- Cria evento em `lead_events`

Evento sugerido:

```json
{
  "event_name": "whatsapp_group_sync",
  "metadata": {
    "mode": "manual_sync",
    "matched": true,
    "group_ids": ["120363...@g.us"],
    "instance_id": "d6210ceb-af74-4cda-929a-0b5c079dfd96",
    "from_stage_id": "...",
    "to_stage_id": "..."
  }
}
```

### 4. Convidar ausentes

A ação **Convidar ausentes** será separada da movimentação, para evitar convite automático sem querer.

Endpoint UAZAPI confirmado pelo arquivo enviado:

```text
POST /group/updateParticipants
{
  "groupjid": "120363...@g.us",
  "action": "add",
  "participants": ["5511999999999"]
}
```

Depois de convidar/adicionar:

```text
Se sucesso:
  mover para etapa escolhida em "Quando eu CONVIDAR"

Se falhar:
  não mover automaticamente, mas registrar erro no log

Se privacidade impedir entrada:
  registrar como falha/pendente
```

A etapa de convidado pode ser algo como:

```text
Convite enviado
Aguardando entrar no grupo
Chamando para grupo
```

Isso é melhor do que mandar direto para “Entrou no Grupo”, porque o WhatsApp pode não adicionar a pessoa na hora por privacidade/limite.

### 5. Monitorar via webhook quem entrou/saiu do grupo

Sim, dá para monitorar, mas eu faria como complemento, não como única fonte de verdade.

O arquivo da UAZAPI mostra que o webhook suporta evento:

```text
groups
```

Hoje o webhook principal `uazapi-webhook` trata principalmente mensagens/status. A implementação vai adicionar tratamento para eventos de grupo.

Quando a UAZAPI enviar evento de entrada/saída:

```text
Lead entrou no grupo
→ mover para etapa "Entrou no Grupo"

Lead saiu/removido do grupo
→ mover para etapa "Saiu do Grupo" ou "Não está no grupo", se configurada
```

Se o payload da UAZAPI vier com estrutura diferente dependendo do evento, a função vai salvar o payload bruto no log e tentar extrair:

```text
groupjid
participant phone/JID
action: add/remove/join/leave
```

## Banco de dados

Criar migration com duas tabelas.

### `lead_funnel_group_sync_configs`

Guarda a configuração por funil:

```text
id
funnel_id
instance_id
group_ids jsonb
in_group_stage_id
not_in_group_stage_id nullable
invited_stage_id nullable
left_group_stage_id nullable
auto_move_on_join boolean
auto_move_on_leave boolean
is_active
created_at
updated_at
```

### `lead_funnel_group_sync_runs`

Guarda histórico das execuções:

```text
id
config_id
funnel_id
instance_id
mode
group_ids jsonb
total_positions
matched_count
missing_count
invalid_phone_count
moved_in_count
moved_out_count
invited_count
failed_invite_count
status
error_message
payload jsonb
created_at
created_by
```

## Edge Function

Criar função nova:

```text
supabase/functions/wz-group-sync/index.ts
```

Ela terá modos:

```text
list_groups
save_config
get_config
preview
apply
invite_missing
webhook_event
```

### Payload base

```json
{
  "mode": "preview",
  "funnel_id": "f0bff5cf-e956-4b00-b5a8-f60be742e028",
  "instance_id": "d6210ceb-af74-4cda-929a-0b5c079dfd96",
  "group_ids": ["120363...@g.us"],
  "in_group_stage_id": "...",
  "not_in_group_stage_id": "...",
  "invited_stage_id": "...",
  "left_group_stage_id": "..."
}
```

## Segurança

- Ações manuais exigem usuário logado.
- Apenas admin/gestor poderá aplicar movimentação em massa e convidar pessoas.
- A função valida se o funil existe antes de movimentar leads.
- Não move lead sem telefone válido.
- Não cria lead novo por causa do grupo.
- Não duplica posição no funil, respeitando a regra de `lead_stage_positions` única por lead/funil.
- Não remove lead do funil.
- Não convida automaticamente sem clique explícito.
- Webhook registra log mesmo quando não consegue identificar lead.
- Processamento em lotes para evitar timeout.

## Arquivos a criar

```text
src/components/lead-funnels/WhatsAppGroupSyncConfig.tsx
src/hooks/useWzGroupSync.ts
supabase/functions/wz-group-sync/index.ts
supabase/migrations/<timestamp>_create_lead_funnel_group_sync.sql
```

## Arquivos a alterar

```text
src/components/lead-funnels/FunnelConfigTab.tsx
src/types/leadFunnels.ts
src/types/wz-automation.ts
supabase/functions/uazapi-webhook/index.ts
```

## Ajuste no webhook da UAZAPI

Além da nova função, será necessário garantir que a instância monitore eventos de grupo.

Hoje a configuração de webhook usa eventos como:

```text
messages
messages_update
connection
```

Vamos incluir:

```text
groups
```

Para a instância manual, a configuração pode ser feita pela própria tela nova, com um botão:

```text
Ativar monitoramento de grupos nesta instância
```

Esse botão chamará a UAZAPI:

```text
POST /webhook
{
  "url": "<supabase>/functions/v1/uazapi-webhook",
  "enabled": true,
  "events": ["messages", "messages_update", "connection", "groups"]
}
```

## Resultado final

Você vai conseguir:

```text
1. Escolher a instância administradora do grupo.
2. Listar os grupos dela.
3. Escolher quais grupos fazem parte daquele funil.
4. Escolher a etapa para quem entrou.
5. Escolher a etapa para quem não entrou.
6. Escolher a etapa para quem foi convidado.
7. Simular antes de mexer no Kanban.
8. Aplicar a movimentação.
9. Convidar ausentes.
10. Monitorar entrada/saída por webhook e mover automaticamente.
```

## Melhor prática recomendada

O fluxo mais seguro para lançamento/grupo VIP/desafio é:

```text
Lead comprou / se cadastrou
        ↓
CRM coloca no Kanban
        ↓
Equipe convida para grupo
        ↓
Move para "Convite enviado"
        ↓
Webhook ou sincronização confirma entrada
        ↓
Move para "Entrou no Grupo"
        ↓
Se não entrou, fica em "Não entrou no Grupo" / "Aguardando entrada"
```

Isso evita bagunçar o Kanban e cria uma operação muito clara para a equipe.
