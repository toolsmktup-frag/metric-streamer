

## Fix: CORS import na Edge Function `verify-tracking-snippet`

### Problema
O import `@supabase/supabase-js/cors` não é reconhecido pelo bundler Deno das Edge Functions.

### Solução
Substituir o import por headers CORS definidos manualmente no próprio arquivo.

### Mudança
**`supabase/functions/verify-tracking-snippet/index.ts`** — linha 1:

Trocar:
```typescript
import { corsHeaders } from '@supabase/supabase-js/cors'
```

Por:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

Resto do código fica igual.

