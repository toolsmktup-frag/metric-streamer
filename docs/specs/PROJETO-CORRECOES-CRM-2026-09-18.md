# Projeto — Quatro correções no CRM (funis "vazios", automação Cristal, marcador vazado, mover etapa no chat)

Data: 18/09/2026. Diagnóstico: Fable (Claude), com evidência levantada em produção. Executor: Opus, após este documento.
Repositório: `Matheuscolombo/metric-streamer` (Lovable publica a partir do GitHub — `git push` na `main` é o deploy do front). Projeto Supabase `emfbocpmphtftqcezaib`.

> **Revisão de 18/09 (Fable, a pedido do Matheus).** O que está comprovado com dado de produção: causa do erro 300 e o fato de a chamada dos funis não sair mais do navegador (item 1); a sequência Guia → acesso → Pix do Curso Mestre com texto errado (item 2); o marcador vazado e a origem no prompt da Cristal (item 3). O que ainda é hipótese: que o cache HTTP do Chrome seja exatamente o que segura a chamada — a prova é o Matheus limpar o cache e a lista voltar; se **não** voltar, o plano B está no item 1. Corrigido nesta revisão: a "triplicata" de eventos era uma linha por funil, comportamento normal — a story foi removida. Dependências de acesso: item 3 exige entrar na VPS (`agent-mcp`); items 1, 2 e 4 exigem que a sincronização GitHub ↔ Lovable esteja ligada (senão a edição é feita dentro do Lovable).

Ordem de execução sugerida: **1 → 3 → 2 → 4**. O item 1 é o único que trava a operação (vendedoras sem lista de funis); o 3 é uma linha de código na VPS; o 2 mexe em automação viva (cuidado com cliente); o 4 é funcionalidade nova.

Gates do repositório para tudo que tocar código: `npm run lint` nos arquivos alterados, `npm run typecheck`, `npm test`, `npm run build`; `deno check` em função de borda alterada; migração testada em banco local descartável antes de produção; **nada de `db push --include-all`** (runbook `docs/runbooks/recompra-gabriela.md`).

---

## 1. "Funis de Leads" aparece vazio fora da janela anônima

### O que aconteceu (com prova)

Às **19h56 de 17/09** a migração `20260917204000` criou duas chaves estrangeiras de `lead_funnels` para `lead_funnel_stages` (`due_queue_stage_id`, `due_today_stage_id`). Para o PostgREST isso é um segundo caminho de relação entre as tabelas, e o embed que o CRM usa — `lead_funnels?select=*,lead_funnel_stages(*),stage_transition_rules(*),lead_funnel_campaigns(lead_campaign_id),lead_funnel_traffic_funnels(traffic_funnel_id)&order=sort_order.asc` — passou a responder **HTTP 300** ("more than one relationship was found"). As FKs foram removidas às ~20h10 e o servidor voltou a responder 200 (verificado com a chamada exata do app e com RLS ligado no usuário do Matheus: 13 funis, 88 etapas, 30 regras, 8 vínculos — **nenhum dado foi perdido**).

Mas os navegadores que abriram o CRM durante a janela do erro **guardaram a resposta 300 no cache HTTP de disco** e não voltaram a perguntar ao servidor. Evidência no log da API (`edge_logs`, 17–18/09):

| Hora (UTC) | Navegador | Chamada | Status |
|---|---|---|---|
| 17/09 22:56 | Windows (Matheus) | `lead_funnels?select=*,lead_funnel_stages(*)…` | **300** |
| 17/09 23:48 | Mac, janela anônima | mesma chamada | 200 |
| 18/09 01:15 | Mac | `lead_funnels?select=id,name,color,lead_funnel_stages(…)` | 200 |
| 18/09 11:47 | Windows (Matheus) | `lead_funnels?select=id,name,color&order=name` | 200 |
| 18/09 11:47 | Windows (Matheus) | `lead_funnels?select=*,lead_funnel_stages(*)…` | **nunca chega ao servidor** |

Ou seja: o Chrome do Matheus pede campanhas, acessos e a lista curta de funis, mas a chamada com o embed completo **não sai do navegador** — é servida do cache. Por isso a janela anônima (cache vazio) funciona, e o login da Silvia no mesmo navegador falha (o cache é do navegador, não do usuário). `F5` e `Ctrl+Shift+R` recarregam a página mas não invalidam entradas de cache de `fetch()` para outra origem. O front agrava: `useLeadFunnels` engole qualquer erro e devolve `[]` (`src/hooks/useLeadFunnels.ts`, linhas 24–27), então a tela mostra "Nenhum funil nesta campanha" em vez de um erro.

