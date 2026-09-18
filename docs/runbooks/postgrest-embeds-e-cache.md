# Regras para não derrubar a tela de funis de novo

Escrito depois do incidente de 17/09/2026, em que a lista de funis ficou vazia
para todos os usuários por várias horas.

## O que aconteceu

A migração `20260917204000` criou duas colunas em `lead_funnels` apontando para
`lead_funnel_stages` (`due_queue_stage_id`, `due_today_stage_id`), **com chave
estrangeira**. O PostgREST passou a enxergar três caminhos de relação entre as
duas tabelas e respondeu **HTTP 300** ("more than one relationship was found")
ao embed que o CRM usa. Nenhum dado foi perdido — só a consulta parou de
funcionar. Pior: os navegadores guardaram a resposta de erro no cache de disco
e continuaram servindo ela mesmo depois do banco voltar ao normal, o que fez o
problema parecer permanente e insensível a `F5` / `Ctrl+Shift+R`.

## Regra 1 — coluna nova que aponta para a outra tabela não leva FK

Ao adicionar em `lead_funnels` (ou em `lead_funnel_stages`) uma coluna que
referencia a outra dessas duas tabelas, **declare como `uuid` simples, sem
`references`**. A integridade, se for necessária, fica por conta de um trigger
de validação — não de uma FK, porque a FK é o que o PostgREST usa para montar
os caminhos de embed.

Tabelas de junção (`stage_transition_rules`, `lead_funnel_redistribution_rules`,
`recompra_campaigns`) **não** causam o problema: o PostgREST só as trata como
relação muitos-para-muitos quando as duas FKs compõem a chave primária.

Se a FK for mesmo indispensável, o front precisa ser atualizado **na mesma
entrega** com o hint explícito da relação (regra 2).

## Regra 2 — embed entre essas tabelas sempre com hint

Em vez de `lead_funnel_stages(*)`, escreva
`lead_funnel_stages!lead_funnel_stages_funnel_id_fkey(*)`. O hint diz ao
PostgREST exatamente qual FK seguir, então uma FK nova não quebra a consulta.
Já aplicado em `src/hooks/useLeadFunnels.ts` e `src/hooks/useAllLeads.ts`.

## Regra 3 — o cliente Supabase não usa cache

`src/integrations/supabase/client.ts` passa `cache: 'no-store'` em todo `fetch`.
**Não remova.** Resposta de API depende do JWT e nunca deveria ser cacheada;
sem isso, qualquer resposta de erro pode ficar grudada no navegador do usuário.

## Regra 4 — erro de consulta nunca vira lista vazia

Hook de dados deve deixar o erro subir (`throw error`), não devolver `[]`. Uma
lista vazia é indistinguível de "não há nada cadastrado" e esconde a falha. A
tela mostra o aviso de erro com botão que chama `refetch()` — nunca
`window.location.reload()`, que não ajuda contra cache.

## Como diagnosticar rápido se acontecer de novo

1. No banco, confirme que os dados existem (`select count(*) from lead_funnels`).
2. Refaça a chamada exata do app com a chave anônima e veja o status HTTP.
3. Liste as FKs entre as duas tabelas:
   ```sql
   select conrelid::regclass, conname, confrelid::regclass
   from pg_constraint
   where contype = 'f'
     and confrelid in ('public.lead_funnels'::regclass, 'public.lead_funnel_stages'::regclass);
   ```
4. Depois de remover uma FK, rode `notify pgrst, 'reload schema';`.
5. No navegador do usuário: F12 → Network → filtrar a tabela → recarregar. Se a
   chamada não aparecer ou aparecer como "(disk cache)", é cache do navegador.
