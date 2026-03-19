

## Plano: Limpar todos os dados de leads (manter funis e etapas)

### O que vai ser feito

Executar SQL no Supabase para deletar dados das 3 tabelas de leads na ordem correta (respeitando foreign keys), e limpar o log de sync.

### SQL para rodar no SQL Editor do Supabase

```sql
-- 1. Eventos
DELETE FROM public.lead_events;

-- 2. Posições no funil
DELETE FROM public.lead_stage_positions;

-- 3. Leads
DELETE FROM public.leads;

-- 4. Limpar logs de sync
DELETE FROM public.meta_sync_log;
```

Isso preserva os funis (lead_funnels) e etapas (lead_funnel_stages) configurados.

### Sobre os créditos

Lovable não oferece reembolso de créditos via chat. Para solicitar revisão de créditos, entre em contato com o suporte oficial:
- **Discord**: https://discord.com/channels/1119885301872070706/1280461670979993613
- **Email**: support@lovable.dev

Explique que a sincronização consumiu créditos sem resultado funcional e peça análise.

### Por que os 26k leads não apareceram no funil

O dashboard mostra 26.467 leads (imagem 1), mas o funil BASE DE LEADS mostra 0 (imagem 2). Isso indica que os leads foram inseridos na tabela `leads`, mas as `lead_stage_positions` não foram criadas corretamente (provavelmente o processo caiu antes de completar os inserts de posições). Sem posição, o funil não exibe o lead.

### Próximo passo

Após rodar o SQL, você pode importar manualmente pela funcionalidade "Importar Leads" que já existe na tela do funil.

