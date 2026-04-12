

## Problema

Leads nas colunas negativas (Carrinho Abandonado, Pagamento Recusado, Reembolso, Chargeback, Cancelado) **não têm `amount` no metadata** — então o badge "Recuperar" nunca aparece porque a linha 155 do `LeadCard.tsx` faz `if (metaAmount <= 0) return null`.

## Correção

Mostrar o badge "Recuperar" (vermelho) e "Pendente" (amarelo) **mesmo sem valor monetário**. Se tiver amount, mostra o valor. Se não tiver, mostra apenas o label "Recuperar" ou "Pendente" como indicador visual do status.

### Arquivo: `src/components/lead-funnels/LeadCard.tsx`

**Mudança na linha 153-168:**
- Remover o `if (metaAmount <= 0) return null`
- Se `metaAmount > 0`, mostrar o valor formatado + label
- Se `metaAmount === 0`, mostrar apenas o ícone + label (sem valor)

Resultado: toda coluna classificada como `pending` ou `negative` mostrará um badge visual em cada lead, independentemente de ter valor no metadata.

