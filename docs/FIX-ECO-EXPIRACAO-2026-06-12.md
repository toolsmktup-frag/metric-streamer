# Eco de expiração da Guru + Permissão "Funil avançado" — 2026-06-12

> Origem: queixa do dono ("na aba recuperar do ArticulaBem, os 3 leads que estão para
> chamar — já chamei há dias — estão como se tivessem tentado comprar hoje, mas não
> aparecem na Guru tentativas de compra hoje"). Diagnóstico fechado com dados de produção.

## 1. O bug: eco de expiração re-datava leads em "Recuperar"

### Sintoma
Leads já trabalhados pela equipe reapareciam na etapa **"Recuperar"** (funil RECOMPRA -
POTES) datados de "hoje", como se fossem tentativas de compra novas — sem nenhuma
transação nova na Guru. Acontecia **toda madrugada entre 00:00 e 00:45 BRT** (confirmado
no histórico: 06, 07, 08, 09, 11 e 12/06).

### Causa-raiz (confirmada nos dados)
1. A Guru **expira PIX/boleto não pagos na virada do dia** e envia webhook `expired`
   **dias depois** da tentativa real (boleto ≈ 7 dias).
2. O `guru-webhook` normaliza `expired` → `canceled` e chama `sync_lead_from_sale`.
3. A RPC inseria o `lead_event` com `created_at = NOW()` (data de **processamento**, não
   da transação — o uso de `p_purchased_at` existia na v4 e se perdeu da v5 em diante) e
   disparava a `stage_transition_rule` `canceled` → "Recuperar" com `entered_at = NOW()`.
4. O card do Kanban exibe `entered_at` → lead re-datado para "hoje".

**Caso real (12/06):** Francisco Cardoso Leite (boleto 04/06), Mayda Josefina C. Freire
(2 PIX 04/06) e Maria Ligia Ferreira (boleto 05/06), todos ArticulaBem 3 Potes —
expirados pela Guru entre 00:08 e 00:32 de 12/06 e re-datados para 12/06.
O cron `recontact-daily` foi **descartado como causa** (rodou 08:00 e moveu exatamente
1 lead, como previsto no dry-run).

### Correção: RPC `sync_lead_from_sale` v8 (aplicada em produção 2026-06-12)
Ver [rpc-sync-lead-from-sale-v8.sql](./rpc-sync-lead-from-sale-v8.sql). Duas mudanças,
nas **duas sobrecargas** (12 e 13 parâmetros), mesma assinatura — zero downtime:

| Mudança | Efeito |
|---|---|
| **Gate de frescor (48h):** transition rules só disparam se `p_purchased_at` ≤ 48h | Boleto expirado dias depois → evento vira só histórico, **não move o lead**. PIX que morre no mesmo dia → continua indo para "Recuperar" (fluxo desejado). Reenvio/retry de webhook antigo → não mexe no quadro |
| **`metadata.original_date`** em todo `lead_event` | Timeline do lead mostra a data real da transação (o front já priorizava esse campo) |

Callers sem `p_purchased_at` caem no default `NOW()` → comportamento idêntico ao antigo
(compatível com todos os webhooks: guru/eduzz/ticto/import já enviam a data real).

**Validação em produção:** lead sintético com `canceled` de 7 dias → ficou na etapa
inicial (não moveu) ✓ · `canceled` de 1h → moveu para "Recuperar" ✓ · lead de teste
removido após o teste. Os 3 leads reais tiveram `entered_at` restaurado para a data da
tentativa (04-05/06).

**Como validar no dia-a-dia:** após a leva de expirações da madrugada, ninguém deve
entrar em "Recuperar" cuja tentativa real (`metadata.original_date`) tenha mais de 48h.

### Correção relacionada: timeline sem eventos duplicados
O mesmo evento é gravado em mais de um funil (BASE DE LEADS + funil do produto) e a
timeline mostrava os dois (ex.: "Cancelado" 2×). `LeadTimeline.tsx` agora colapsa por
`event_name + transaction_id`. _(PR #6)_

## 2. Permissão "Funil avançado" por vendedor

**Pedido:** liberar as abas extras do funil (Flow Editor, Métricas, Configuração,
Automações, Webhook) para um **vendedor específico**, sem promovê-lo a admin/gestor.

**Solução:** nova permissão individual no painel da página **Equipe** (mesmo sistema dos
módulos): coluna `user_permissions.mod_funil_avancado` (default `false`, migration
[20260612190000](../supabase/migrations/20260612190000_user_permissions_funil_avancado.sql)
aplicada em produção).

**Como usar:** Equipe → expandir permissões do vendedor → ligar **"Funil avançado
(todas as abas)"**.

**Bônus de segurança:** o botão **"Limpar Funil"** (apaga leads + eventos do funil)
estava visível para **qualquer usuário** — agora restrito a admin/gestor. _(PR #7)_

## Arquivos

| Arquivo | Tipo | Estado |
|---|---|---|
| `docs/rpc-sync-lead-from-sale-v8.sql` | Banco (RPC) | ✅ aplicado em prod |
| `src/components/lead-funnels/LeadTimeline.tsx` | Front | ✅ PR #6 mergeado |
| `supabase/migrations/20260612190000_user_permissions_funil_avancado.sql` | Banco | ✅ aplicado em prod |
| `src/hooks/useUserPermissions.ts` | Front | ✅ PR #7 mergeado |
| `src/pages/LeadFunnelDetail.tsx` | Front | ✅ PR #7 mergeado |

> Front vai ao ar no próximo **Publish da Lovable** (main já contém tudo).
