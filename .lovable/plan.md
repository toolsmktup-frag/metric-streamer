
Usuário só quer saber: "o que eu rodo no Supabase enquanto você refatora?" Resposta direta, didática.

Nesta fase (1.5 — refator pra remover fallback legacy), **NÃO precisa rodar NADA no Supabase**. Todo o trabalho é em código TypeScript:
- Edge functions (remover bloco de fallback)
- FunisConfigurar.tsx (parar de gravar nas colunas legacy)
- useFunnels.ts (limpar tipo)

A Fase 2 (drop das colunas) é que vai gerar SQL — mas só depois de 1-2 dias rodando estável.

Vou explicar isso de forma didática, com checklist do que ELA pode fazer enquanto eu codo (testes manuais, monitoramento), e antecipar o SQL que vem depois pra ela já saber o que esperar.
