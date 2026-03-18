

## Plano: Modal centralizado de gerenciamento de instâncias

Atualmente o botão de configuração (⚙️) abre um Sheet lateral para gerenciar **uma única instância** (a selecionada no dropdown). A ideia é transformar isso num **modal centralizado** que lista todas as instâncias, permite selecionar qual editar, e também adicionar novas — tudo num só lugar.

### O que muda

1. **Novo componente `InstanceHub.tsx`** — Um `Dialog` (modal) que substitui o Sheet + AddInstanceDialog separados:
   - **Lista de instâncias** no lado esquerdo (ou topo): mostra todas as instâncias com status (conectado/desconectado), nickname/display_name, e badge de status
   - **Painel de detalhes** no lado direito: ao clicar numa instância, mostra o conteúdo atual do `InstanceManagement` (status, QR code, apelido, perfil, privacidade, controle de acesso, deletar)
   - **Botão "+ Nova Instância"** na lista, que abre o formulário de criação (atualmente no `AddInstanceDialog`) inline no painel de detalhes

2. **Remover `AddInstanceDialog` do top bar** — O botão "+ Instância" sai da barra superior. Fica só o ícone ⚙️ que abre o modal centralizado.

3. **Layout do modal**:
   - `max-w-4xl` para caber as duas colunas
   - Coluna esquerda (~200px): lista de instâncias com ícone de status
   - Coluna direita: conteúdo do gerenciamento (reutiliza toda a lógica atual do `InstanceManagement`)

4. **`WhatsAppChat.tsx`** — Simplifica a top bar: remove `AddInstanceDialog`, mantém só o botão ⚙️ que abre o `InstanceHub`.

### Arquivos afetados

- **Criar**: `src/components/whatsapp/InstanceHub.tsx`
- **Editar**: `src/pages/WhatsAppChat.tsx` (trocar Sheet por modal, remover AddInstanceDialog inline)
- **Editar**: `src/components/whatsapp/InstanceManagement.tsx` (extrair conteúdo para ser renderizado dentro do Hub, ou manter como sub-componente)

### Comportamento

- Clicar no ⚙️ → abre modal com todas as instâncias listadas
- Primeira instância pré-selecionada
- Clicar em "+ Nova Instância" → formulário de criação aparece no painel direito
- Após criar, a nova instância aparece na lista e fica selecionada
- Fechar o modal → volta ao chat normalmente

