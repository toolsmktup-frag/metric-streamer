

## Restaurar instâncias manuais (wz_instances) + manter as do Chat

### O que aconteceu
A mudança anterior removeu a UI das `wz_instances` (onde estava a "Automação 1" com token `55f87766...`) e substituiu tudo pelas instâncias do Chat. A instância manual ainda existe no banco, mas ficou invisível na interface.

### Solução
Manter **as duas fontes** na aba Instâncias das Automações:
- **Seção 1**: Instâncias do Chat (`whatsapp_instances`) — gerenciadas pelo InstanceHub
- **Seção 2**: Instâncias Manuais (`wz_instances`) — com formulário de editar/adicionar (Nome, URL, Token) como antes

O executor já consulta `whatsapp_instances`. Vou adicionar um fallback: se o `instanceId` do nó não for encontrado em `whatsapp_instances`, busca em `wz_instances` (usando `api_url` + `api_key`).

### Alterações

**1. `WzInstanceManager.tsx`** — Restaurar a listagem mista
- Seção "Instâncias do Chat" com as `whatsapp_instances` + botão "Gerenciar" abrindo InstanceHub
- Seção "Instâncias Manuais" com as `wz_instances` + botões editar/adicionar/excluir (restaurar formulário Nome/URL/Token)
- Ambas aparecem na mesma tela

**2. `WzNodeConfigPanel.tsx`** — Seletor unificado
- O dropdown de instância no editor de fluxo mostra **ambas as fontes**: instâncias do Chat (com label "Chat") e instâncias manuais (com label "Manual")
- Salva o ID correspondente à tabela de origem

**3. `wz-executor/index.ts`** — Fallback para wz_instances
- Primeiro busca em `whatsapp_instances`
- Se não encontrar, busca em `wz_instances` (mapeando `api_key` → token)
- Garante que a "Automação 1" continue funcionando

### Arquivos editados
1. `src/components/wz-automation/WzInstanceManager.tsx`
2. `src/components/wz-automation/WzNodeConfigPanel.tsx`
3. `supabase/functions/wz-executor/index.ts`

