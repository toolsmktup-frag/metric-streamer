

## Plano: Adicionar seletor de tema (Dark/Light/Sistema) nas Configuracoes

### Problema atual
O dark mode esta configurado como `darkMode: "media"` no Tailwind, ou seja, segue automaticamente o sistema operacional. Nao ha como o usuario escolher manualmente.

### Mudancas

**1. `tailwind.config.ts` — Trocar `darkMode` de `"media"` para `"class"`**
- Isso permite controlar o tema via classe `dark` no `<html>`, mantendo compatibilidade com a opcao "Sistema"

**2. Novo hook `src/hooks/useTheme.ts`**
- Gerencia 3 opcoes: `light`, `dark`, `system`
- Salva preferencia no `localStorage` (chave `theme`)
- Quando `system`, escuta `matchMedia('prefers-color-scheme: dark')` e aplica automaticamente
- Aplica/remove classe `dark` no `document.documentElement`
- Inicializa no mount (chamado no App ou layout)

**3. `src/pages/UserSettings.tsx` — Adicionar secao "Aparencia"**
- Abaixo do botao "Salvar perfil" e antes de "Alterar senha"
- 3 botoes tipo toggle group: Claro / Escuro / Sistema (com icones Sun, Moon, Monitor)
- Ao clicar, chama `setTheme()` do hook — efeito imediato

**4. `src/App.tsx` ou `src/components/layout/AppLayout.tsx` — Inicializar tema**
- Chamar `useTheme()` no layout raiz para garantir que a classe `dark` e aplicada ao carregar

### Resultado
- Usuario abre Configuracoes → ve secao "Aparencia" com 3 opcoes
- Escolhe Light, Dark ou Sistema → tema muda imediatamente
- Preferencia persiste entre sessoes via localStorage

