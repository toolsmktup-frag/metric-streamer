# Conectar 2ª conta Guru ao funil Recompra de Potes

## Diagnóstico (rodado agora)

| Item | Status |
|------|--------|
| CRM "RECOMPRA - POTES" vinculado ao funil de tráfego "Articulabem - 1" via `traffic_funnel_id` | OK |
| 6 produtos mapeados em `lead_funnel_products` (Pote 30/90/180/360 dias, 9 Potes, Grátis) com recontact e auto-move stage | OK |
| 15 produtos cadastrados em `funnel_products` do Articulabem - 1, com `product_id` distintos das 2 contas Guru (ex: 1765547722 vs 1778018683) | OK |
| Tokens de webhook ativos no Articulabem - 1: **1 Guru + 1 Ticto** | **FALTA 1 token Guru** |

## Único ajuste necessário

Cadastrar **um segundo token Guru** no funil "Articulabem - 1" (`b253f262-44ac-4c64-8c4e-2e9fa0f9146e`). Sem isso, os webhooks da 2ª conta Guru chegam mas não encontram funil correspondente e são descartados — vendas não viram leads, automações não disparam, recontato não conta.

A tabela `funnel_platforms` já aceita múltiplas linhas por funil/plataforma (foi pra isso que existe o `funnel-platforms-multi.sql`). Não tem conflito.

## Passos

1. **Gerar o 2º token Guru no app**
   - Tela do funil Articulabem - 1 → seção "Webhooks / Plataformas"
   - Adicionar nova integração Guru → app gera um `webhook_token` novo
   - Copiar a URL completa do webhook

2. **Colar a URL no painel da 2ª conta Guru**
   - Dashboard Guru (conta nova) → Webhooks → adicionar URL gerada
   - Marcar os mesmos eventos da 1ª conta (purchase, refund, pix_generated, etc.)

3. **Testar com 1 venda real (ou de teste)**
   - Conferir em `webhook_audit_log` se chegou (deve ter linha com o novo token)
   - Conferir se a venda apareceu em `sales` com o `funnel_id` certo
   - Conferir se o lead caiu no CRM "RECOMPRA - POTES" na etapa correta

## Detalhes técnicos

- Não precisa mexer em código nenhum — a UI de webhooks do funil já suporta múltiplos tokens Guru.
- `traffic_funnel_id` e `lead_funnel_products` já estão corretos, não tocar.
- Atribuição de ROI continua funcionando: as vendas das 2 contas Guru consolidam no Articulabem - 1, e a regra `traffic-funnel-link` atribui o lead ao funil da 1ª compra dele.
- O CRM "Recompra de Potes" só recebe leads que JÁ COMPRARAM (porque a regra de entrada é o evento `purchase` com produto mapeado), então não há risco de duplicidade.

## Fora de escopo

- Mudanças na arquitetura `funnels` vs `lead_funnels` (opção A escolhida = não mudar).
- Auto-vincular ou unificar tabelas de produtos.
