

## Plano: Visualização Unificada de Conversas Multi-Instância + Controle de Acesso

### O que muda na prática

Hoje: o vendedor seleciona **uma instância por vez** no dropdown e só vê as conversas daquele número.

Depois: opção "Todas" no seletor mostra **todas as conversas de todas as instâncias que o usuário tem acesso**, com uma tag colorida indicando de qual WhatsApp veio. O admin controla quais instâncias cada vendedor enxerga.

---

### Etapas

#### 1. Tabela de permissões: `whatsapp_instance_access`

Nova tabela que vincula `user_id` ↔ `instance_id`. Se o usuário é admin, vê tudo. Se não, só vê instâncias com registro nessa tabela.

```text
whatsapp_instance_access
├── id (uuid PK)
├── user_id (uuid → auth.users)
├── instance_id (uuid → whatsapp_instances)
├── organization_id (uuid → organizations)
└── unique(user_id, instance_id)
```

RLS: leitura permitida para o próprio usuário + admins da org. Escrita só para admins.

SQL manual em `docs/` conforme padrão do projeto.

#### 2. Hook `useWhatsAppInstances` — filtrar por acesso

Alterar a query para fazer JOIN com `whatsapp_instance_access` quando o usuário não é admin. Admins continuam vendo todas. Usa `get_user_role()` para decidir.

#### 3. Hook `useWhatsAppChats` — modo multi-instância

Criar variante que aceita `instanceIds: string[]` em vez de um só. Chama a edge function `whatsapp-chats` em paralelo para cada instância e mescla os resultados, adicionando `instance_id` e `instance_name` em cada `ChatSummary`.

Nova prop no `ChatSummary`:
```typescript
instance_id: string;
instance_name: string;
instance_color: string; // cor derivada do índice
```

#### 4. Opção "Todas" no seletor de instância

No `WhatsAppChat.tsx`, adicionar `<SelectItem value="all">Todas as instâncias</SelectItem>`. Quando selecionado, usa o hook multi-instância. A lógica de mensagens continua usando o `instance_id` específico do chat selecionado.

#### 5. Tag de instância no `ChatList`

Cada item da lista ganha um `<Badge>` colorido com o nome da instância (ex: "Vendas", "Suporte"). Cores atribuídas automaticamente por índice.

#### 6. Tela de gestão de acesso (admin)

No dialog de gerenciamento de instância ou em uma nova seção, o admin vê a lista de vendedores da org e pode marcar/desmarcar quais instâncias cada um acessa (checkboxes simples). Usa insert/delete na tabela `whatsapp_instance_access`.

---

### Arquivos impactados

| Arquivo | Mudança |
|---|---|
| `docs/whatsapp-instance-access.sql` | **Novo** — migration da tabela + RLS |
| `src/hooks/useWhatsApp.ts` | Filtrar instâncias por acesso; novo hook multi-chat |
| `src/pages/WhatsAppChat.tsx` | Opção "Todas"; passar instance info ao ChatList |
| `src/components/whatsapp/ChatList.tsx` | Exibir badge de instância |
| `src/components/whatsapp/InstanceManagement.tsx` | Seção de gestão de acesso por vendedor |
| `supabase/functions/whatsapp-chats/index.ts` | Nenhuma mudança necessária (chamado N vezes) |

### Complexidade

Não é confuso — a arquitetura já suporta múltiplas instâncias. O trabalho principal é: (1) a tabela de permissão, (2) mesclar chats de várias instâncias no frontend, e (3) a tag visual. São mudanças incrementais sobre o que já existe.

