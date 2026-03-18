

## Status do Módulo Equipe

### Item 1 — Permissões granulares por módulo: CONCLUÍDO
- Hook `useUserPermissions.ts` com `useMyPermissions` e `useOrgPermissions` funcionando
- Página Equipe com switches para ligar/desligar módulos por usuário
- Sidebar filtrando menus com `can('mod_xxx')` baseado nas permissões do usuário logado

### Item 2 — Associar instâncias WhatsApp ao vendedor: PARCIALMENTE FEITO

O componente `InstanceAccessManager` já existe e funciona dentro da tela de gerenciamento de instâncias WhatsApp (`InstanceManagement.tsx`). Ele permite marcar quais vendedores têm acesso a cada instância.

**O que falta** é integrar isso na página `/equipe`, para que o admin possa associar instâncias diretamente ao editar um membro, sem precisar ir até a tela de WhatsApp.

#### Plano de implementação

**Arquivo: `src/pages/Equipe.tsx`**

1. Adicionar uma seção "Instâncias WhatsApp" no painel expandido de cada membro (ao lado dos switches de módulos)
2. Buscar as instâncias da organização via `useWhatsApp` e os registros de `whatsapp_instance_access` para o membro selecionado
3. Mostrar checkboxes para cada instância, permitindo conceder/revogar acesso inline
4. Reutilizar a lógica do `InstanceAccessManager` (insert/delete em `whatsapp_instance_access`) mas renderizar de forma compacta dentro da tabela de equipe

**Resultado**: O admin pode, na mesma tela, definir role, permissões de módulo, e quais instâncias WhatsApp o vendedor acessa.