### Ação imediata (já passada ao Matheus)

No Chrome com o CRM aberto: **F12 → botão direito no ícone de recarregar → "Esvaziar cache e atualização forçada"**. Isso limpa o cache HTTP inteiro. Gabriela e Silvia fazem o mesmo em quem abriu o CRM entre 19h56 e 20h30 de 17/09.

**Se limpar o cache não resolver** (plano B, antes de qualquer código): abrir o CRM com F12 → aba *Network* → filtrar `lead_funnels` → recarregar. Três cenários: (a) a chamada aparece com "(disk cache)" na coluna *Size* → confirma o cache, e a limpeza não pegou por estar em outro perfil do Chrome; (b) a chamada aparece com status 300/4xx/5xx vindo da rede → mandar o corpo da resposta para o Fable, é erro novo no servidor; (c) a chamada **não aparece** → algo no navegador impede o `fetch` (extensão, service worker antigo em `chrome://serviceworker-internals`, ou o app não chegou a montar a tela) — verificar o *Console*. As stories abaixo valem em qualquer cenário, porque tornam o app imune ao caso (a).

### Correção definitiva (Opus)

**Story 1.1 — o app nunca mais reaproveita uma resposta ruim do PostgREST.** Em `src/integrations/supabase/client.ts`, passar um `fetch` próprio ao `createClient` que força `cache: 'no-store'` em toda chamada:

```ts
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storage: localStorage, persistSession: true, autoRefreshToken: true },
  global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
});
```

Respostas da API nunca são cacheáveis por natureza (dependem do JWT), então não há perda. Isso resolve o caso atual **e** qualquer repetição futura, para qualquer tabela.

**Story 1.2 — a chamada dos funis muda de endereço e fica imune a ambiguidade.** Em `useLeadFunnels` e `useLeadFunnel` (`src/hooks/useLeadFunnels.ts`), trocar `lead_funnel_stages(*)` por `lead_funnel_stages!lead_funnel_stages_funnel_id_fkey(*)` e `stage_transition_rules(*)` por `stage_transition_rules!stage_transition_rules_funnel_id_fkey(*)`. O hint explícito: (a) muda a URL, logo qualquer cache antigo deixa de ser encontrado no primeiro deploy; (b) elimina o erro 300 mesmo que alguém crie outra FK entre as tabelas no futuro. Fazer o mesmo nas outras chamadas que embutem `lead_funnel_stages` a partir de `lead_funnels` (buscar por `lead_funnel_stages(` em `src/`; a do painel de vendedores usa `lead_funnels?select=id,name,color,lead_funnel_stages(id,name,sort_order)` e também recebeu 300 no dia).

**Story 1.3 — erro deixa de virar "lista vazia".** Nos dois hooks, remover o `try/catch` que devolve `[]`/`null` e deixar o erro subir (`throw error`), com `retry: 2`. Em `src/pages/LeadCampaigns.tsx` já existe `funnelsError`/`hasError`; garantir que, com erro, a tela mostra um aviso claro ("Não foi possível carregar os funis — tentar de novo") com botão que chama `refetch`, em vez de "Nenhum funil nesta campanha". Mesmo tratamento em `LeadFunnelDetail`, `Equipe`, `FunnelLinker` e `ContactPanel`, que consomem o hook.

**Story 1.4 — regra para migrações.** Adicionar ao `docs/runbooks/` uma nota: coluna nova em `lead_funnels`/`lead_funnel_stages` que aponte para a outra tabela **não recebe FK** (ou recebe com hint no front na mesma entrega). Tabelas de junção (`stage_transition_rules`, `lead_funnel_redistribution_rules`, `recompra_campaigns`) não interferem porque o PostgREST só as trata como M:N quando as FKs compõem a chave primária.

**Aceite.** (1) `curl` da chamada exata com um JWT de vendedora devolve 200 e 13 funis; (2) com o cache do navegador propositalmente envenenado (abrir o CRM, simular 300 no DevTools "Override" e recarregar) a versão nova ignora o cache e mostra os funis; (3) desligar a rede no DevTools e recarregar mostra o aviso de erro, não "Nenhum funil"; (4) `npm test` e `npm run build` limpos; deploy pelo push na `main`.

