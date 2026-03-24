
Objetivo: corrigir o importador Guru para não marcar tudo como “Duplicados (pulados)” quando, na prática, os registros estão sendo descartados por `platform_transaction_id` vazio.

1. Confirmar a causa no fluxo atual
- O screenshot indica: `1907 total`, `0 inseridos`, `1907 pulados`, `0 erros`.
- Pelo código atual, isso só acontece se todas as linhas entrarem em `if (!record.platform_transaction_id) { skipped++; continue; }` na edge function `process-import`.
- Portanto, limpar o funil não é a causa; o problema está no parsing/mapeamento do ID da transação do Guru.

2. Corrigir o parser do Guru no frontend
- Reforçar `normalizeGuruRow` para limpar o valor de `transaction_id` com `trim`, remoção de aspas/BOM e normalização de strings vazias.
- Evitar `cols[idx] || null` cru para campos críticos; usar helper consistente como já existe em Ticto/Eduzz.
- Adicionar fallback controlado se a coluna principal vier vazia e houver outro identificador confiável na planilha.

3. Melhorar a validação antes do envio
- Antes de começar a importação, contar quantas linhas ficaram sem `platform_transaction_id`.
- Se houver muitas inválidas, bloquear a importação e mostrar mensagem clara do tipo: “X linhas sem ID de transação no arquivo Guru”.
- Exibir o campo de ID também na prévia/log para facilitar conferência.

4. Corrigir a semântica do resultado
- Hoje o card “Duplicados (pulados)” é enganoso: `skipped` também significa “sem ID”.
- Separar métricas em:
  - inseridos
  - duplicados
  - inválidos/sem ID
  - erros
- Ajustar logs por batch para refletir isso corretamente.

5. Tornar a edge function mais robusta
- Sanitizar `record.platform_transaction_id` também no backend antes da validação.
- Registrar em `errorDetails` ou contador dedicado quando o motivo do skip for ID ausente.
- Manter `upsert` como está para duplicados reais, mas sem misturar com linhas inválidas.

6. Resultado esperado após a implementação
- Se a planilha estiver correta, os registros do Guru passam a entrar normalmente.
- Se o arquivo vier com coluna problemática, o sistema acusa isso antes do import.
- O painel deixa de mostrar “duplicados” quando o problema real for ausência de ID.

Detalhes técnicos
- Arquivos principais:
  - `src/pages/Importar.tsx`
  - `supabase/functions/process-import/index.ts`
- Causa mais provável:
  - `normalizeGuruRow` usa `platform_transaction_id: cols[GURU_COLS.transaction_id] || null`
  - com Excel/XLSX, esse campo pode chegar como string vazia/suja
  - a edge function então incrementa `skipped` para todas as linhas
- Observação importante:
  - limpar o funil só afeta CRM/leads; não explica `0 inseridos / 1907 pulados` nesse fluxo de `customer_purchases`.
