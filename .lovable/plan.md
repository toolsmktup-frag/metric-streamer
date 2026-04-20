

## Transferir leads de um vendedor específico (ex: Dani → Luísa)

Hoje a redistribuição funciona em 3 escopos: leads sem vendedor, com vendedor, ou todos. **Falta o caso "leads de UM vendedor específico"** — que é exatamente quando alguém sai do time.

### O que vai mudar

Adicionar um novo escopo no diálogo "Redistribuir Leads": **"Leads de um vendedor específico"**. Quando selecionado, aparece um seletor pra escolher QUAL vendedor é a origem (Dani), e os checkboxes embaixo viram os vendedores DESTINO (Luísa, ou Luísa + Matheus + Gabriela em round-robin).

### Mudanças na UI (`RedistributeLeadsDialog.tsx`)

1. **Novo item no select de Escopo**: "Leads de um vendedor específico"
2. **Quando esse escopo está ativo**:
   - Mostra um campo "Vendedor de origem" com dropdown listando todos os vendedores que TÊM leads no funil (inclusive inativos/removidos, pra cobrir o caso da Dani que saiu)
   - O bloco "Vendedores" embaixo passa a se chamar **"Distribuir para"** (deixa claro que são os destinos)
   - Filtra automaticamente o vendedor de origem da lista de destinos (não faz sentido transferir pra ela mesma)
3. **Preview** continua igual: mostra "200 leads de Dani serão redistribuídos: Luísa 200"

### Mudanças no hook (`useRedistributeLeads.ts`)

1. Aceitar novo `scope: 'from_seller'` + parâmetro novo `fromSellerId: string`
2. No filtro por escopo, quando for `from_seller`: filtrar leads onde `assigned_to === fromSellerId`
3. Resto da lógica (round-robin, batches de 500, update em chunks de 100) fica idêntico

### Buscar vendedores que têm leads (incluindo inativos)

Hoje o hook só lista vendedores **ativos com acesso ao funil**. Pra o caso "Dani saiu", preciso uma fonte adicional: query `SELECT DISTINCT assigned_to` direto em `leads` filtrado pelo funil + join em `user_profiles` pra pegar o nome — mesmo que o status seja `inactive` ou `removed`. Isso garante que a Dani aparece no dropdown de origem mesmo depois de desativada.

### Permissão

Já está protegido: o botão "Redistribuir Leads" só aparece em `FunnelConfigTab.tsx` (aba de configuração do funil), que é restrita a admin/gestor. Nada novo a fazer aqui.

### Arquivos impactados
- `src/components/lead-funnels/RedistributeLeadsDialog.tsx` — novo escopo + seletor de origem + nova query de "vendedores com leads"
- `src/hooks/useRedistributeLeads.ts` — suporte ao escopo `from_seller`

### Esforço
~20 min, ~2 créditos. É uma extensão limpa do que já existe.

