

## Corrigir WebhookConfig para incluir header `apikey`

### Problema
O Supabase gateway exige o header `apikey` em toda request para Edge Functions. O componente `WebhookConfig.tsx` não mostra esse header, fazendo com que integrações externas (n8n, Zapier, etc.) falhem com 401.

### Correção

**Arquivo: `src/components/lead-funnels/WebhookConfig.tsx`**

1. Adicionar a anon key como constante (já existe em `client.ts`)
2. Mostrar o header `apikey` junto com o `X-Funnel-Token` na seção de headers
3. Atualizar o cURL de exemplo para incluir `-H "apikey: ..."` 
4. Atualizar as instruções "Como integrar" para mencionar os dois headers obrigatórios

### Detalhes técnicos
- A anon key será lida de `import.meta.env.VITE_SUPABASE_URL` pattern ou hardcoded (como já está no `client.ts`)
- O cURL passará a ter 3 headers: `Content-Type`, `apikey`, e `X-Funnel-Token`
- A seção de instruções será atualizada para listar ambos os headers

