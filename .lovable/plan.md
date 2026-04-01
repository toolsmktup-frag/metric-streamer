## Minhas Metas — Página Gamificada para Vendedoras

### 1. Banco de dados (migrações)
- **Tabela `seller_goals`**: `id`, `user_id`, `month` (YYYY-MM), `goal_amount` (meta em R$), `commission_percent` (% comissão configurável pelo admin), `created_by`, `created_at`
- **Tabela `seller_achievements`**: `id`, `user_id`, `achievement_key` (ex: "first_sale_of_day", "5_sales_day", "streak_7"), `unlocked_at`, `month`
- RLS: vendedora lê apenas seus registros; admin pode inserir/atualizar metas

### 2. Lógica de negócio (hooks)
- **`useSellerGoals`**: busca meta do mês atual do usuário logado
- **`useSellerStats`**: calcula vendas, receita, comissão do mês a partir de `customer_purchases` (affiliate_name matching)
- **`useSellerStreak`**: calcula dias consecutivos com venda
- **`useSellerAchievements`**: lista conquistas desbloqueadas + verifica novas

### 3. Níveis gamificados (baseado em vendas acumuladas no mês)
- **Bronze**: 0-10 vendas
- **Prata**: 11-25 vendas  
- **Ouro**: 26-50 vendas
- **Diamante**: 51+ vendas

### 4. Conquistas desbloqueáveis
- "Primeira venda do dia" 🌅
- "5 vendas em um dia" ⚡
- "Meta batida" 🏆
- "Streak de 7 dias" 🔥
- "Meta batida 2 meses seguidos" 👑

### 5. Página `/leads/metas` 
- Header com avatar + apelido + badge de nível + botão notificações
- Card principal: meta do mês com barra de progresso animada + marcadores 25/50/75/100%
- Mensagem motivacional dinâmica
- Confetti ao bater 100% (canvas-confetti)
- Grid 4 KPIs: leads chamados hoje, vendas R$ hoje, comissão acumulada, taxa conversão
- Seção de streak (dias consecutivos)
- Grid de conquistas (desbloqueadas vs travadas)
- Mini gráfico histórico dos últimos 6 meses

### 6. Menu lateral
- Adicionar "Minhas Metas" como primeiro item da seção Leads
- Rota: `/leads/metas`

### 7. Admin: definir metas
- Na página de Equipe, adicionar aba/modal para definir meta mensal por vendedora
