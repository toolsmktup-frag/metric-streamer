

## Plano: Sincronizar importação de leads com BASE DE LEADS + Inteligência

### Problema
O botão "Importar Leads" posiciona leads apenas no funil alvo. Não sincroniza com BASE DE LEADS nem com a inteligência de cliente.

### Solução
Após inserir/atualizar cada lead no funil alvo, chamar a RPC `sync_lead_from_sale` para cada lead com status de venda (approved/authorized). Isso automaticamente:
- Posiciona na BASE DE LEADS (se não existir lá)
- Registra evento na BASE DE LEADS
- Roteia para funil do produto (se mapeado)

### Arquivo: `src/hooks/useImportLeads.ts`

**Mudança**: Após o bloco de inserção de eventos (linha ~396), adicionar chamada batch à RPC `sync_lead_from_sale` para leads com status de venda aprovada.

```typescript
// Após inserir eventos, sincronizar leads aprovados com BASE DE LEADS
const approvedStatuses = ['authorized', 'approved', 'paid', 'aprovada', 'aprovado', 'pago'];
const leadsToSync = Array.from(dedupMap.values()).filter(({ lead }) => {
  const status = ((lead.metadata.status as string) || '').toLowerCase().trim();
  return approvedStatuses.includes(status);
});

for (const { lead } of leadsToSync) {
  const leadId = leadIdMap.get(lead);
  if (!leadId) continue;
  
  await supabase.rpc('sync_lead_from_sale', {
    p_phone: lead.phone,
    p_email: lead.email,
    p_name: lead.name,
    p_utm_source: lead.utm_source,
    p_utm_medium: lead.utm_medium,
    p_utm_campaign: lead.utm_campaign,
    p_utm_content: lead.utm_content,
    p_utm_term: lead.utm_term,
    p_event_name: 'purchase',
    p_product_name: (lead.metadata.product_name as string) || null,
    p_purchased_at: toDatabaseTimestamp(lead.metadata.purchased_at),
    p_metadata: {
      source: 'spreadsheet_import',
      product_name: lead.metadata.product_name || null,
      amount: lead.metadata.amount || null,
      platform: lead.metadata.platform || null,
    },
  }).catch(err => console.error('Sync lead error (non-fatal):', err));
}
```

### Comportamento resultante

1. **Upload da planilha Guru no Recompra** → leads entram no Recompra com eventos na timeline
2. **Sync automático** → leads aprovados vão para BASE DE LEADS (dedup pela RPC)
3. **Inteligência** → a RPC já posiciona no funil do produto se houver mapeamento
4. **Sem duplicatas** → a RPC faz dedup por email/phone case-insensitive
5. **Webhook futuro** → quando chegar pelo webhook, o lead já existe, só atualiza

### Nenhuma mudança de SQL necessária
A RPC `sync_lead_from_sale` já existe e faz tudo que precisa.

