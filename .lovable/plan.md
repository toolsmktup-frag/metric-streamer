

## Plano: Criação automática de instância UAZAPI + QR Code automático

### Contexto
Você já tem a URL base (`https://tracker1.uazapi.com`) e o admin token global. A API UAZAPI tem o endpoint `POST /instance/init` que cria uma nova instância usando o `admintoken`. Isso permite criar instâncias sem o usuário precisar inserir URL/token manualmente.

### Alterações

**1. Adicionar secrets UAZAPI_BASE_URL e UAZAPI_TOKEN**
- Armazenar `https://tracker1.uazapi.com` como `UAZAPI_BASE_URL`
- Armazenar o admin token como `UAZAPI_TOKEN`
- Disponíveis nas edge functions via `Deno.env.get()`

**2. Adicionar action `create_instance` na edge function (`whatsapp-instance/index.ts`)**
- Nova action que NÃO precisa de `instance_id` (é uma criação)
- Chama `POST {UAZAPI_BASE_URL}/instance/init` com header `admintoken` e body `{ name: "nome-da-instancia" }`
- A UAZAPI retorna o token e URL da instância criada
- Insere automaticamente na tabela `whatsapp_instances` com `api_url` e `api_token` corretos
- Configura webhook automaticamente
- Invoca `connect` para gerar o QR Code imediatamente
- Retorna o QR Code/pair code na resposta

**3. Simplificar formulário de criação (`InstanceHub.tsx` → `AddInstanceForm`)**
- Remover campos URL da API e Token (não são mais necessários)
- Manter apenas: Nome da instância
- Ao clicar "Criar Instância", chama a nova action `create_instance`
- Após criação, seleciona a instância automaticamente e já mostra o QR Code

### Fluxo simplificado
```text
Usuário digita nome → Clica "Criar" → Edge function cria na UAZAPI → 
Salva no banco → Conecta → Retorna QR Code → Exibe na tela
```

### Arquivos modificados
- `supabase/functions/whatsapp-instance/index.ts` — nova action `create_instance`
- `src/components/whatsapp/InstanceHub.tsx` — simplificar `AddInstanceForm`
- 2 novos secrets: `UAZAPI_BASE_URL`, `UAZAPI_TOKEN`

