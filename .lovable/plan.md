## Problema

No painel de detalhes do lead, os eventos do Timeline (ex.: `pix_generated`) mostram o nome do produto ("3 Potes Articulabem") mas **não exibem o valor** que o cliente está comprando. A Gabi precisa ver o valor ali na hora do atendimento.

## Causa

Em `src/components/lead-funnels/LeadTimeline.tsx` (linhas 347–370), a renderização do valor só checa `meta.amount`:

```tsx
{meta.amount && (
  <span>{formatCurrency(Number(meta.amount))}</span>
)}
```

Mas os webhooks (Ticto/Guru) salvam o valor em `metadata` sob outras chaves: `gross_amount`, `net_amount`, `value`, `total`. Quando o evento é `pix_generated`, normalmente vem `gross_amount` — por isso não aparece.

Também: para `pix_generated` o nome do produto aparece, mas seria mais útil colocá-lo junto do label (como já é feito para `purchase`), deixando o valor em destaque.

## Mudança

Arquivo único: `src/components/lead-funnels/LeadTimeline.tsx`

1. **Resolver o valor com fallback** entre as chaves possíveis do metadata:
   ```
   meta.amount ?? meta.gross_amount ?? meta.net_amount ?? meta.value ?? meta.total
   ```
   Renderizar o `formatCurrency` se qualquer um existir e for > 0.

2. **Incluir `pix_generated` (e `pix`, `boleto_generated`) na lista de eventos "com produto no label"** — assim o label vira `Pix gerado: 3 Potes Articulabem` e o valor aparece logo abaixo em verde, igual aos eventos de compra.

3. Manter todo o resto (ícones, cores, datas, deltas, badges) inalterado.

## Resultado visual

Antes:
```
pix_generated
27/05/2026 19:58:48
3 Potes Articulabem  [ticto]
```

Depois:
```
pix_generated: 3 Potes Articulabem
27/05/2026 19:58:48
R$ 197,00  [ticto]
```

## Escopo

- Apenas frontend (presentation).
- Não mexe em webhook, edge function, banco ou estrutura de dados.
- Não altera comportamento de outros funis nem das automações.
