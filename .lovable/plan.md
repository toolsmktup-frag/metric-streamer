

## Exportar dados da Inteligência de Cliente (36K clientes) para CSV

### Contexto
Os dados dos 36K clientes já são carregados no frontend via `useRFM()` (busca paginada da função `fn_rfm_customers`). Basta adicionar um botão de exportação que converte os dados em memória para CSV e faz o download.

### Implementação

**1. Criar utilitário `src/lib/exportCsv.ts`**
Função genérica que recebe um array de objetos e gera download de arquivo `.csv` com encoding UTF-8 BOM (compatível com Excel pt-BR).

**2. Adicionar botão "Exportar" no `RFMTab.tsx`**
- Botão com ícone `Download` ao lado dos filtros existentes
- Ao clicar, exporta todos os clientes (ou os filtrados pelo segmento selecionado) com as colunas:
  - Email, Nome, Segmento, Recência (dias), Frequência, Monetário (R$), Score R, Score F, Score M, Primeira Compra, Última Compra
- Nome do arquivo: `clientes-rfm-{segmento}-{data}.csv`

### Detalhes técnicos
- Usa `Blob` + `URL.createObjectURL` para download no browser — sem necessidade de backend
- UTF-8 BOM (`\uFEFF`) garante que Excel abra com acentos corretos
- Exporta os dados já em memória (`data.customers`), sem nova query

