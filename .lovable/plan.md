

## Seletor de Campanhas/Conjuntos/Anuncios nas Auto-Rules

### O problema

Hoje, ao criar uma regra, voce escolhe o "Escopo" (Campanha/Conjunto/Anuncio) mas **nao consegue selecionar quais campanhas especificas** da sua BM quer monitorar. O campo `scope_ids` sempre vai vazio, fazendo a regra se aplicar a **tudo** da organizacao (ou tudo do funil selecionado).

O correto e: ao escolher o escopo, aparecer uma lista das campanhas/conjuntos/anuncios reais sincronizados da sua BM (tabelas `meta_campaigns`, `meta_adsets`, `meta_ads`) para voce marcar quais quer monitorar -- ou escolher "Todas".

### O que sera feito

**1. Criar hook `useMetaEntities`** para buscar campanhas, conjuntos e anuncios da org:
- Query em `meta_campaigns` (quando escopo = campaign)
- Query em `meta_adsets` (quando escopo = adset)
- Query em `meta_ads` (quando escopo = ad)
- Filtrar por `organization_id` e mostrar nome + status

**2. Adicionar seletor multi-select no formulario `NewRuleDialog`**:
- Quando o usuario escolhe o escopo (ex: "Campanha"), carregar a lista de campanhas reais
- Checkbox multi-select para marcar especificas ou "Todas"
- Mostrar nome da campanha e status (ACTIVE/PAUSED)
- Salvar os IDs selecionados em `scope_ids`

**3. Exibir na tabela de regras** quais campanhas estao vinculadas (ex: "3 campanhas" ou "Todas").

**4. Sem mudancas no backend** -- a Edge Function `getCampaignIds` ja respeita `scope_ids` quando preenchido.

### Detalhes tecnicos

- Novo hook `src/hooks/useMetaEntities.ts` com 3 queries condicionais
- Componente multi-select usando Checkbox + ScrollArea dentro do dialog
- Tabelas consultadas: `meta_campaigns`, `meta_adsets`, `meta_ads` (ja existem no schema)
- Campo `scope_ids` (TEXT[]) ja existe na tabela `automation_rules`

