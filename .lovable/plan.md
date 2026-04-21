

## Renomear labels da configuração de movimentação

### Problema
Os labels atuais sugerem filtragem ("Quem está na etapa X"), mas os campos definem **destinos de movimentação**. Fica ambíguo.

### Mudanças em `src/components/lead-funnels/WhatsAppGroupSyncConfig.tsx` (linhas 219–235)

Trocar os 4 labels do bloco de etapas para deixar claro que são **destinos**:

| Antes | Depois |
|---|---|
| Quem está na etapa | **Quem entrou no grupo → mover para** |
| Mas não está na etapa | **Quem não está no grupo → mover para** |
| Depois de convidar | **Depois de convidar → mover para** |
| Quando sair do grupo | **Quando sair do grupo → mover para** |

E ajustar o placeholder do `StageSelect` desses 4 campos de `"Mover para..."` para `"Selecionar etapa..."` (evita repetição com o label).

Também atualizar o `Alert` da linha 251 para refletir o novo texto:
- De: `"Escolha instância, pelo menos um grupo e a etapa para quem está no grupo."`
- Para: `"Escolha a instância, pelo menos um grupo e a etapa de destino para quem entrou no grupo."`

### Detalhes técnicos
- **Arquivo único:** `src/components/lead-funnels/WhatsAppGroupSyncConfig.tsx`
- **Sem mudança de lógica, schema, hooks ou edge functions** — puramente UI/copy.
- **Sem deploy de função.**