---

## 2. Automação "Guia das Tinturas": Pix → acesso → Pix de novo (print do Ricardo Castro, +55 92 8277-1702)

### O que aconteceu (reconstruído por `lead_events` e `wz_executions`)

| Hora (BRT, 17/09) | Evento da Ticto | Produto | Fluxo disparado | Mensagem que saiu |
|---|---|---|---|---|
| 09:41 | `pix_generated` (pedido `IHL208B`, R$ 47) | **COMO PREPARAR TINTURAS** (id 46342 — o Guia) | Guia das Tinturas → "PIX gerado" | "Seu Guia de Preparo de Tinturas está reservado! … código Pix" |
| 09:44 | `purchase_approved` (`IHL208B`) | Guia (46342) | Guia das Tinturas → "Compra aprovada — acesso" (e também "Webinário — comprou o Curso dos Erveiros") | "Sua compra foi aprovada… acesso ao Guia… Se você levou o Curso Mestre das Tinturas junto…" |
| 09:47 | `pix_generated` (pedido **novo** `JQY31EH`, R$ 147) | **Curso Mestre das Tinturas** (id 47629 — o *upsell* da página de obrigado) | Guia das Tinturas → "PIX gerado" | "Vi que você acabou de gerar seu pedido **do Guia de Preparo de Tinturas**… código de pagamento" |
| 16:22 | cliente: "Queria comprar no cartão" | — | Cristal (IA, VPS) | link de checkout `checkout.ticto.app/OA0FC6C5C` |
| 16:55 | — | — | follow-up da Cristal | "Deu tudo certo com o pagamento?" |

Então **não foi a recuperação do produto já comprado**: o cliente comprou o Guia (R$ 47), recebeu o acesso, e em seguida gerou um Pix do *Curso Mestre* (R$ 147), que é outro produto — o *order bump* da página de obrigado. O defeito é que o fluxo "Guia das Tinturas" tem o filtro de produto `["46342","47629"]` (Guia **e** Curso Mestre) e **todas as mensagens têm o nome "Guia de Preparo de Tinturas" escrito à mão**, em vez de `{{product_name}}`. Para o cliente, leu-se "você acabou de gerar o pedido do Guia" três minutos depois de receber o acesso ao Guia — parece cobrança em dobro. A cancelamento automático de pré-venda em `wz-receiver` (`purchase_approved` cancela execuções `pix_generated` do mesmo `product_id`) está correto e **não** deveria cancelar aqui, porque são produtos diferentes.

Observação: cada evento aparece 3 vezes em `lead_events`, mas **não é defeito** — é uma linha por funil em que o lead está (BASE DE LEADS, Infoprodutos, Webinar Diário), que é como o `sync_lead_from_sale` foi desenhado. Nada a corrigir aí.

### Correção (Opus)

**Story 2.1 — separar o upsell.** No fluxo `wz_flows` "Guia das Tinturas": trigger `pix_generated`/`boleto_generated`/`payment_refused`/`cancellation` com filtro só `["46342"]`, e um trigger novo (ou fluxo novo "Curso Mestre — complemento") para `["47629"]` com texto próprio, que reconhece o contexto: "Vi que você acabou de garantir o Guia e gerou também o pedido do **Curso Mestre das Tinturas** — o Pix dele está aqui embaixo; se preferir ficar só com o Guia, é só ignorar, tá?". Onde o texto for genérico, usar `{{product_name}}` (a variável já é populada em `wz-receiver`, linhas ~627–650). Editar pelo editor de fluxos do CRM (`src/components/wz-automation/`) ou por `update wz_flows set nodes = …` em migração com backup do JSON anterior em `docs/sql/`.

**Story 2.2 — regra de guarda no `wz-receiver` (vale para todos os fluxos).** Antes de iniciar uma execução de gatilho de pré-venda (`pix_generated`, `boleto_generated`, `cart_abandoned`, `pix_expired`, `payment_refused`), consultar `customer_purchases`/`lead_events`: se o **mesmo telefone** teve `purchase_approved` nos últimos **30 minutos** de **outro** produto, gravar em `variables` `recent_purchase_product_name` e `is_upsell=true`. Fluxos podem então usar uma condição (`{{is_upsell}}`) para escolher a variação de texto; e, se o fluxo não tiver ramo para isso, **suprimir** o disparo e registrar `wz_executions.status='skipped_upsell_context'` — nunca mandar mensagem que trata o cliente como quem não comprou. Teste unitário com o cenário real do Ricardo (pix 46342 → purchase 46342 → pix 47629 em 6 minutos).

