

# Deduplicação de Eventos no CRM (lead_events)

## Problema

Os webhooks da Guru (e potencialmente Ticto/Eduzz) disparam múltiplas vezes para a mesma transação. A RPC `sync_lead_from_sale` faz `INSERT INTO lead_events` sem nenhuma verificação de duplicata, gerando dezenas de eventos repetidos na timeline do lead (como os 8+ "canceled" no mesmo segundo que você viu).

## Causa raiz

1. O metadata enviado ao `sync_lead_from_sale` não inclui um identificador único da transação (como `transaction_id` ou `order_id`)
2. A tabela `lead_events` não tem constraint de unicidade
3. Nenhum check prévio antes do INSERT

## Solução em 2 partes

### Parte 1: Passar transaction_id no metadata dos webhooks

Alterar os 3 webhooks para incluir o ID da transação no metadata:

- **guru-webhook**: adicionar `transaction_id: record.id` (ou `record.transaction_id`)
- **ticto-webhook**: adicionar `transaction_id: record.platform_transaction_id`
- **eduzz-webhook**: adicionar `transaction_id` equivalente

### Parte 2: Deduplicar na RPC sync_lead_from_sale

Antes de cada `INSERT INTO lead_events`, adicionar um check:

```sql
-- Só insere se não existir evento com mesmo lead + funnel + event_name + transaction_id
IF NOT EXISTS (
  SELECT 1 FROM lead_events
  WHERE lead_id = v_lead_id
    AND funnel_id = v_base_funnel_id
    AND event_name = p_event_name
    AND metadata->>'transaction_id' = (v_enriched_meta->>'transaction_id')
) THEN
  INSERT INTO lead_events (...)
  VALUES (...);
END IF;
```

Repetir para o INSERT do funil de produto.

### Parte 3 (opcional): Limpar duplicatas existentes

Script SQL para remover eventos duplicados históricos, mantendo apenas o primeiro de cada grupo (lead + funnel + event_name + timestamp arredondado ao minuto + product_name).

## Arquivos alterados

1. `supabase/functions/guru-webhook/index.ts` — adicionar transaction_id ao metadata
2. `supabase/functions/ticto-webhook/index.ts` — idem
3. `supabase/functions/eduzz-webhook/index.ts` — idem
4. Nova migration SQL — atualizar a RPC `sync_lead_from_sale` com dedup
5. Script de limpeza (opcional) — remover duplicatas históricas

## Impacto

- Eventos futuros: zero duplicatas
- Timeline limpa e confiável
- Contagens de KPIs mais precisas
- Sem impacto no roteamento ou transição de etapas (a lógica continua a mesma, só não repete)

