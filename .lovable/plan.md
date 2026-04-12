

## Unificar instâncias: Automações usam as mesmas do Chat

### Problema atual
Existem **duas tabelas separadas** de instâncias:
- `whatsapp_instances` — usada pelo Chat (tem phone, profile pic, QR code, UAZAPI completa)
- `wz_instances` — usada pelas Automações (cadastro manual de URL + token)

Isso causa duplicação e desconexão: a instância "Automação 1" na aba de automações não é a mesma "Dani • Equipe Matheus" do chat.

### Solução
Eliminar o uso de `wz_instances` e fazer tudo apontar para `whatsapp_instances`. As automações passam a usar as mesmas instâncias conectadas no chat.

### Alterações

**1. Aba "Instâncias" nas Automações** (`WzInstanceManager.tsx`)
- Substituir o conteúdo por uma listagem das `whatsapp_instances` (usando `useWhatsAppInstances`)
- Mostrar nome, telefone, status de conexão, foto de perfil — igual ao InstanceHub
- Botão "Gerenciar" abre o InstanceHub existente para conectar/desconectar
- Remove formulário manual de URL/token (não faz mais sentido)

**2. Seletor de instância no editor de fluxo** (`WzNodeConfigPanel.tsx`)
- Trocar `useWzInstances` por `useWhatsAppInstances`
- O dropdown mostra as instâncias do chat com nome amigável + telefone
- Salva o `whatsapp_instances.id` no nó

**3. Executor** (`supabase/functions/wz-executor/index.ts`)
- Mudar query de `wz_instances` para `whatsapp_instances`
- Mapear campos: `api_url` + `api_token` (em vez de `api_key`)

**4. Hook `useWzInstances`** 
- Pode ser mantido como wrapper ou removido — os componentes passam a usar `useWhatsAppInstances` diretamente

### Arquivos editados
1. `src/components/wz-automation/WzInstanceManager.tsx` — reescrever para listar `whatsapp_instances`
2. `src/components/wz-automation/WzNodeConfigPanel.tsx` — trocar fonte de instâncias
3. `supabase/functions/wz-executor/index.ts` — query em `whatsapp_instances`
4. `src/components/wz-automation/nodes/WzWhatsAppNode.tsx` — ajustar display name

### Resultado
A aba "Instâncias" nas automações mostra as mesmas instâncias do chat. O seletor no editor de fluxo lista as instâncias conectadas. O executor envia mensagens pela mesma conexão do chat. Tudo sincronizado.

