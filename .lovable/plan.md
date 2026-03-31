
## Plano: estabilizar o erro `removeChild` que está derrubando o CRM para vendedoras

### Diagnóstico mais provável
A causa mais forte, pelo código, é esta combinação:

```text
HTML com lang="en" + UI inteira em português
            +
tradução automática do navegador / mutação externa do DOM
            +
componentes Radix/shadcn com Portal
            +
muitas instâncias no CRM/Kanban
            =
NotFoundError em removeChild
```

O ponto mais sensível hoje é o CRM de leads:
- `index.html` está com `lang="en"`
- o app usa muitos componentes com portal (`Select`, `Tooltip`, `Popover`, `Dialog`, `Sheet`, etc.)
- no Kanban, cada card renderiza `LeadAssignSelect` compacto
- esse seletor compacto hoje combina `Tooltip + Select`, o que aumenta bastante a chance de crash em massa para as vendedoras

### O que vou ajustar
1. **Corrigir idioma/base do documento**
   - Em `index.html`, trocar `lang="en"` para `lang="pt-BR"`
   - Adicionar proteção anti-tradução no documento/app shell (`translate="no"` / `notranslate`) para reduzir interferência do navegador

2. **Blindar os componentes com portal**
   - Revisar e endurecer:
     - `src/components/ui/select.tsx`
     - `src/components/ui/tooltip.tsx`
     - `src/components/ui/popover.tsx`
     - `src/components/ui/dialog.tsx`
     - `src/components/ui/sheet.tsx`
     - `src/components/ui/alert-dialog.tsx`
     - `src/components/ui/dropdown-menu.tsx`
   - Aplicar proteção de tradução nos conteúdos portalled, porque é exatamente neles que esse erro costuma aparecer

3. **Remover o hotspot principal do CRM**
   - Simplificar `src/components/lead-funnels/LeadAssignSelect.tsx` no modo `compact`
   - Evitar empilhar `Tooltip` e `Select` no avatar pequeno dos cards
   - Manter a troca de vendedor de forma mais estável no painel/timeline, onde existe menos montagem/desmontagem simultânea

4. **Ajustar o card do Kanban**
   - Em `src/components/lead-funnels/LeadCard.tsx`, reduzir a complexidade do cabeçalho do card
   - Se necessário, deixar no card apenas visualização do vendedor e mover a edição para o painel lateral do lead

5. **Validar os fluxos onde as vendedoras mais sentem**
   - `/lead-campaigns`
   - `/lead-funnels/:id`
   - timeline do lead
   - `/crm-analytics`
   - ida/volta para `/whatsapp`

### Resultado esperado
- parar de aparecer a tela “Algo deu errado”
- navegação normal no CRM para vendedoras
- menos risco de quebra em qualquer tela que use overlays do Radix/shadcn
- correção estrutural, não só paliativa

### Arquivos principais
- `index.html`
- `src/components/lead-funnels/LeadAssignSelect.tsx`
- `src/components/lead-funnels/LeadCard.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/tooltip.tsx`
- `src/components/ui/popover.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/alert-dialog.tsx`
- `src/components/ui/dropdown-menu.tsx`

### Observação técnica
Pelo que revisei, isso não parece ser um erro “de regra de negócio” das vendedoras; parece um problema de estabilidade do frontend que fica mais frequente no perfil delas porque elas usam justamente a área com mais cards, selects e painéis dinâmicos.