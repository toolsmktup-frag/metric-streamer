
Pergunta direta: precisa rodar mais algo no Supabase?

**Resposta: NÃO.** A migração `funnel-platforms-multi.sql` já fez tudo:
1. ✅ Tabela `funnel_platforms` criada com RLS
2. ✅ Backfill rodou (3 funis viraram 3 linhas, tokens preservados)
3. ✅ Coluna `platform` adicionada em `funnel_products`
4. ✅ Auditoria confirmou: zero duplicatas, zero quebras

**O que falta NÃO é Supabase, é uso da feature pela UI:**
- Adicionar Ticto no funil Articulabem-1 (hoje só tem Guru)
- Cadastrar a webhook URL nova lá na Ticto
- Mapear produtos específicos de cada plataforma (opcional — sem mapear, segue como hoje)

**Migrações futuras que PODEM ser úteis (não obrigatórias agora):**
- Deprecar colunas `platform` e `webhook_token` da tabela `funnels` depois que o código todo migrar pra ler de `funnel_platforms` (hoje rodam em paralelo como fallback). Só fazer isso depois de 1-2 semanas rodando estável.

Sem plano de execução porque não há trabalho a fazer. Resposta é informativa.
