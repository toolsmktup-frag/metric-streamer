
## Plano: Importação como Eventos na Timeline + Fix do Bug de Leads Não Salvos

### Problema Atual

1. **Bug**: O batch `insert` falha inteiro quando há duplicatas dentro do mesmo lote (ex: mesmo email 2x no CSV ou conflito com unique constraint). Isso causa os "88 ignorados" e leads não salvos.

2. **Lógica errada**: Leads existentes só têm UTMs atualizados — nenhum evento real é registrado com os dados da planilha (produto, valor, status). Você perde o histórico de ações.

### O Que Vai Mudar

**`useImportLeads.ts`** — reescrever a lógica de importação:

1. **Inserção com `upsert`** (on conflict) em vez de `insert` puro — se o lead já existe por email/phone, atualiza sem falhar o batch inteiro.

2. **Cada linha da planilha vira um evento na timeline** com os dados completos (produto, valor, status/ação, plataforma). Em vez de evento genérico `"import"`, usar o status real da planilha (ex: `pix_expired`, `bank_slip_delayed`, `purchase`) como `event_name`.

3. **Posicionamento no funil**: Lead existente que já está no funil mantém a posição (não sobrescreve), a menos que o mapeamento de status defina uma etapa diferente.

### Resultado Esperado

- Zero leads ignorados (upsert resolve conflitos)
- Timeline do lead mostra cada ação importada como evento separado (ex: "gerou pix 3x e não pagou")
- Dados de produto, valor e plataforma preservados no metadata do evento

### Arquivos Alterados

- `src/hooks/useImportLeads.ts` — lógica principal de upsert + eventos detalhados