**Story 2.3 — o "acesso" não deve prometer o que não foi comprado.** A frase "Se você levou o Curso Mestre das Tinturas junto, ele já está nesse mesmo portal" sai para quem não comprou o Curso. Trocar por condição no fluxo (só quando `purchase_approved` de 47629 já existir para o telefone) ou remover.

**Aceite.** Reexecutar o cenário do Ricardo em ambiente de teste (webhooks Ticto de exemplo): 3 mensagens, na ordem Pix do Guia → acesso do Guia → **Pix do Curso Mestre com o nome certo e contexto de complemento**; `npm test` cobrindo a guarda.

---

## 3. "[SEM_FOLLOWUP]" enviado ao cliente

### O que aconteceu

O prompt da Cristal (`girassol_config.system_prompt`, posição ~19.3k) instrui: *"Se não houver nada útil a dizer… responda EXATAMENTE com o código `[SEM_FOLLOWUP]` e mais nada"*. O código do follow-up da Cristal, que roda na **VPS (`agent-mcp`)**, não filtra esse marcador antes de enviar — ele foi para o WhatsApp de dois clientes: **14/09 17:35 (5511999104417)** e **17/09 06:58 (554498474580)**. O CRM só vê o espelho em `whatsapp_messages`; o envio é direto da VPS para a uazapi, então não há como bloquear no banco.

### Correção (Opus, precisa de acesso à VPS)

**Story 3.1 — filtro no remetente.** No serviço de follow-up da Cristal na VPS: após obter a resposta do modelo, `text = text.replace(/\[\s*SEM_FOLLOWUP\s*\]/gi, '').trim()`; se ficar vazio → não envia, registra `followup_skipped`. Aplicar o mesmo filtro no caminho de resposta normal (defesa: o modelo pode devolver o marcador fora do follow-up). Mesma proteção que a Rosane já tem para `[[TRANSFERIR]]`/`[[ENCERRAR]]` (`supabase/functions/rosane-agent/index.ts`, `reply()`).

**Story 3.2 — prompt mais seguro.** Em `girassol_config.system_prompt`, trocar o marcador por um que nunca faça sentido como mensagem e seja mais fácil de detectar (`[[SEM_FOLLOWUP]]`), e mover a instrução para o **fim** do prompt de follow-up. Publicar por `girassol_prompt_versions` como o CRM já faz (tela `GirassolConfig`).

**Story 3.3 — alarme.** Consulta agendada (pg_cron, diária, 08h BRT) que procura em `whatsapp_messages` saída com `body ~* '\[\[?\s*(SEM_FOLLOWUP|TRANSFERIR|ENCERRAR)\s*\]?\]'` nas últimas 24 h e, se achar, grava em `agent_action_logs` e manda aviso no chat interno da equipe (instância `Cristal`, número do Matheus). Custo zero e pega qualquer marcador que vaze de qualquer agente.

**Aceite.** Forçar no ambiente de teste da VPS uma resposta `[SEM_FOLLOWUP]` e confirmar que nada é enviado; consulta do 3.3 retorna zero linhas por 7 dias.

---

## 4. Mover o lead de etapa de dentro da conversa (pedido de produto)

### Situação

Já existe um seletor de etapa no painel lateral do chat (`src/components/whatsapp/ContactPanel.tsx`, linhas 371–446, via `useMoveLeadStage`), mas é um `Select` de 10 px escondido dentro da "jornada", que só aparece com o painel aberto e exige rolar. O Matheus quer **um clique, visível, sem sair da conversa**. O hook `useMoveLeadStage` já grava `lead_events.stage_change` sem `triggered_by`, então a movimentação humana feita pelo chat fica **protegida por 7 dias** pelo `trg_protect_human_stage_moves` (17/09) — nada a mudar no banco.

### Especificação (Opus)

