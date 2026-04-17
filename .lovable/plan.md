
## SQL pendentes pra rodar no Supabase

Baseado nas últimas features que implementamos, esses são os scripts que ainda dependem de você rodar no SQL Editor pra funcionar 100%:

### 1. RPC de Venda Manual (CRÍTICO — feature recém-implementada)
**Arquivo:** `docs/sql/insert-manual-sale.sql`
**Pra que serve:** Cria a função `insert_manual_sale` usada pelo botão "Inserir venda manual" no `/crm-analytics`. Sem isso o botão dá erro.

### 2. Tabela de Acesso a Instâncias WhatsApp (se ainda não rodou)
**Arquivo:** `docs/whatsapp-instance-access.sql`
**Pra que serve:** Cria a tabela `whatsapp_instance_access` + RLS. É o que sustenta a correção do auto-grant que acabei de fazer na edge function (vendedora ver instância que ela criou).
**Como saber se já rodou:** se admin já consegue gerenciar acessos por instância em `/equipe`, então já tá rodada. Pula.

### Como rodar
1. Abre o **Supabase Dashboard → SQL Editor**
2. Cola o conteúdo do arquivo, na ordem (1 depois 2 — mas a ordem não importa porque são independentes)
3. Run

### Validação rápida
- **Pós #1:** `/crm-analytics` → botão "Inserir venda manual" → preenche e salva sem erro.
- **Pós #2:** vendedora cria instância nova → ela aparece na lista dela na hora.

### Observação
Outros arquivos em `docs/` e `docs/sql/` são de migrations antigas (Meta CAPI, recontact, lead funnels, tracking IDs, etc) — se você já rodou ao longo do tempo, ignora. Esses dois acima são os únicos atrelados a features recentes que dependem da sua ação.
