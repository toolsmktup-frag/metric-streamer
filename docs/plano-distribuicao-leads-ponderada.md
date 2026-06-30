# Plano — Distribuição automática ponderada de leads por vendedor

**Objetivo:** dar um lugar pra configurar, **por funil**, a distribuição automática de leads novos
entre vendedoras com **peso** (ex: 90% Gabi / 10% Silvia), aplicada no momento que o lead entra
pelo webhook. Mantém o "Assumir" manual (claim) funcionando por cima.

**Motivação:** a júnior (Silvia, silviacolombo65@gmail.com) precisa receber uma fatia pequena e
crescente dos leads pra ir sendo testada, sem depender de quem clica primeiro.

---

## Por que não dá pra resolver só com o que existe

| Peça existente | Peso? | Grava dono no lead? | Roda nos leads de webhook? |
|---|---|---|---|
| A/B Split → Porcentagem (sliders 90/10) | ✅ | ❌ só ramifica o fluxo | ❌ só dentro de fluxo WhatsApp |
| A/B Split → Round-Robin/Aleatório Vendedores | ❌ sempre igual | ✅ | ❌ só dentro de fluxo WhatsApp |
| Claim ("Assumir pra mim") | ❌ quem clica primeiro | ✅ | ✅ é o de hoje |

Os leads de vocês entram por `webhook-lead` e caem direto no Kanban (sem passar por fluxo).
Logo, a distribuição precisa morar **no webhook**, e o modo "peso + grava dono" não existe.

---

## Decisões de design

1. **Onde roda:** dentro de `supabase/functions/webhook-lead/index.ts`, logo após o lead ser
   posicionado no funil (passo 4 do arquivo).
2. **Só atribui lead SEM dono** (`assigned_to IS NULL`). Nunca rouba lead já assumido/atribuído.
   Lead reincidente que já tem dono não é tocado.
3. **Algoritmo determinístico proporcional** (não sorteio): escolhe a vendedora com menor
   `(assigned_count + 1) / weight`. Isso converge **exatamente** aos pesos e **espalha** a
   distribuição (não manda 9 seguidos pra uma e depois 1 pra outra). Para 90/10 dá ~9:1 distribuído.
4. **Pool de candidatas:** vendedoras com **acesso ao funil** (`lead_funnel_access`) + **peso > 0**
   + perfil ativo. Reforça o passo de "dar acesso à Silvia".
5. **Claim continua** por cima — dá pra reatribuir na mão quando quiser.

---

## 1. Banco (migration nova)

Arquivo: `supabase/migrations/2026XXXXHHMMSS_lead_distribution.sql`

- **Tabela `lead_distribution_weights`**
  - `funnel_id uuid` (fk `lead_funnels`)
  - `user_id uuid`
  - `organization_id uuid`
  - `weight int default 1` (>= 0)
  - `assigned_count int default 0`
  - `unique (funnel_id, user_id)`
- **Coluna em `lead_funnels`:** `auto_distribute_leads boolean default false`
- **RPCs (SECURITY DEFINER, search_path = public):**
  - `get_funnel_distribution(p_funnel_id uuid)` → retorna toggle + linhas (user_id, nome, weight).
    `grant execute ... to authenticated`.
  - `set_funnel_distribution(p_funnel_id uuid, p_enabled boolean, p_weights jsonb)` → upsert dos
    pesos, **zera `assigned_count` quando os pesos mudam** (pra não arrastar histórico), seta a flag.
    Restrito a admin/gestor da org. `to authenticated`.
  - `assign_lead_by_distribution(p_funnel_id uuid, p_lead_id uuid)` → o cérebro: se a flag estiver
    ligada e o lead estiver sem dono, escolhe a candidata por `(assigned_count+1)/weight`, incrementa
    o contador dela e grava `leads.assigned_to`. Retorna o `user_id` escolhido (ou null). Atômico.
    `grant execute ... to service_role` (chamado pelo webhook).
- **RLS:** `lead_distribution_weights` legível/editável só por admin/gestor da org (espelhar política
  já usada em `lead_funnel_access`).

> Decisão: pesos numa tabela própria, **sem mexer em `lead_funnel_access`**, pra não tocar na RLS
> de acesso que já está em produção.

## 2. Backend (`webhook-lead/index.ts`)

- Depois do passo 4 (lead posicionado no funil) e **só se `lead.assigned_to` for null**, chamar
  `supabase.rpc('assign_lead_by_distribution', { p_funnel_id: funnel.id, p_lead_id: lead.id })`
  (já roda com service role).
- **Não-fatal:** se falhar/desligado, segue o fluxo normal — o lead fica sem dono e cai no claim
  como hoje. Mesmo padrão try/catch do forward pro `wz-receiver`.

## 3. Frontend (config)

- **Componente novo** `FunnelDistributionConfig.tsx` (na aba **Avançado** do `FunnelConfigTab`,
  perto do "Redistribuir Leads"):
  - Toggle "Distribuir leads automaticamente entre vendedores".
  - Lista as vendedoras **com acesso ao funil** (reusa a query de `funnel-sellers` do
    `RedistributeLeadsDialog`) com **slider/input de peso** (0–100) por vendedora.
  - **Preview:** "A cada 10 leads novos: ~9 Gabi, ~1 Silvia".
  - Botão Salvar → `set_funnel_distribution`.
- **Hook novo** `useFunnelDistribution.ts` (get/set via RPC).
- **Wire** em `src/pages/LeadFunnelDetail.tsx` junto dos outros `onSave*` do `FunnelConfigTab`.
- Nota de UX: se a vendedora não tiver acesso ao funil, ela nem aparece → o texto deve orientar a
  liberar acesso primeiro (tela Equipe / `FunnelAccessManager`).

## 4. Deploy (ordem importa)

1. Aplicar a **migration** no Supabase (projeto `emfbocpmphtftqcezaib`).
2. **Redeploy da edge function** `webhook-lead` — depende do fluxo de deploy (PAT do Matheus /
   Lovable). **Isto é o passo que não é "só publicar o front".**
3. Publicar o **front** (PR/Lovable normal).

## 5. Testes e rollout

- **Teste:** disparar webhook de teste no funil com 90/10 e conferir o `assigned_to` alternando
  certo (~8–9 Gabi por 1 Silvia, espalhado).
- **Rollout seguro:** começa Silvia em 10%, sobe gradual. Desligar é só o toggle — efeito na hora.
- Mudar os pesos zera os contadores (não arrasta o histórico).

## Riscos / pontos em aberto

- `leads.assigned_to` é **por lead** (global), não por funil. Se um lead estiver em 2 funis, o dono
  é um só. Pro caso de vocês (um funil de atendimento) tá ok.
- Escopo é **só `webhook-lead`**. Leads que entram por outro caminho (sync de vendas, importação)
  continuam sem auto-distribuição — dá pra estender depois se precisar.
- **Pré-requisito operacional** (vale desde já, sem código): aprovar a Silvia como vendedora ativa
  + dar acesso ao funil na tela **Equipe**. Sem isso ela não entra no pool nem via claim.
