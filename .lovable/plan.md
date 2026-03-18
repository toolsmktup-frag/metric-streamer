

## Plano: Botão de Sincronização na UI

Eu não consigo executar a Edge Function diretamente, mas posso criar um botão na interface que chama a função `sync-leads-from-sales` — que já tem toda a lógica pronta para migrar todos os leads para o funil BASE DE LEADS.

### O que fazer

**Arquivo:** `src/pages/LeadsDashboard.tsx`

Adicionar um botão discreto (ícone de refresh) no header do dashboard que:
1. Chama `supabase.functions.invoke('sync-leads-from-sales')` ao clicar
2. Mostra loading durante a execução
3. Exibe toast com resultado (leads criados, migrados, eventos)
4. Recarrega os dados do dashboard após sucesso

### Fluxo

Usuário clica no botão → Edge Function executa → Todos os leads da org são posicionados no funil BASE DE LEADS no estágio "Novo" → Toast confirma quantos foram migrados → Dashboard atualiza

### Resultado

Após um clique, todos os leads existentes (vindos de qualquer fonte) estarão visíveis no funil BASE DE LEADS.

