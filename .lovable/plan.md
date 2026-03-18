

## Diagnóstico

Pelos screenshots, há 3 problemas visíveis:

1. **Rose Lopes (Comprador) tem 0 eventos** — a edge function deployada no Supabase não é a versão atualizada do repositório
2. **Cleyde Malta mostra "pix_created"** — o nome do evento não foi mapeado (versão antiga da function rodou)
3. **Data 18/03 no card** — está usando a data de import, não a data real da compra (`purchased_at`)
4. **Timeline mostra nomes técnicos** — o componente `LeadTimeline.tsx` não traduz os event_name para labels amigáveis

## Plano

### 1. Edge Function (`sync-leads-from-sales/index.ts`)

A lógica já está correta no repositório (mapeia status, cria evento "criado", usa `purchased_at` como `created_at`). O problema é que **a versão deployada no Supabase é antiga**. Você precisa copiar e deployar novamente.

Única melhoria adicional: renomear o evento obrigatório de `"criado"` para `"lead_importado"` para ficar mais claro no contexto de sync.

### 2. Timeline UI (`src/components/lead-funnels/LeadTimeline.tsx`)

Atualizar para:

a) **Mapear event_name → label amigável**:
- `criado` / `lead_importado` → "Lead Importado"
- `pago` → "Pagamento Aprovado"  
- `pix_gerado` → "PIX Gerado"
- `rejeitado` → "Pagamento Rejeitado"
- `cancelado` → "Cancelado"
- `expirado` → "Expirado"
- `reembolsado` → "Reembolsado"
- `chargeback` → "Chargeback"
- `pix_created` (legado) → "PIX Gerado"
- `authorized` (legado) → "Pagamento Aprovado"

b) **Ícones por tipo de evento**: `UserPlus` para criado/importado, `CreditCard` para pago/pix, `ShoppingCart` para compra, `XCircle` para rejeitado/cancelado/expirado.

c) **Cores por tipo**: verde para pagos, amarelo para pix_gerado, vermelho para rejeitado/cancelado, azul para criado.

d) **Usar `original_date` do metadata** como fallback para exibir a data correta quando o DB não aceitou `created_at` explícito.

### 3. LeadCard (`src/components/lead-funnels/LeadCard.tsx`)

O card mostra "18/03 11:39" que é `entered_at` — isso já deveria estar correto se a edge function usar `purchased_at` como `entered_at`. Confirmado que o código faz isso (linha 259). O problema é novamente a versão deployada.

### Arquivos a editar
1. `supabase/functions/sync-leads-from-sales/index.ts` — renomear "criado" → "lead_importado"
2. `src/components/lead-funnels/LeadTimeline.tsx` — labels amigáveis, ícones, cores, fallback de data

### Ação necessária do usuário
Após implementação, copiar a edge function atualizada e deployar no Supabase Dashboard, depois rodar "Sincronizar Base" no Dashboard de Leads.

