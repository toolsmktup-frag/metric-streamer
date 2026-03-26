

## Plano: Corrigir mapeamento de colunas Guru no importador de leads

### Problema
A planilha Guru usa "contacto" nos headers (ex: `nome contacto`, `email contacto`, `telefone contacto`), mas o `COLUMN_MAP` só reconhece "contato". Resultado: 0 leads encontrados.

### Solução
Adicionar as variantes com "contacto" ao `COLUMN_MAP` e `METADATA_KEY_MAP` no arquivo `src/components/lead-funnels/ImportLeadsDialog.tsx`.

### Arquivo: `src/components/lead-funnels/ImportLeadsDialog.tsx`

**COLUMN_MAP** - adicionar:
- `'nome contacto'` → `'name'`
- `'email contacto'` → `'email'`
- `'telefone contacto'` → `'phone'`
- `'e-mail contacto'` → `'email'`

**METADATA_KEY_MAP** - adicionar:
- `'codigo telefone contacto'` → `'_phone_code'`
- `'código telefone contacto'` → `'_phone_code'` (já existe, confirmar)
- `'nome produto'` → `'product_name'` (já mapeado, ok)
- `'data pedido'` → `'purchased_at'` (já mapeado, ok)
- `'id marketplace'` → `'transaction_id'` (para dedup futuro)
- `'nome marketplace'` → `'platform'`

Também adicionar ao COLUMN_MAP:
- `'doc contacto'` → ignorar (já vai para metadata)

### Resultado
A planilha Guru será reconhecida corretamente, populando name, email e phone, passando pelo filtro e mostrando os 273 leads.

