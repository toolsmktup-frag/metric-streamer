

## Problemas Identificados

### 1. Nome trocado com Email
No screenshot, o lead mostra "Lead sem nome" no título mas "Edna Maria de Oliveira" no campo de email. Isso significa que a planilha tem uma coluna de nome que está sendo mapeada como email (ou o nome não está sendo reconhecido e o valor do nome está caindo no campo errado). Preciso verificar os nomes exatos das colunas da planilha para ajustar o `COLUMN_MAP` no `ImportLeadsDialog.tsx`. Possíveis causas:
- A coluna de nome na planilha tem um nome não reconhecido pelo mapeamento atual
- Ou a coluna "email contato" contém o nome e não o email

**Fix**: Adicionar mais variações de nomes de colunas ao `COLUMN_MAP` (ex: `'cliente'`, `'comprador'`, `'nome do cliente'`, `'customer_name'`). Também adicionar logs no preview da importação para facilitar debug.

### 2. Data do evento usando data da importação, não da compra
O `buildEvent` no `useImportLeads.ts` insere o evento sem especificar `created_at`, então o Supabase usa `now()`. A data da compra (`purchased_at`) existe no metadata mas não é usada como timestamp do evento.

**Fix em `useImportLeads.ts`**: No `buildEvent`, usar `row.metadata.purchased_at` como `created_at` do evento. Isso faz a timeline mostrar a data real da compra.

**Fix em `LeadTimeline.tsx`**: A timeline já usa `ev.created_at` para exibição — com o fix acima, automaticamente mostrará a data correta.

### Arquivos a alterar

1. **`src/hooks/useImportLeads.ts`** — `buildEvent` passa `created_at: row.metadata.purchased_at || new Date().toISOString()`
2. **`src/components/lead-funnels/ImportLeadsDialog.tsx`** — Ampliar `COLUMN_MAP` com mais variações de coluna de nome e email para evitar mapeamento errado (ex: `'nome do cliente'`, `'nome cliente'`, `'nome comprador'`, `'cliente'`, `'email do cliente'`, `'email cliente'`)
3. **`src/components/lead-funnels/LeadTimeline.tsx`** — Pequeno ajuste no header: mostrar email abaixo do nome (order: nome primeiro, depois email, depois phone) — já está nessa ordem, mas garantir que `lead.name` nunca fique null se `lead.email` contém um nome

