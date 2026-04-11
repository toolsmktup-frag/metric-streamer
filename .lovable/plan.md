

# Diagnóstico e Plano: Normalização de Eventos + Transição Automática de Etapas

## O que já está certo

A normalização de nomes de evento **já acontece** nos webhooks. Cada plataforma traduz seus status nativos para nomes canônicos ANTES de chamar `sync_lead_from_sale`:

```text
Ticto:  "cart_abandoned", "abandoned" → "abandoned_cart"
        "approved", "purchase_complete" → "authorized" → evento "purchase"
        "open", "pix_created" → "pending" → evento "pix_generated"

Guru:   "approved" → "authorized" → evento "purchase"
Eduzz:  status mapeado → evento "purchase"
```

Ou seja, independente da plataforma, o sistema já converte para um vocabulário único: `purchase`, `pix_generated`, `abandoned_cart`, `refused`, `refunded`, `chargeback`.

**Não é um monstro de sete cabeças** — a arquitetura está correta. Mas tem dois furos que impedem funcionar:

## Os 2 problemas reais

### Problema 1: Guru e Eduzz só sincronizam "purchase"

O Ticto já envia **todos** os eventos para o lead (abandoned_cart, pix_generated, refused, etc.). Mas o Guru só chama `sync_lead_from_sale` quando `status === "authorized"` (linha 327). Eduzz idem. Resultado: carrinho abandonado e PIX gerado da Guru/Eduzz **nunca chegam ao CRM**.

### Problema 2: A RPC `sync_lead_from_sale` ignora as regras de transição

Mesmo quando o evento chega (ex: `abandoned_cart` via Ticto), a RPC sempre posiciona o lead no **primeiro stage** do funil. Ela nunca consulta `stage_transition_rules` para mover o lead para a etapa correta (ex: "Carrinho Abandonado").

Curiosamente, o `webhook-lead` (captura de leads) **já aplica** as regras de transição (linhas 142-170). Só falta replicar essa lógica na RPC de vendas.

### Problema bônus: UI usa campo de texto livre para nome do evento

O campo "Nome do evento" nas regras de transição é um `<Input>` de texto livre. O usuário precisa digitar exatamente `abandoned_cart` — qualquer erro de digitação quebra a regra.

## Plano de implementação

### 1. Atualizar Guru e Eduzz para sincronizar todos os eventos

Adicionar mapeamento de eventos (igual ao Ticto) nos webhooks da Guru e Eduzz, chamando `sync_lead_from_sale` para `abandoned_cart`, `pix_generated`, `refused`, `refunded` — não apenas `purchase`.

### 2. Atualizar RPC `sync_lead_from_sale` (v5)

Após posicionar o lead no stage inicial, consultar `stage_transition_rules` e mover o lead para a etapa configurada, usando a mesma lógica que já existe no `webhook-lead`:

```text
Se existe regra para (funnel_id + event_name):
  → UPDATE lead_stage_positions SET stage_id = to_stage_id
Se não existe regra:
  → Mantém no primeiro stage (comportamento atual)
```

### 3. Trocar campo de texto por dropdown na UI

Substituir o `<Input>` por um `<Select>` com os eventos canônicos pré-definidos:

| Evento | Label na UI |
|--------|------------|
| `purchase` | Compra Aprovada |
| `pix_generated` | PIX/Boleto Gerado |
| `abandoned_cart` | Carrinho Abandonado |
| `refused` | Pagamento Recusado |
| `refunded` | Reembolso |
| `chargeback` | Chargeback |

Manter opção "Outro (personalizado)" para eventos custom do `webhook-lead`.

### 4. Backfill dos leads existentes

SQL para reprocessar `lead_events` históricos e aplicar as regras de transição retroativamente, movendo leads que já têm eventos registrados para as etapas corretas.

## Detalhes técnicos

- **Arquivos modificados**: `guru-webhook/index.ts`, `eduzz-webhook/index.ts` (adicionar mapeamento de eventos), migration SQL para `sync_lead_from_sale` v5, `FunnelConfigTab.tsx` (dropdown)
- **Sem novas tabelas** — tudo usa `stage_transition_rules` que já existe
- **Deploy manual** das Edge Functions e RPC via Dashboard do Supabase