**Story 4.1 — chip de etapa no cabeçalho do chat.** Em `src/pages/WhatsAppChat.tsx`, ao lado do nome do contato, um chip com a cor e o nome da etapa atual do **funil principal** do lead (regra: o funil em que o lead teve `stage_change` mais recente; se nenhum, o de `sort_order` menor; se o lead está em vários, o chip mostra "+N" e o popover lista todos). Sem lead vinculado, o chip vira "Vincular a funil" e abre o `FunnelLinker` já existente.

**Story 4.2 — popover de mudança rápida.** Clique no chip (ou tecla **M** com o chat focado) abre um `Popover` com `Command` (cmdk já está no projeto via shadcn): campo de busca no topo, etapas do funil principal agrupadas na ordem do kanban com a cor de cada uma, a atual marcada; abaixo, os outros funis do lead recolhidos. Selecionar move na hora (`useMoveLeadStage`), fecha o popover, mostra o toast que o hook já dá e atualiza o chip de forma otimista. `Esc` fecha. Componente novo `src/components/whatsapp/StageQuickMove.tsx`, reaproveitado no `ContactPanel` no lugar do `Select` pequeno.

**Story 4.3 — respeito às regras existentes.** Reusar `useLeadFunnelStages`/`useMyFunnelAccess` para listar só funis que a vendedora tem acesso; mover para a etapa de espera de campanha (`recompra_campaigns.waiting_stage_id`) mostra confirmação ("essa etapa é controlada pela automação — mover mesmo assim?"). Registrar no `metadata` do `stage_change` a origem `{ via: 'chat_quick_move' }` para métricas.

**Aceite.** Na conversa do kanban de recompra: chip mostra "Para abordar hoje"; `M` → digitar "neg" → Enter move para "Em negociação" em menos de 2 s; kanban reflete sem recarregar; evento aparece na jornada; o cron/webhook não devolve o card (teste com um `canceled` sintético dentro dos 7 dias). Vitest para a regra de "funil principal" e para o filtro de acesso.

---

## Execução — 18/09/2026 (Opus)

**Item 1 — funis vazios. Código pronto, aguardando publicação.**
`src/integrations/supabase/client.ts` passa `cache: 'no-store'` em todo `fetch`;
`useLeadFunnels`/`useLeadFunnel`/`useAllLeads` usam hint explícito
(`lead_funnel_stages!lead_funnel_stages_funnel_id_fkey`), o que também muda a URL
e descarta o cache velho; os hooks deixaram de devolver `[]` em erro e agora
lançam (`retry: 2`), e a tela mostra o motivo com botão que chama `refetch()` em
vez de `window.location.reload()`. Regras no runbook novo
`docs/runbooks/postgrest-embeds-e-cache.md`. Validado contra o servidor: o hint
inventado devolve 400 (PGRST200) e os quatro selects reais devolvem 200 — os
nomes das constraints estão certos.

**Item 2 — upsell. Aplicado em produção e verificado.**
O fluxo "Guia das Tinturas" não responde mais pelo 47629 (todos os gatilhos
passaram a `["46342"]`, 17 nós preservados) e o Curso Mestre ganhou fluxo próprio
`c0f5e1a2-47c6-4e39-9b21-000000047629`, ativo, com texto que trata a pessoa como
compradora do Guia ("se preferir ficar só com o Guia, é só ignorar"). As duas
frases que prometiam o Curso a quem não comprou foram removidas — hoje há zero
menção ao Curso Mestre no fluxo do Guia. Backup do JSON anterior em
`public.wz_flow_backups`, com o SQL de reversão em
`docs/sql/2026-09-18-separar-upsell-curso-mestre.sql`. Simulação dos três eventos
do caso Ricardo confirma: Pix do Guia → fluxo do Guia; compra do Guia → fluxo do
Guia; Pix do Curso → fluxo do Curso.
A guarda genérica (story 2.2) virou `supabase/functions/_shared/upsellContext.ts`
com 9 testes, ligada ao `wz-receiver` — **falta publicar a função** (ver pendências).

