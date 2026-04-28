## Objetivo

Dar ao vendedor controle manual sobre qual oferta o copiloto usa em cada conversa, sem perder o modo automático atual. Tudo dentro do painel do Copiloto (perto do botão "Sugerir resposta") — sem tocar na sidebar do lead.

## UX (no SalesCopilotPanel, acima dos botões de ação)

Adicionar um bloco compacto "Foco da oferta" com um Select:

```text
Foco da oferta:  [ Automático (IA decide) ▼ ]
                 ├─ Automático (IA decide)
                 ├─ Ignorar ofertas (suporte/pós-venda)
                 ├─ ⭐ Combo Erveiros + Alinhamento
                 ├─ Curso dos Erveiros
                 └─ Alinhamento com Ervas
```

- **Automático** (padrão): comportamento atual — manda todas as ofertas ativas, IA escolhe.
- **Ignorar ofertas**: não envia bloco de ofertas; system prompt instrui "modo suporte, não ofertar nada".
- **Oferta específica**: envia só aquela oferta + instrução "FOCO: priorize esta oferta nesta conversa".

A escolha fica salva **por conversa** (chave = `phone+instance_id`) em `localStorage`, persistindo entre recarregamentos. Ao trocar de conversa, volta pro padrão "Automático" se nunca foi setado.

Mostro um badge sutil ("Foco: Combo Erveiros") perto do título do painel quando estiver em modo não-automático, pra deixar visível.

## Mudanças técnicas

### 1. Frontend — `SalesCopilotPanel.tsx`
- Carregar lista de ofertas ativas via `useSalesOffers` (já existe).
- Novo state `offerMode`: `'auto' | 'ignore' | <offer_id>`.
- Persistir em `localStorage` com chave `copilot-offer-mode:{instance_id}:{phone}`.
- Passar `offer_mode` e `offer_id` no payload do `run()`.

### 2. Hook — `useSalesCopilot.ts`
- Aceitar `offer_mode?: 'auto' | 'ignore' | 'specific'` e `offer_id?: string` em `RunArgs`, repassar no body do POST.

### 3. Edge Function — `supabase/functions/sales-copilot/index.ts`
- Ler `offer_mode` e `offer_id` do body.
- Lógica do bloco de ofertas:
  - `ignore`: `offersBlock = "== OFERTAS ATIVAS ==\n(MODO SUPORTE: não ofertar produtos. Foco em tirar dúvidas e dar atendimento pós-venda.)"`
  - `specific` + `offer_id`: filtra query por aquele id, prefixa com `"FOCO MANUAL: o vendedor selecionou esta oferta. Priorize-a na resposta, exceto se o cliente já recusou explicitamente."`
  - `auto` (default): comportamento atual.
- Edge function precisa ser **redeployada manualmente** no Supabase Dashboard (vou gerar `.txt` pronto pra colar, como das outras vezes).

## Detalhes técnicos relevantes

- Não exige migration — `sales_copilot_offers` já tem tudo.
- `useSalesOffers` já retorna ofertas ordenadas com `is_featured` (⭐) e `is_active`.
- O filtro do select mostra só ofertas com `is_active = true`, com as featured no topo.
- Sem mudança no `SalesCopilotButton.tsx` nem no `WhatsAppChat.tsx`.

## Entrega

1. Atualizar 3 arquivos (`SalesCopilotPanel.tsx`, `useSalesCopilot.ts`, `sales-copilot/index.ts`).
2. Gerar `/mnt/documents/sales-copilot-index.ts.txt` atualizado pra você colar no Supabase.
3. Confirmar que o seletor aparece e a escolha persiste entre recarregamentos da mesma conversa.
