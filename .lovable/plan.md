

## Diagnóstico e Plano de Correção

### Problemas identificados

**1. Browser trava ao renderizar 26k+ cards**
O Kanban renderiza TODOS os 26k leads como elementos DOM simultaneamente. Cada card tem ~15 elementos DOM, totalizando ~400k nós DOM. Isso trava qualquer navegador ao fazer sort (re-render de todos).

**2. Dados de compra/LTV não aparecem nos cards**
O hook `useBulkLeadPurchases` faz queries batch para `unified_customers` e `customer_purchases`. Com 26k leads, extrai milhares de emails/phones e faz múltiplas queries em chunks de 300. Provavelmente está demorando muito ou falhando silenciosamente. Além disso, os cards estão no screenshot sem badges de LTV — o hook pode não estar retornando dados a tempo.

**3. Sort "Mais recentes" re-renderiza 26k cards**
Mudar o sort mode causa `getLeadsForStage()` recalcular e re-renderizar todos os cards de todas as colunas.

### Solução

**1. Limitar cards renderizados por coluna (virtual pagination)**
- Renderizar apenas os primeiros 50 cards por coluna
- Botão "Mostrar mais" que carrega +50
- Isso resolve o travamento imediatamente sem precisar de virtualização complexa

**2. Otimizar o hook de compras**
- Adicionar tratamento de erro silencioso (não bloquear se falhar)
- Garantir que o Map retornado está correto e o LeadCard recebe os dados

**3. Memoizar `getLeadsForStage` por coluna**
- Usar `useMemo` com dependências corretas para evitar re-sort desnecessário

### Arquivos a alterar

| Arquivo | Ação |
|---------|------|
| `src/components/lead-funnels/KanbanBoard.tsx` | Limitar renders por coluna (50 + "mostrar mais"), memoizar sort |
| `src/hooks/useBulkLeadPurchases.ts` | Adicionar error handling, verificar lógica de mapeamento |
| `src/components/lead-funnels/LeadCard.tsx` | Verificar que badges LTV renderizam corretamente com dados |

### Detalhe técnico - Paginação por coluna

```text
Coluna "Comprador" (26127 leads)
├── Card 1
├── Card 2
├── ...
├── Card 50
└── [Mostrar mais 50 de 26127] ← botão

Ao clicar: renderiza cards 51-100, etc.
```

Isso reduz de ~400k nós DOM para ~500 (50 cards × 2 colunas × ~5 nós cada).

