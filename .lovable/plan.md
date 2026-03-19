

## Solução: Adicionar preset "Todo o período" no DateRangePicker

O problema é que o Resumo sempre filtra por data (máximo 30 dias por padrão), enquanto a Inteligência de Cliente consulta todos os registros sem limite de data.

### O que fazer

**Arquivo: `src/components/dashboard/DateRangePicker.tsx`**

Adicionar um novo preset "Todo o período" na lista de PRESETS que define a data inicial como 01/01/2020 (ou uma data suficientemente antiga) até hoje. Isso garante que, ao selecionar esse preset, o Resumo traga todos os dados disponíveis — mesma base que a Inteligência de Cliente consulta.

```
{ label: 'Todo o período', getDates: () => {
    const d = new Date(2020, 0, 1);
    return { start: d, end: new Date() };
  }
}
```

Será inserido como último item antes do separador "Personalizado".

### Resultado
- Usuário seleciona "Todo o período" → Resumo puxa todas as vendas da view `v_all_sales` sem restrição prática de data
- Os números passam a bater com a Inteligência de Cliente

