

## Salvar endereço do cliente no Lead (via metadata)

### Situação atual
- O webhook da Guru envia dados de endereço (CEP, rua, número, bairro, cidade, estado) no payload
- O `wz-receiver` **não extrai** esses campos — eles são descartados
- A tabela `leads` já tem um campo `metadata` JSONB que armazena `product_name`, `status`, `amount`
- A RPC `sync_lead_from_sale` faz merge de metadata (`leads.metadata || p_metadata`)

### Plano

**1. Extrair endereço no `wz-receiver`** (`supabase/functions/wz-receiver/index.ts`)
- Ler do payload os campos `address`, `street`, `zipcode`/`cep`, `number`, `neighborhood`/`bairro`, `city`/`cidade`, `state`/`estado` (com fallbacks para ambos Ticto e Guru)
- Incluir no objeto `variables` que vai para o executor e no `p_metadata` que vai para `sync_lead_from_sale`

**2. Passar endereço no `p_metadata` da RPC** (já acontece automaticamente se incluirmos no metadata do receiver)
- Campos salvos no `leads.metadata`: `address_street`, `address_number`, `address_neighborhood`, `address_city`, `address_state`, `address_zipcode`, `address_complement`

**3. Exibir na UI do Lead** (`src/components/lead-funnels/LeadDetailPanel.tsx` ou similar)
- Adicionar uma seção/aba "Endereço" no painel de detalhes do lead
- Mostra os campos formatados a partir do `metadata`
- Se não houver dados de endereço, a seção fica oculta

### Arquivos editados
- `supabase/functions/wz-receiver/index.ts` — extrair campos de endereço do payload
- Componente de detalhes do lead — nova seção "Endereço"

### Resultado
O endereço chega no webhook → é extraído → salvo no `metadata` do lead → visível no CRM. Sem alteração de schema, sem nova tabela.

