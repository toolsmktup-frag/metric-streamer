# MF-001 — pré-publicação isolada

Data: 2026-09-16. Responsável: @devops. Resultado: **BLOQUEADO para publicação**; inspeção concluída, sem commit, push, PR, merge ou deploy.

## Evidência Git

Consulta `git ls-remote` diretamente ao GitHub, sem modificar refs/remotos locais:

| Projeto | GitHub main | Checkout local | Situação |
| --- | --- | --- | --- |
| Metrics / metric-streamer | `4797936a704607bb97861b232cb7c5ab44bfae65` | `04ed032` em `codex/recompra-gabriela` | 4 commits à frente do main; baseline NÃO é main |
| Financeiro / fluxo-financeiro | `93fb80ff442b68c4d67b513cb63d7818e61cdab4` | `93fb80f` em main | Base coincide com GitHub; integração não commitada |

O origin do clone Metrics é `/Users/matheuscolombo/Documents/Metrics e Funis`, **não GitHub**. Nunca executar push para esse origin. O original tem trabalho não commitado de recompra/Shopify e foi apenas inspecionado, não modificado.

Commits existentes no baseline Metrics, ausentes de GitHub main:

- `fcfb419` — fix: aceitar webhook global da YouShop.
- `a2b7c17` — feat: add guarded WhatsApp repurchase workflow.
- `4402d7d` — fix: remove opt-out footer from repurchase messages.
- `04ed032` — feat: activate Gabriela repurchase pilot.

Esse intervalo altera 38 arquivos (3.486 inserções / 375 exclusões). Mesclar ou publicar a branch atual levaria trabalho de outro escopo. Um diff contra main também levaria esses arquivos; o delta MF-001 deve ser calculado **contra HEAD `04ed032`**, acrescido dos novos arquivos explicitamente revisados.

## Caminho de publicação recomendado (ainda não executado)

1. Resolver gates e obter decisão explícita do usuário sobre o que está bloqueado; atualizar story e parecer QA. O pré-push do projeto bloqueia lint global com erros e CodeRabbit não executado. Esta inspeção não concede exceção nem aprovação de produção.
2. Criar novo checkout isolado a partir de GitHub main atualizado, com branch dedicada. Não trocar branch no clone de implementação enquanto outros agentes trabalham e não usar o original dirty.
3. Aplicar somente o delta dos cinco arquivos rastreados abaixo relativo a `04ed032`, e os novos arquivos MF-001. Usar apply-check primeiro e revisar todo o diff final contra GitHub main. **Não copiar arquivos inteiros do baseline indiscriminadamente.**
   - `supabase/config.toml`: somente stanza `functions.financial-bridge`.
   - `supabase/functions/{guru,ticto,youshop,eduzz}-webhook/index.ts`: somente mudanças de MF-001.
   - Novos arquivos: `supabase/functions/_shared/{financialEvent,financialIntake}.ts`, `supabase/functions/financial-bridge/{index,handler}.ts`, `supabase/migrations/20260916120000_financial_bridge_shadow.sql`, `scripts/financial-replay.ts`, `src/test/financialBridge.test.ts` e documentação específica de MF-001.
4. A integração YouShop foi desenvolvida sobre `fcfb419`, mas main ainda tem parser anterior/token obrigatório. O diff MF-001 contém apenas import/preflight; revisar e retestar sobre main. Não incluir implicitamente as mudanças de timezone/carrinho/token opcional de `fcfb419`. O código em produção pode divergir de GitHub: conferir versão publicada antes de substituir receptor.
5. Reexecutar testes/gates no checkout de publicação, não reutilizar automaticamente resultados obtidos no baseline com recompra. Comparar lista de arquivos para comprovar ausência de mudanças recompra/Shopify. Apenas @devops pode publicar após gate e confirmação.
6. Financeiro: reconsultar main imediatamente antes de publicar. Isolar delta de integração sem reescrever histórico publicado. Lovable sincroniza pushes à branch conectada, portanto publicar migrations/consumer e validar permissões antes de expor UI que depende deles.

## Ordem de implantação e travas

