

## Teste End-to-End: Guia Passo a Passo

O browser automatizado não compartilha sua sessão de login. Vou preparar um plano para você testar manualmente e, em paralelo, corrigir qualquer problema encontrado.

### Passo 1 — Criar Campanha
1. Na página `/lead-campaigns`, clique em **"+ Campanha"**
2. Preencha um nome (ex: "Teste E2E") e salve

### Passo 2 — Criar Funil
1. Clique em **"+ Novo Funil"**
2. Preencha: nome "Funil Teste", selecione a campanha criada, salve
3. Clique no funil criado para abrir o detalhe

### Passo 3 — Configurar Stages
1. Na aba **"Configuração"**, adicione 3 etapas:
   - "Novo Lead" (sort_order 0)
   - "Engajado" (sort_order 1)
   - "Convertido" (sort_order 2)
2. Adicione uma regra de transição:
   - Evento: `signup` → Move para "Novo Lead"
   - Evento: `purchase` → De "Novo Lead" para "Convertido"
3. Salve

### Passo 4 — Copiar Token e Enviar Webhook
1. Na aba **"Webhook"**, copie o token e a URL
2. Execute no terminal:

```bash
curl -X POST "https://emfbocpmphtftqcezaib.supabase.co/functions/v1/webhook-lead" \
  -H "Content-Type: application/json" \
  -H "X-Funnel-Token: SEU_TOKEN_AQUI" \
  -d '{"event":"signup","phone":"+5511999990001","name":"Lead Teste E2E"}'
```

### Passo 5 — Verificar Kanban
1. Volte para a aba **"Kanban"**
2. O lead "Lead Teste E2E" deve aparecer na coluna "Novo Lead"

### Passo 6 — Testar Transição
```bash
curl -X POST "https://emfbocpmphtftqcezaib.supabase.co/functions/v1/webhook-lead" \
  -H "Content-Type: application/json" \
  -H "X-Funnel-Token: SEU_TOKEN_AQUI" \
  -d '{"event":"purchase","phone":"+5511999990001"}'
```
Recarregue o Kanban — o lead deve ter movido para "Convertido".

### O que vou implementar se algo falhar

Se durante o teste você encontrar erros, me avise com o passo específico que falhou e eu corrijo imediatamente. Problemas comuns que posso resolver:
- **Campanha/Funil não salva** → Verificar hooks e RLS policies
- **Webhook retorna erro** → Verificar edge function e token
- **Lead não aparece no Kanban** → Verificar query de `lead_stage_positions`
- **Transição não funciona** → Verificar `stage_transition_rules` matching

