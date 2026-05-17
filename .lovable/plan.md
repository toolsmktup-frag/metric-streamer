# Editar funil de tráfego: abrir só o funil clicado

## Problema
Ao clicar em "Editar" embaixo de um funil de tráfego no sidebar (ex: Erveiros), a página `/funis/configurar?editar=<id>` já abre o editor certo, **mas continua mostrando abaixo a lista de TODOS os funis** + título "Gerenciar Funis". O usuário espera ver só o editor daquele funil.

## Solução
Em `src/pages/FunisConfigurar.tsx`, quando a página é aberta via `?editar=<id>` (modo "edição focada"):

1. Esconder a lista de outros funis (cards abaixo do editor).
2. Trocar o título "Gerenciar Funis" por "Editar Funil – <nome>".
3. Esconder o botão "Novo Funil".
4. No "Cancelar"/após salvar, voltar para a página do funil de leads de origem (ou `/leads/dashboard` se não houver referrer), em vez de cair na lista geral.

Quando a página é aberta sem `?editar=` (via sidebar "Gerenciar Funis" ou "Novo funil"), comportamento atual permanece: lista completa + opção de criar/editar qualquer um.

## Detalhes técnicos
- Detectar modo focado: `const focusedEditId = searchParams.get('editar')`.
- Renderização condicional: se `focusedEditId` setado, não renderiza o bloco da listagem (loop de cards em `funnels.map(...)`).
- `cancelEdit()` e callback de save: se modo focado, `navigate(-1)` (volta) em vez de só limpar `editingId`.
- Sem mudanças em hooks, RPC, ou outras telas.

## Arquivos
- `src/pages/FunisConfigurar.tsx` (única alteração)
