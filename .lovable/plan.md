

## Plano: Adicionar headers Ticto + seletor de plataforma na importação

### Por que não conflita
O COLUMN_MAP já tem ~50 variantes coexistindo (Guru, Eduzz, genérico). Adicionar Ticto é só mais ~8 chaves com nomes diferentes. Nenhum header colide.

### Mudanças

**1. `src/components/lead-funnels/ImportLeadsDialog.tsx` — Adicionar headers Ticto ao COLUMN_MAP**
- `'e-mail do cliente'` → `'email'`
- `'telefone completo do cliente'` → `'phone'`
- `'número do telefone do cliente'` → `'phone'` (fallback)

**2. Mesmo arquivo — Adicionar ao METADATA_KEY_MAP**
- `'nome do produto'` → `'product_name'`
- `'nome da oferta'` → `'offer_name'`
- `'código da transação'` / `'codigo da transação'` → `'transaction_id'`
- `'valor pago'` → `'amount'`
- `'método de pagamento'` / `'metodo de pagamento'` → `'payment_method'`
- `'data do pedido'` → `'purchased_at'`
- `'data do status'` → `'status_date'`
- `'ddi do cliente'` → `'_phone_ddi'`
- `'ddd do cliente'` → `'_phone_ddd'`

**3. Mesmo arquivo — Seletor de plataforma (sub-popup)**
Antes do upload do CSV, mostrar um `Select` com opções:
- Guru
- Ticto
- Outro / Genérico

O valor selecionado será salvo no metadata de cada lead importado como `platform`. Isso é puramente informativo/UX — o mapeamento de colunas funciona automaticamente independente da escolha.

**4. Mesmo arquivo — Lógica de phone com DDI+DDD**
Se `phone` não foi preenchido pelo COLUMN_MAP mas `_phone_ddi` + `_phone_ddd` + algum campo de número existem nos metadados, combinar em `+{ddi}{ddd}{numero}`.

### Resultado
- Planilhas Guru: continuam funcionando igual
- Planilhas Ticto: email, phone e produto reconhecidos, 84 leads importados
- UX: usuário sabe qual plataforma está importando

