

## Otimizar sync-leads-from-sales para escala de 52K+

### Problema atual
A função `sync-leads-from-sales` já faz exatamente o que o usuário quer (puxa de `customer_purchases` + `unified_customers` e cria leads), mas insere **um registro por vez**. Com 36K clientes e 52K compras, isso causa timeout na edge function (limite de 150s).

O usuário **NÃO precisa importar o CSV** — os dados já estão no banco. Basta otimizar o sync.

### Mudanças na edge function `sync-leads-from-sales/index.ts`

**1. Busca paginada de purchases**
Atualmente faz um único `.select()` que retorna no máximo 1000 linhas. Implementar loop com `.range()` para buscar todas as 52K+ compras.

**2. Inserção de leads em batch (lotes de 500)**
Trocar o insert individual por upsert em lotes, com fallback para identificar IDs de leads já existentes.

**3. Inserção de positions em batch (já faz em lotes de 500 — manter)**

**4. Inserção de events em batch (lotes de 500)**
Trocar o insert individual por insert em lotes, com fallback sem `created_at` para o lote inteiro em caso de erro.

**5. Busca paginada de customers**
Também precisa de `.range()` para buscar todos os 36K+ clientes unificados.

### Arquivo modificado
- `supabase/functions/sync-leads-from-sales/index.ts`

### Resultado esperado
- Sync completa em ~30-60s em vez de timeout
- Todos os 36K leads criados com posição no funil "BASE DE LEADS"
- Todos os 52K+ eventos de timeline criados
- Zero duplicação com dados existentes em `customer_purchases`

