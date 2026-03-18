

## Plano: Limpar Duplicados + Corrigir Sync

### Problemas Identificados

1. **BASE DE LEADS sem stages** -- o funil `84bab083...` existe mas `lead_funnel_stages: []` esta vazio. A sync tentou criar stages mas falhou (provavelmente porque o funil ja existia de uma criacao anterior sem stages).
2. **936 leads > 848 vendas** -- deduplicacao por email e case-sensitive (ex: "User@mail.com" vs "user@mail.com" cria 2 leads).
3. **lead_stage_positions: []** -- nenhum lead foi posicionado no funil.

### Ordem de Execucao

**Passo 1: SQL manual no Supabase (voce executa)**

Criar os stages que faltam no funil BASE DE LEADS existente e limpar leads duplicados:

```sql
-- 1. Criar stages no funil existente
INSERT INTO lead_funnel_stages (funnel_id, name, color, sort_order) VALUES
('84bab083-75f7-4e0c-a120-9f20023e4c02', 'Novo', '#94a3b8', 0),
('84bab083-75f7-4e0c-a120-9f20023e4c02', 'Comprador', '#22c55e', 1),
('84bab083-75f7-4e0c-a120-9f20023e4c02', 'Recorrente', '#3b82f6', 2),
('84bab083-75f7-4e0c-a120-9f20023e4c02', 'VIP', '#f59e0b', 3);

-- 2. Deletar leads duplicados (manter o mais antigo por email lowercase)
DELETE FROM leads WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY LOWER(email) ORDER BY created_at ASC
    ) as rn
    FROM leads
    WHERE email IS NOT NULL
  ) t WHERE rn > 1
);

-- 3. Deletar leads sem email E sem telefone (lixo)
DELETE FROM leads WHERE email IS NULL AND phone IS NULL;
```

**Passo 2: Corrigir Edge Function (eu implemento)**

Atualizar `sync-leads-from-sales/index.ts` para:
- Usar `LOWER(email)` na deduplicacao (normalizar emails para lowercase antes de comparar)
- Verificar se stages ja existem antes de criar
- Filtrar apenas transacoes com status aprovado/pago

**Passo 3: Re-deploy e testar**

Apos as correcoes, re-deploy da Edge Function e clicar em "Sincronizar Base" para posicionar todos os leads no funil.

### Resumo

Voce precisa executar o SQL do Passo 1 no Supabase SQL Editor. Depois eu corrijo a Edge Function (Passo 2) e voce faz o deploy manual.