**Item 3 — marcador. Gravidade maior do que o previsto.**
Não foram 2 ocorrências: foram **130 clientes entre 01/09 e 17/09**, ~8 por dia,
sempre o texto `[SEM_FOLLOWUP]` sozinho e limpo (14 caracteres). O texto sair
perfeito prova que **a VPS não filtra nada** — ela envia exatamente o que o modelo
escreve. Instalado `20260918120000_agent_marker_leak_alert.sql`: detecta qualquer
marcador de qualquer agente no instante em que o webhook espelha a mensagem,
registra em `agent_action_logs` e avisa no WhatsApp da operação, no máximo um
aviso por hora (com esse volume, um por ocorrência viraria spam). Zero falso
positivo nas 130 históricas.
**Story 3.2 deliberadamente NÃO aplicada:** sem filtro na VPS, trocar
`[SEM_FOLLOWUP]` por `[[SEM_FOLLOWUP]]` só muda o texto feio que o cliente recebe
e ainda arrisca quebrar algum filtro que não enxergamos daqui. Faz sentido depois
que a VPS estiver corrigida, não antes.

**Item 4 — mover etapa na conversa. Código pronto, aguardando publicação.**
`src/components/whatsapp/StageQuickMove.tsx`: chip com a cor e o nome da etapa no
cabeçalho do chat, com "+N" quando o lead está em vários funis; clique ou tecla
**M** abre busca por nome (cmdk), agrupada por funil, com a etapa atual marcada;
seleção move na hora e o kanban é invalidado junto. A tecla M é ignorada enquanto
a pessoa digita a mensagem. Regras puras em `src/lib/leadStageNavigation.ts` com
15 testes: funil principal é o de `entered_at` mais recente, acesso por funil ou
por campanha inteira (e acesso a um funil da campanha não libera os outros), e
etapa de espera de campanha pede confirmação. O movimento grava
`metadata.via = 'chat_quick_move'` e continua **sem** `triggered_by`, que é o que
faz o `trg_protect_human_stage_moves` blindar a etapa por 7 dias.
Decisão: o `Select` do painel lateral foi **mantido**. Ele já funciona, está no
contexto da jornada por funil e respeita `canEditCrm`; trocar por um segundo
controle igual seria redundante e arriscaria o layout sem ganho real.

**Gates.** `tsc --noEmit` limpo no projeto inteiro; `deno check` limpo em
`wz-receiver`; 24 testes novos passando (9 de upsell + 15 de navegação de etapa);
`eslint` sem regressão (os 840 avisos de `any` são débito antigo — 95 arquivos já
usam `supabase as any`; os dois arquivos novos saíram limpos). `npm run build`
não roda a partir daqui porque o `node_modules` foi instalado no macOS e o binário
do rollup não executa no shell Linux — precisa rodar no Mac ou no deploy.

### Pendências que dependem do Matheus

1. **Publicar o front** (itens 1 e 4): `git push` na `main`, que é o deploy do
   Lovable. Enquanto não sobe, o item 1 continua contornável limpando o cache do
   navegador.
2. **Publicar `wz-receiver`** (story 2.2) por `supabase functions deploy
   wz-receiver` na CLI — o editor do painel não publica o que é alterado por
   script, e a função importa `_shared/upsellContext.ts`, que precisa subir junto.
   Mesmo caso do `rosane-agent`, ainda pendente de ontem. **Não é urgente:** o que
   resolveu o caso do Ricardo foi a separação dos fluxos, já ativa.
3. **Acesso à VPS `agent-mcp`** (story 3.1) — é a única correção que impede de
   verdade o `[SEM_FOLLOWUP]` de sair. Uma linha antes do envio.
4. **Decidir sobre apagamento automático** do marcador via uazapi enquanto a VPS
   não é corrigida (detecta em ~1 s e apaga no WhatsApp do cliente). Não foi feito
   por mexer na conversa do cliente sem autorização.

## Já feito hoje (17–18/09), fora deste projeto

- Rosane: gatilho `trg_mark_rosane_mirror` + janela de resposta 24 h (`20260917220000`); função corrigida no repositório, pendente de `supabase functions deploy rosane-agent` pela CLI (o editor do painel não publica alterações feitas por script). Teste real de ponta a ponta aprovado.
- FKs ambíguas removidas; migração `20260917204000` corrigida para não recriá-las.

## Fora de escopo, mas anotado

- Transcrição de áudio da Rosane depende de `OPENAI_API_KEY` nas variáveis das funções.
- Rotacionar a `sb_secret` do Supabase usada na análise de 17/09.
- Instâncias duplicadas "Matheus" e "Silvia Colombo" sem número (limpeza de cadastro).

