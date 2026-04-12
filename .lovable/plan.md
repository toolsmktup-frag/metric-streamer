

## Redesign do Painel de Configuração de Nós (WzNodeConfigPanel)

### Problemas atuais

1. **Textarea com `resize-none`** — impossível expandir o campo de texto
2. **Sheet muito estreito** (340-380px) — tudo fica apertado, especialmente com chips de variáveis + textarea + toggles
3. **Layout comprimido** — muitos elementos empilhados em espaço mínimo

### Referência (imagem 483)

A ferramenta de referência usa um painel lateral largo (~420-450px) com:
- Seletor de conexão (instância) com ícone e engrenagem
- Área de texto generosa e expansível
- Delay e blocos bem espaçados
- Seções colapsáveis para organizar

### Plano de mudanças

#### 1. Largura e textarea expansível
- Aumentar Sheet de `w-[340px] sm:w-[380px]` para `w-[400px] sm:w-[440px]`
- Remover `resize-none` do textarea de mensagem e trocar para `resize-y min-h-[100px]`
- Manter `resize-none` apenas no campo de Notas (que é secundário)

#### 2. Melhorar espaçamento e legibilidade
- Aumentar padding interno dos blocos de mensagem
- Chips de variáveis em 2 linhas com scroll horizontal ou wrap mais limpo
- Separar visualmente as seções (instância, mensagem, delay) com `border-b` ou headers

#### 3. Seção de instância mais visual
- Mostrar ícone do WhatsApp no seletor de instância (como na referência)
- Texto helper "Deixe em branco para usar a conexão dos blocos anteriores" (se aplicável)

#### 4. Auto-resize do textarea
- Implementar auto-grow: o textarea cresce conforme o usuário digita, sem precisar arrastar manualmente

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `WzNodeConfigPanel.tsx` | Largura do Sheet, textarea resize-y + auto-grow, espaçamento entre seções, ícone na instância |

### Escopo

Foco em usabilidade — não muda funcionalidade, apenas ergonomia do painel.

