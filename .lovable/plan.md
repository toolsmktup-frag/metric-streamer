

## Plano: Roteamento granular por status na importação

### Problema atual
A separação é binária: "comprador" vs "não-comprador". Na prática, existem vários status distintos (authorized, pix_created, bank_slip_created, open, waiting_payment, etc.) e o usuário quer poder rotear cada um para uma etapa diferente do funil.

### Solução

**Arquivo: `ImportLeadsDialog.tsx`**

Substituir o toggle binário "Separar por status" por um sistema de mapeamento dinâmico:

1. **Detectar status únicos**: Ao carregar a planilha, extrair todos os valores únicos da coluna `status` e contar quantos leads cada um tem.

2. **Interface de mapeamento**: Em vez de apenas "etapa para compradores" e "etapa para não-compradores", mostrar uma lista de todos os status encontrados (ex: `authorized (450)`, `pix_created (200)`, `open (113)`), cada um com um dropdown para selecionar a etapa destino.

3. **Etapa padrão**: Manter um select de "Etapa padrão" para status não mapeados ou leads sem status.

4. **Lógica de importação**: Agrupar leads por status, e para cada grupo, importar para a etapa selecionada. Leads sem mapeamento específico vão para a etapa padrão.

### UI proposta

```text
┌─────────────────────────────────────┐
│ Etapa padrão (fallback)             │
│ [Select: Novo ▾]                    │
│                                     │
│ ☑ Separar por status                │
│                                     │
│  authorized (450)    → [Comprador ▾]│
│  pix_created (200)   → [Pix Gerado▾]│
│  bank_slip (39)      → [Pix Gerado▾]│
│  open (113)          → [Carrinho ▾] │
└─────────────────────────────────────┘
```

### Mudanças técnicas

- Remover `BUYER_STATUSES`, `isBuyerLead`, e o state `buyerStage`
- Adicionar state `statusStageMap: Record<string, string>` — mapeia status → stage ID
- Computar `uniqueStatuses` com contagem a partir de `parsedRows`
- No `handleImport`, agrupar leads por status e importar cada grupo para a etapa correspondente (ou fallback para `selectedStage`)
- Manter compatibilidade: se o toggle estiver desligado, tudo vai para a etapa padrão como antes

