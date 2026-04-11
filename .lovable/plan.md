

## Diagnóstico: Por que o Pix gerado não move o lead para "Pix / Boleto Gerado"

### Causa raiz

A RPC `sync_lead_from_sale` **v5** — que é a versão que aplica as `stage_transition_rules` (as regras de transição que você configurou na imagem) — **nunca foi executada no banco de dados**. O arquivo existe apenas em `docs/rpc-sync-lead-from-sale-v5.sql` mas não foi adicionado como migration.

O banco está rodando a **v4**, que:
- Posiciona o lead no **primeiro stage** do funil (ex: "Base de clientes")
- **Ignora completamente** as regras de transição configuradas na interface

Ou seja, as regras "PIX/Boleto Gerado → Pix / Boleto Gerado", "Carrinho Abandonado → Recuperar", "Compra Aprovada → Compra Aprovada" estão salvas na tabela `stage_transition_rules`, mas a RPC não as consulta.

### Solução

**1. Criar migration com a RPC v5**
- Adicionar `supabase/migrations/20260411120000_sync_lead_from_sale_v5.sql` com o conteúdo de `docs/rpc-sync-lead-from-sale-v5.sql`
- Isso faz o deploy automático da função corrigida

**2. Resultado esperado**
Após o deploy:
- Pix gerado → lead vai para etapa "Pix / Boleto Gerado"
- Compra aprovada → lead vai para etapa "Compra Aprovada"  
- Carrinho abandonado, recusado, reembolso, chargeback → lead vai para "Recuperar"
- Cancelado → lead vai para "Recuperar"
- Tudo automático, conforme suas regras configuradas

### Arquivo alterado
- `supabase/migrations/20260411120000_sync_lead_from_sale_v5.sql` (novo)

