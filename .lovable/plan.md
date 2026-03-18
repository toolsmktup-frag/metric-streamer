

## Diagnostico

Encontrei dois problemas criticos:

### 1. Query key incorreta no refresh automatico
No `LeadsDashboard.tsx` linha 28, apos o sync completar, o codigo invalida `['leadStats']` mas o hook `useLeadStats` usa `['lead-stats']`. Resultado: **o dashboard nunca atualiza apos a sincronizacao**.

### 2. Edge Function nao limpa dados antes de re-sincronizar
A funcao atual apenas adiciona leads novos e pula existentes. Como voce quer reconstruir do zero, precisa deletar leads, posicoes e eventos antes de processar.

## Plano de Implementacao

### Passo 1: Corrigir query key + melhorar feedback no dashboard
**Arquivo:** `src/pages/LeadsDashboard.tsx`
- Trocar `['leadStats']` por `['lead-stats']`
- Tambem invalidar `['all-leads']`, `['leads-by-funnel']`, `['funnel-lead-counts']`
- Mostrar toast com resultado real do sync (aguardar resposta sincrona em vez de background)

### Passo 2: Atualizar Edge Function para reconstruir do zero
**Arquivo:** `supabase/functions/sync-leads-from-sales/index.ts`
- Adicionar limpeza completa no inicio: deletar `lead_events`, `lead_stage_positions`, e `leads` da org
- Processar sync normalmente (criar leads, posicionar, criar eventos)
- Retornar resultado sincrono (remover `waitUntil` para que o usuario veja o resultado direto)
- Retornar contagens no response body para exibir no toast

### Resultado esperado
Ao clicar "Sincronizar Base":
1. Deleta todos os leads/posicoes/eventos existentes
2. Recria leads a partir das vendas aprovadas (com deduplicacao case-insensitive)
3. Posiciona todos no estagio "Novo" do funil BASE DE LEADS
4. Mostra toast com "X leads criados, X eventos registrados"
5. Dashboard atualiza automaticamente

**Nota:** Voce precisara copiar o codigo atualizado da Edge Function e fazer deploy manual no Supabase.

