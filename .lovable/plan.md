

## Snippet de Tracking por Etapa do Funil + Validador

### Ideia
Ao lado do campo "URL da página" de cada etapa, adicionar um botão que abre um popover/dialog com:
1. **Snippet gerado automaticamente** — `<script>` tag com `data-endpoint`, `data-funnel-id` e `data-stage-id` preenchidos
2. **Botão "Copiar"** com feedback visual
3. **Botão "Testar"** que faz um POST de teste ao endpoint e mostra ✅ ou ❌
4. O botão só aparece quando a etapa tem `page_url` preenchida

### Arquivos

**1. Novo: `src/components/lead-funnels/TrackingSnippetPopover.tsx`**
- Recebe `funnelId`, `stageId`, `stageName`, `pageUrl`
- Gera o snippet:
```html
<script src="https://metric-streamer.lovable.app/tracking/tracker.js"
        data-endpoint="https://emfbocpmphtftqcezaib.supabase.co/functions/v1/track-event"
        data-funnel-id="ID"
        data-stage-id="ID"
        defer></script>
```
- Botão copiar com `navigator.clipboard` + toast
- Botão "Testar" que envia evento `tracking_test` via fetch e mostra resultado
- Usa Popover do shadcn (já existe no projeto)

**2. Editar: `src/components/lead-funnels/FunnelConfigTab.tsx`**
- Ao lado do input `page_url`, adicionar o `<TrackingSnippetPopover>` (ícone `<Code>` do Lucide)
- Aparece só quando `page_url` não está vazio

**3. Editar: `public/tracking/tracker.js`**
- Ler `data-funnel-id` e `data-stage-id` do script tag
- Incluir `funnel_id` e `stage_id` no payload enviado ao endpoint
- Campos opcionais — retrocompatível

**4. Editar: `supabase/functions/track-event/index.ts`**
- Aceitar `funnel_id` e `stage_id` opcionais no payload
- Incluir no log

### O que NÃO muda
- Nenhuma tabela criada/alterada
- Nenhum outro componente tocado
- tracker.js continua funcionando sem os novos atributos

