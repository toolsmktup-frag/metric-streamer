

## Separar Permissão de Automações do WhatsApp Chat

### Raciocínio
Vendedor precisa do Chat mas NÃO deve configurar automações. Hoje ambos estão sob `mod_whatsapp`. A solução é reaproveitar `mod_ferramentas` (que já existe na tabela `user_permissions` e no banco) para controlar Automações, já que "Ferramentas" foi renomeada para "Configurações" e sobrou sem uso claro.

### O que muda

| Item | Permissão atual | Permissão nova |
|------|-----------------|----------------|
| Chat WhatsApp | `mod_whatsapp` | `mod_whatsapp` (sem mudança) |
| Automações | `mod_whatsapp` | `mod_ferramentas` |
| Seção Configurações | `mod_ferramentas` | `mod_ferramentas` (sem mudança) |

### Implementação

1. **`AppSidebar.tsx`** — Tirar "Automações" de dentro do bloco `can('mod_whatsapp')` e mover para dentro do bloco `can('mod_ferramentas')` (ou renderizar com `can('mod_ferramentas')` próprio dentro da seção WhatsApp)
   - Opção mais limpa: Automações aparece na seção visual "WhatsApp" mas só se `can('mod_ferramentas')` for true

2. **`useUserPermissions.ts`** — Atualizar o label de `mod_ferramentas` de `'Ferramentas'` para `'Configurações & Automações'` para ficar claro na tela de Equipe

3. **Nenhuma migration** — a coluna `mod_ferramentas` já existe no banco

### Resultado
- Vendedor com `mod_whatsapp` = true e `mod_ferramentas` = false → vê Chat, NÃO vê Automações
- Admin/Gestor com ambos = true → vê tudo
- Na tela de Equipe, o toggle "Configurações & Automações" controla acesso a Automações + Equipe + Integrações + Importar + Agente IA + Gerenciar Funis