---

## Fechamento — 18/09/2026, tarde (Opus)

Retomada depois que a execução anterior foi interrompida. Três pendências estavam
abertas: publicar o front (itens 1 e 4), publicar o `wz-receiver` (story 2.2) e
corrigir a VPS (story 3.1). O apagamento automático do marcador (pendência 4) foi
descartado pelo Matheus — a conversa dos clientes já havia sido resolvida na mão.

### Item 3 — corrigido na VPS. O diagnóstico anterior estava errado em dois pontos.

**Não eram 130 clientes.** São 130 mensagens para **4 telefones**: 127 foram para
`554141414141` (número de teste, 01–02/09) e **3 clientes reais receberam uma vez
cada** — 04/09 16:43, 14/09 17:35 e 17/09 06:58. O "~8 por dia" vinha de contar
mensagens do número de teste como se fossem pessoas.

**Não é o follow-up.** O `followup.js` já filtrava o marcador desde o incidente de
31/08 (`text.includes("[SEM_FOLLOWUP]")` → não envia). O vazamento acontecia no
**caminho de resposta normal**, em `index.js → flush()`, que enviava o que o modelo
devolvesse sem filtrar. O log da VPS prova o caso de 17/09: às 09:58:03 UTC (06:58
BRT) o cliente mandou "👍" e o turno respondeu com `out=16` tokens — o tamanho de
`[SEM_FOLLOWUP]` — e o banco registrou a saída de 14 caracteres no mesmo minuto.
Também não é `agent-mcp`: o serviço que responde é o `girassol-direct`
(`/opt/girassol-direct/dist/`), o `agent-mcp` só serve as ferramentas.

**Correção aplicada** (backup em `dist/*.bak.20260918`, serviço reiniciado às
14h52 UTC, health OK):

- `uazapi.js`: `stripInternalMarkers()` remove `[SEM_FOLLOWUP]`, `[[TRANSFERIR]]` e
  `[[ENCERRAR]]` em uma ou duas camadas de colchete, com ou sem espaço. A limpeza
  mora em `sendBlocks()`, que é o **único** ponto de saída do processo — cobre
  resposta normal, follow-up e qualquer caminho futuro. Sobrando só marcador, não
  envia, registra no log e devolve `false`. `notifyTeam()` passa `{ raw: true }`
  para que o aviso interno continue citando o marcador literal.
- `index.js`: limpa antes de enviar e **não arma o follow-up** quando a resposta era
  só marcador (antes, `markAwaitingReply` guardava um texto que nunca foi enviado).
- `followup.js`: respeita o `false` do `sendBlocks` em vez de rearmar o ciclo.

Verificado no próprio servidor: os 8 casos de `stripInternalMarkers` passam
(marcador sozinho, com espaço, colchete duplo, misturado a texto real, e frases
legítimas como "vou te transferir para a equipe", que **não** são tocadas).

A story 3.2 (trocar o marcador no prompt) segue não aplicada de propósito: agora
que o remetente filtra, mexer no prompt é cosmético e arrisca quebrar o filtro do
`followup.js`, que casa a forma antiga. O alarme da story 3.3 (migração
`20260918120000`) continua valendo como rede de segurança.

### Item 2 — `wz-receiver` publicado

`supabase functions deploy wz-receiver --no-verify-jwt --use-api` subiu a função e o
`_shared/upsellContext.ts` juntos: **v50 ACTIVE, `verify_jwt=false`**. `deno check`
limpo. Confirmado no banco que a guarda tem do que se alimentar: nos últimos 14
dias, **100%** das execuções de `purchase_approved` (433), `pix_generated` (173) e
`cart_abandoned` (320) gravam `variables.product_id` e `product_name`.

### Itens 1 e 4 — prontos para publicar

Gates limpos: `npm run typecheck`, `npm test` (143 testes, 15 arquivos), `npm run
build` (5,1 s, no Mac) e `eslint` sem **nenhum** erro nos arquivos novos — os dois
`any` restantes do `StageQuickMove` e o do `useRecompraWaitingStages` foram
tipados (`LeadFunnel`, `LeadFunnelStage`, `SupabaseClient`), em vez de ficarem no
débito antigo. Os quatro `select` com hint de FK foram conferidos contra o servidor:
todos devolvem **HTTP 200**.
