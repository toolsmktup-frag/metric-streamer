
# Aba "Ofertas" no Copiloto de Vendas

Hoje a tela `/configuracoes/copiloto-vendas` só tem **1 campo**: o script grandão (tom de voz, etapas, objeções). Toda chamada da IA injeta esse script no prompt. Vamos adicionar uma **biblioteca de ofertas** ao lado, com cards individuais que você liga/desliga, e o backend monta o prompt juntando script + ofertas ativas.

## Como vai funcionar pra você

A tela vira **2 abas**: **"Script base"** (o que já existe) e **"Ofertas"** (nova).

### Aba Ofertas — lista de cards
Cada oferta é um card com:
- ✅ Switch ativo/inativo (rápido — só ofertas ativas vão pra IA)
- ⭐ Estrela "destaque" (1 oferta principal por vez — a IA prioriza essa quando o cliente pergunta "o que vocês têm?")
- Nome (ex: "Combo Erveiros")
- Resumo curto (2-3 linhas — aparece no card)
- Conteúdo completo em markdown (modal de edição)
- Botões: editar, duplicar, excluir

### Modal de edição da oferta
Campos estruturados (não bloco corrido):
- **Nome interno** (ex: "Combo Erveiros — Promo Nov/26")
- **Preço promocional** (ex: "12x R$ 129,70 ou R$ 1.297 à vista")
- **Preço cheio / referência** (opcional — pra ancoragem)
- **Acesso/garantia** (ex: "2 anos")
- **Composição / o que tá incluso** (textarea markdown — bullets)
- **Pra quem é / dor que resolve** (1-2 linhas)
- **Regras de uso pela IA** (textarea — ex: "se já comprou Curso A antes, ofertar só Curso B")
- **Status**: Rascunho / Ativa / Pausada / Encerrada

### Como entra no prompt da IA
O backend (edge function `sales-copilot`) busca todas as ofertas com status `ativa` da org e monta uma seção nova no system prompt:

```text
== OFERTAS ATIVAS ==
### ⭐ Combo Erveiros (DESTAQUE — oferta principal agora)
Preço: 12x R$ 129,70 ou R$ 1.297 à vista
Preço cheio: R$ 5.000 (R$ 2.500 cada curso)
Acesso: 2 anos
Composição:
  - Curso dos Erveiros (+30 plantas, preparos práticos...)
  - Alinhamento com Ervas (+40 plantas, vibracional...)
Regras: se já comprou um dos cursos, NÃO ofertar combo cheio.

### Curso Avulso Erveiros
Preço: 12x R$ 250 ou R$ 2.500 à vista
[...]
```

E adiciono regras no system prompt base:
- "Se cliente pergunta preço de algo: usa SÓ o que tá em OFERTAS ATIVAS, nunca inventa."
- "Prioriza a oferta marcada como ⭐ DESTAQUE quando o cliente está em descoberta."
- "Se cliente já comprou X (ver histórico), aplica as regras de exclusão da oferta."

## Limite de contexto
Não tem problema. Mesmo com **20 ofertas ativas** detalhadas, ficamos em ~15k tokens — Claude Haiku 4.5 aceita 200k. Margem confortável.

## Detalhes técnicos

### Banco — 1 tabela nova
```sql
create table public.sales_copilot_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  status text not null default 'active'
    check (status in ('draft','active','paused','archived')),
  is_featured boolean default false,
  short_description text,
  price_promo text,
  price_full text,
  access_period text,
  composition text,         -- markdown bullets
  target_audience text,
  ai_rules text,            -- regras pra IA (quando ofertar/não ofertar)
  sort_order int default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_offers_org_active on sales_copilot_offers (organization_id, status);
-- Só 1 oferta featured por org
create unique index idx_offers_one_featured
  on sales_copilot_offers (organization_id) where is_featured = true;
```
RLS: mesma política de `sales_copilot_scripts` (admin/gestor da org).

### Frontend
- `src/hooks/useSalesOffers.ts` — list/create/update/delete/toggle.
- `src/components/sales-copilot/OffersTab.tsx` — grid de cards + botão "Nova oferta".
- `src/components/sales-copilot/OfferCard.tsx` — card com switch ativo/destaque.
- `src/components/sales-copilot/OfferDialog.tsx` — modal de edição.
- `SalesCopilotConfig.tsx` — vira `<Tabs>` com "Script base" e "Ofertas".

### Edge function
Em `supabase/functions/sales-copilot/index.ts`:
1. Após buscar `script` (linha ~505), buscar também ofertas ativas da org.
2. Montar bloco `== OFERTAS ATIVAS ==` ordenado: featured primeiro, depois `sort_order`.
3. Passar pro `buildSystemPrompt(action, script, offersBlock, leadCtx)` e injetar no system prompt.
4. Adicionar 3 regras novas em "COMO USAR O CONTEXTO" sobre uso correto das ofertas.

## Entrega
1. Migration da tabela `sales_copilot_offers` + RLS (você roda manual no Supabase, como sempre).
2. Hook + componentes (cards, modal, tab).
3. Edge function atualizada — código pronto pra você colar no Dashboard.
4. Já deixo o **Combo Erveiros pré-cadastrado** no formato estruturado pra você só clicar "ativar".

Topa que eu sigo?
