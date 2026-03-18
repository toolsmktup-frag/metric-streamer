

## Plano: Redesign da Timeline + Migração Automática

### 1. Redesign do `LeadTimeline.tsx`

Redesenhar o componente para seguir o layout da referência:

- **Header**: Avatar circular com iniciais + nome + telefone + email + tags (funil atual, fonte, etapa)
- **Compras**: Badge com contagem, card "Receita líquida total" com valor em destaque, lista de produtos com badge de plataforma (eduzz/ticto/guru) e tipo de pagamento
- **Jornada nos Funis**: Badge com contagem de funis, cards coloridos com nome do funil + etapa + tempo relativo
- **Timeline de Eventos**: Contagem de eventos no header, ícones por tipo de evento (cadastro, compra), timestamps com hora + tempo relativo (+0min), detalhes como valor e plataforma

### 2. Remover botão "Sincronizar Base"

No `LeadsDashboard.tsx`, remover o botão e o estado `syncing`. A sincronização será feita via deploy direto da Edge Function quando necessário, não pela UI.

### 3. Migração automática no `sync-leads-from-sales`

A lógica de migração (passo 6 da função) já existe e posiciona todos os leads no funil BASE DE LEADS. O usuário só precisa invocar a função uma vez via terminal/API para migrar todos os leads atuais:

```
curl -X POST https://emfbocphtftqcezaib.supabase.co/functions/v1/sync-leads-from-sales
```

### Arquivos alterados

| Arquivo | Ação |
|---------|------|
| `src/components/lead-funnels/LeadTimeline.tsx` | Redesign completo do layout |
| `src/pages/LeadsDashboard.tsx` | Remover botão Sincronizar Base |

