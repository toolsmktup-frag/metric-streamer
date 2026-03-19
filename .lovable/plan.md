

## Plano: Corrigir tela branca do WhatsApp e loop infinito

### Problemas identificados

1. **Loop infinito (`Maximum update depth exceeded`)**: Em `WhatsAppChat.tsx` linha 73, `isAllMode ? instances : []` cria um novo array `[]` a cada render. Isso muda a referência da prop de `useWhatsAppMultiChats`, que recria o `fetchAllChats` callback, que dispara o `useEffect`, que chama `setChats`/`setLoading` → re-render → loop.

2. **Tela branca quando vendedor tem 1 instância**: O `selectedInstanceId` começa como `null` e só é setado automaticamente quando há `?phone=` na URL. Sem o param, o vendedor vê a tela sem instância selecionada e não consegue fazer nada. Deveria auto-selecionar a única instância disponível.

### Alterações

**1. Corrigir loop infinito (`WhatsAppChat.tsx`)**
- Substituir `isAllMode ? instances : []` por uma constante estável (ex: `const EMPTY: WhatsAppInstance[] = []` fora do componente) para evitar nova referência a cada render.

**2. Auto-selecionar instância quando só há uma (`WhatsAppChat.tsx`)**
- Adicionar um `useEffect` que, quando `instances.length === 1` e `selectedInstanceId` é `null`, seta automaticamente `selectedInstanceId = instances[0].id`.
- Isso garante que vendedores com acesso a apenas 1 instância já entram com ela selecionada e podem ver/iniciar conversas imediatamente.

**3. Estabilizar dependências em `useWhatsAppMultiChat.ts`**
- Usar `JSON.stringify(instances.map(i => i.id))` como chave no `useCallback`/`useEffect` para evitar recriação desnecessária quando a referência do array muda mas o conteúdo é o mesmo.

### Arquivos modificados
- `src/pages/WhatsAppChat.tsx` — constante vazia estável + auto-select de instância única
- `src/hooks/useWhatsAppMultiChat.ts` — estabilizar dependências do callback

