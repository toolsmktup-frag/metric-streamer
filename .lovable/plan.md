

## Diagnóstico

### Problema 1: Leads perdidos na importação
Na linha 210 do `ImportLeadsDialog.tsx`, o filtro `.filter(l => l.email || l.phone)` descarta leads sem email nem telefone. Na planilha, a primeira linha (Curso dos Erveiros, `billet_printed`) não tem nome/email/telefone — é descartada. Além disso, leads com status `open` e valor 0 sem produto também são descartados se não tiverem telefone.

Adicionalmente, o `useImportLeads.ts` não define `entered_at` nas posições — usa o default do banco (now()), quando deveria usar a data da compra (`purchased_at` do metadata).

### Problema 2: Eventos com nomes técnicos crus
O `buildEvent` no `useImportLeads.ts` (linha 70) usa o status bruto como `event_name`:
```
const eventName = status || 'import';
```
Isso gera eventos como `authorized`, `bank_slip_created`, `pix_created` em vez de `pago`, `boleto_gerado`, `pix_gerado`. A função `mapStatusToEventName` existe na edge function mas **não é usada no import**.

### Problema 3: Falta o evento "lead_importado"
A edge function cria um evento `lead_importado` para cada lead. O import via planilha não faz isso — só cria o evento do status.

### Problema 4: Sem métricas de produtos
O `FunnelMetricsTab` não mostra produtos. Os dados de produto já existem no `metadata.product_name` de cada lead.

---

## Plano de Implementação

### 1. Corrigir `useImportLeads.ts` — eventos e datas

a) **Adicionar `mapStatusToEventName`** (mesma lógica da edge function) para traduzir status brutos:
- `authorized/approved/paid` → `pago`
- `waiting_payment/pending` → `pix_gerado`
- `bank_slip_created/billet_printed` → `boleto_gerado`
- `pix_created` → `pix_gerado`
- `rejected/refused` → `rejeitado`
- etc.

b) **Criar evento `lead_importado`** para cada lead novo (não para updates), usando `purchased_at` como timestamp.

c) **Definir `entered_at`** nas posições usando `purchased_at` do metadata quando disponível.

d) **Aceitar leads só com nome** (relaxar filtro): se tem nome mas não email/phone, ainda importar (evita perder leads).

### 2. Atualizar `LeadTimeline.tsx` — novos event_names

Adicionar ao `EVENT_MAP`:
- `boleto_gerado` → "Boleto Gerado" (ícone FileText, cor amber)
- `bank_slip_created` → "Boleto Gerado" (legado)
- `billet_printed` → "Boleto Gerado" (legado)
- `open` → "Checkout Aberto" (ícone Eye, cor muted)
- `waiting_payment` → "Aguardando Pagamento" (ícone Clock, cor amber)
- `import` → "Importado" (fallback)

### 3. Adicionar seção "Produtos Mais Vendidos" ao `FunnelMetricsTab.tsx`

Extrair `metadata.product_name` de cada posição/lead e computar:
- Contagem de leads por produto
- Receita por produto (de leads em stages de receita)
- Gráfico de barras horizontal com ranking

Filtrar produtos nulos/vazios. Mostrar top 10.

### 4. Atualizar `LeadCard.tsx` — status amigável

O badge de status (linha 113) mostra `authorized` cru. Aplicar o mesmo mapeamento de labels amigáveis.

---

### Arquivos a editar
1. `src/hooks/useImportLeads.ts` — mapStatusToEventName, lead_importado event, entered_at, filtro relaxado
2. `src/components/lead-funnels/LeadTimeline.tsx` — novos entries no EVENT_MAP
3. `src/components/lead-funnels/FunnelMetricsTab.tsx` — seção de produtos mais vendidos
4. `src/components/lead-funnels/LeadCard.tsx` — label amigável no badge de status
5. `src/components/lead-funnels/ImportLeadsDialog.tsx` — relaxar filtro de leads sem email/phone

### Após implementação
Limpar o funil, reimportar a planilha e verificar que:
- Todos os leads aparecem (inclusive os sem email)
- Eventos na timeline mostram labels amigáveis com datas corretas
- Aba Métricas mostra ranking de produtos

