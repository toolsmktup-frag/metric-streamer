

## Plano: Mostrar e editar funil de trafego em cada funil de leads na listagem

### O que muda

Na pagina de Funis de Leads (`LeadCampaigns.tsx`), cada linha de funil (dentro de uma campanha ou orfao) passara a exibir um dropdown de funil de trafego, similar ao que ja existe no nivel da campanha.

### Logica

1. **Heranca da campanha**: O dropdown mostra o valor de `funnel.traffic_funnel_id`. Se for `null`, exibe o funil herdado da campanha pai (em cinza/placeholder) para o usuario saber qual esta ativo.

2. **Opcoes do dropdown**:
   - "Herdar da campanha" (valor padrao, salva `null` no banco) -- so aparece se o funil pertence a uma campanha
   - "Ignorar funil de trafego" (salva um valor especial como `'none'` ou um UUID sentinel, ou simplesmente um campo booleano)
   - Lista de funis de trafego ativos

3. **Persistencia**: Ao mudar, chama `useUpdateLeadFunnel` com o novo `traffic_funnel_id`, igual ja funciona no `LeadFunnelDetail.tsx`.

### Implementacao

**Arquivo unico**: `src/pages/LeadCampaigns.tsx`

- Na linha de cada funil (linhas ~288-316 para funis com campanha, ~333-371 para orfaos), adicionar um `<select>` entre o nome do funil e os botoes de acao.
- O select usa `trafficFunnels` (ja carregado na pagina) para popular as opcoes.
- Para "Ignorar", salvaremos `traffic_funnel_id = 'ignore'` como string especial, ou mais limpo: adicionar um campo `ignore_traffic_funnel` booleano. Alternativa mais simples: usar o valor `null` como "herdar" e um UUID zerado como "ignorar".

**Abordagem recomendada (sem migration)**: Usar convenção de valor:
- `null` = herdar da campanha
- UUID valido = funil especifico
- Para "ignorar", podemos usar um UUID sentinela fixo (ex: `00000000-0000-0000-0000-000000000000`) que nao existe na tabela funnels

Isso evita migration e funciona imediatamente.

### Resultado visual

Cada linha de funil tera:
```text
[icone] Nome do Funil    [Guia de Tinturas v]  [permissoes] [>]
```

Quando herdando da campanha, o dropdown mostra o nome do funil herdado em tom mais claro com label "(da campanha)".

