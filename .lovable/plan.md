

## Enriquecer Painel de Contato do WhatsApp

### Objetivo
Trazer todas as informações do lead (compras, funis, timeline de eventos) diretamente no painel lateral do WhatsApp, para o vendedor não precisar sair da tela.

### O que muda

**1. Novo hook: `useLeadByPhone`** (`src/hooks/useLeadByPhone.ts`)
- Busca o lead na tabela `leads` pelo número de telefone
- Retorna o lead completo (id, name, email, phone, metadata)

**2. Atualizar `ContactPanel.tsx`**
- Usar `useLeadByPhone(phone)` para obter o lead
- Com o lead encontrado, chamar os hooks existentes:
  - `useLeadPurchases(email, phone)` → seção **Vendas** com lista de compras, valor total, status
  - `useLeadFunnelJourney(leadId)` → seção **Funis** com nome do funil + etapa atual + tempo
  - `useLeadEvents(leadId)` → seção **Timeline** com eventos ordenados (pagamentos, PIX, boletos, etc.)
- Substituir os placeholders "Nenhum funil vinculado" / "Nenhuma venda encontrada" pelos dados reais
- Reutilizar a mesma lógica visual do `LeadTimeline.tsx` (ícones, cores, badges) adaptada ao espaço menor do painel

### Seções do painel (ordem final)
1. **Header** (avatar, nome, telefone) — já existe
2. **Notas internas** — já existe
3. **Vendas** — total gasto + lista de compras com status/data/valor
4. **Funis** — cards com funil > etapa + tempo relativo
5. **Timeline** — eventos cronológicos com ícones coloridos
6. **Tags** — mantém placeholder

### Arquivos alterados
- `src/hooks/useLeadByPhone.ts` (novo)
- `src/components/whatsapp/ContactPanel.tsx` (atualizado)

