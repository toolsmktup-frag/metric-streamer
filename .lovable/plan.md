

## Corrigir eventos "Carrinho Abandonado" e "PIX Gerado" no CRM

### Problema 1: Bug no normalizeStatus do wz-receiver
O mapa de normalização em `wz-receiver/index.ts` não inclui `abandoned_cart`, que é o valor que o ticto-webhook envia. Triggers configurados como `cart_abandoned` nunca dão match.

### Problema 2 (possível): stage_transition_rules
Se o funil "RECOMPRA - POTES" não tiver regras de transição para `pix_generated` → "Pix / Boleto Gerado" e `abandoned_cart` → "Recuperar", os leads entram mas ficam parados no primeiro stage.

### Correção

**Arquivo: `supabase/functions/wz-receiver/index.ts`**
- Adicionar `abandoned_cart: "cart_abandoned"` ao mapa `normalizeStatus` (linha ~293)
- Isso garante que tanto `abandoned_cart` (Ticto) quanto `cart_abandoned` e `abandoned` sejam todos normalizados para `cart_abandoned`

### Verificação necessária (no Supabase ou na UI)
- Abrir o funil "RECOMPRA - POTES" → aba "Flow Editor" 
- Confirmar que existem regras de transição para:
  - Evento `pix_generated` → etapa "Pix / Boleto Gerado"
  - Evento `abandoned_cart` → etapa "Recuperar"
- Se não existirem, criá-las

### Arquivo editado
1. `supabase/functions/wz-receiver/index.ts` — adicionar `abandoned_cart` ao mapa de normalização