- Aplicar exclusivamente as migrations MF-001 de cada projeto, nunca `db push` em lote a partir deste clone. Não executar reparação histórica nem reenvio de webhooks operacionais.
- Configurar segredo dedicado da ponte apenas nos servidores, validar mapeamentos de conta/beneficiário e preservar `export_enabled=false` inicialmente.
- Publicar receptores um a um após credenciais do fornecedor confirmadas. **YouShop não pode ser publicado enquanto a URL autenticada não estiver configurada/testada na origem:** produção atualmente aceita global sem token.
- Implantar bridge/consumidor; testar claim, persistência, ACK, timeout/redelivery e consulta restrita por organização com evento autorizado. Só então habilitar exportação shadow por conta e agendamento.
- Shadow não autoriza lançamento automático, líquido verificado, reparação de histórico ou cobertura 100%. Dependem de conciliação semântica e testes reais.
- Rollback operacional: parar agendamento e desabilitar exportação das contas; manter filas e inbox. Não apagar migrations/dados para voltar e não remover autenticação de fornecedor como rollback.

## Gates observados / reportados

- Inspeção independente: `git diff --check` Metrics sem problemas; GitHub SHAs confirmados; nenhum remote local alterado.
- Gates de implementação reportados pelo responsável/QA no primeiro clone (`04ed032`): testes locais passam; Metrics lint global tem 1.210 erros / 24 avisos; CodeRabbit indisponível; arquivos novos sem erros de lint. O checkout release sobre main tem **1.217 erros / 24 avisos** de lint global. São baselines diferentes; a diferença de sete erros não comprova regressão da integração. **Não equivale a pré-push aprovado.**
- Na leitura inicial a story ainda estava `Ready for Development`; revisar estado/checklist final após consolidação do QA.
- Financeiro: responsável reportou build/lint/typecheck/testes aprovados. Revalidar no conjunto exato a publicar.
- Nenhum teste de produção, credencial nova ou configuração de fornecedor foi feito por este pré-check.

## Preparação local adicional autorizada

Foi criado `/Users/matheuscolombo/Financeiro Empresas/metrics-finance-release` por clone direto de GitHub main (`4797936`), mantendo o checkout de implementação e o Metrics original intactos. Aplicou-se via patch somente a allowlist MF-001: inicialmente cinco arquivos rastreados (38 inserções / 13 exclusões), novos arquivos financeiros e documentação. Nenhum commit de recompra foi transportado; o origin deste checkout aponta ao GitHub correto.

Dependências locais foram copiadas do checkout de implementação, sem mudança de manifest/lockfile. Resultados sobre main:

- `git diff --check`: passou.
- `tsc --noEmit -p tsconfig.app.json`: passou. Main inicialmente não tinha script `typecheck`; o responsável adicionou somente esse script, sem copiar package.json do baseline recompra.
- ESLint dos seis arquivos TypeScript novos: passou.
- Teste `src/test/financialBridge.test.ts`: primeira execução falhou na preparação, sem executar cenários. O setup main acessava `window` incondicionalmente no ambiente Node do teste. O responsável aplicou guard mínimo `typeof window !== "undefined"`. Revalidação final reportada pelo responsável: `npm run typecheck` passou, `npm test` **78/78** (52 testes main + 26 novos) e `npm run build` passou.
- Build independente deste pré-check: passou (6,41s; avisos preexistentes de bundle grande, import dinâmico/estático e caniuse desatualizado).

Delta adicional explicitamente revisado: `src/test/setup.ts` (guard para ambiente Node) e `package.json` (script de gate typecheck). O conjunto rastreado final tem sete arquivos, 40 inserções / 14 exclusões; não inclui código funcional de recompra.

O responsável também confirmou SHA-256 idênticos do normalizador e migration entre checkout auditado e release. Isso não dispensa teste ponta a ponta real nem resolve os gates lint/CodeRabbit.

Não foram feitos alteração de remote existente, commit, push, PR, merge, migração, deploy ou acesso a segredos. Gates continuam bloqueados e preparação local não equivale a publicação.
