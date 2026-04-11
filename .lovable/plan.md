

# Fix: Texto truncado nos selects de regras de transição

## Problema
Os selects "De (qualquer)" e "Para..." usam `w-40` (160px fixo), o que trunca nomes mais longos como "Compra Aprovada" para "Compra...".

## Correção

**Arquivo**: `src/components/lead-funnels/FunnelConfigTab.tsx`

Trocar `w-40` por `min-w-[140px] flex-1` nos três SelectTrigger das regras (linhas 262, 297, 312), para que eles expandam conforme o espaço disponível sem truncar o texto:

- Linha 297: `<SelectTrigger className="w-40">` → `<SelectTrigger className="min-w-[140px] flex-1">`
- Linha 312: `<SelectTrigger className="w-40">` → `<SelectTrigger className="min-w-[140px] flex-1">`

O primeiro select (evento, linha 262) já usa `flex-1`, então está ok.

