
## Corrigir erro do Copiloto no chat WhatsApp

### Diagnóstico provável
O erro está no fluxo do `sales-copilot`, não no `whatsapp-media`. Pelo código atual, o Copiloto:
- não chama a UAZAPI diretamente
- usa só dados persistidos (`whatsapp_messages`, lead, LTV, script)
- portanto, mesmo se a instância `Gabi 2` estiver desconectada, o Copiloto deveria continuar funcionando para leitura/análise do histórico já salvo

Como o browser mostra `NetworkError when attempting to fetch resource` no POST da função `sales-copilot`, o mais provável é:
1. falha interna da edge function antes de responder corretamente, ou
2. stream quebrando no backend/proxy sem retorno JSON útil

### O que vou ajustar

#### 1) Endurecer a edge function `supabase/functions/sales-copilot/index.ts`
Objetivo: nunca deixar erro interno virar falha opaca de rede.

Mudanças:
- trocar a identificação de organização para o mesmo padrão robusto já usado em funções estáveis (`get_user_org_id` / auth validada)
- envolver cada bloco de contexto em fallback independente:
  - mensagens
  - lead
  - etapa/funil
  - LTV/compras
  - script
- se qualquer parte falhar, continuar com contexto parcial em vez de quebrar a função
- adicionar logs estruturados com:
  - `action`
  - `phone`
  - `instance_id`
  - `user_id`
  - `org_id`
  - etapa exata onde falhou
- devolver JSON claro em erros de backend em vez de deixar o fetch cair “mudo”

#### 2) Desacoplar o Copiloto do status online da instância
Objetivo: conversa da `Gabi 2` continuar utilizável no Copiloto mesmo offline.

Mudanças:
- manter a leitura apenas do histórico salvo no banco
- tratar `instance_id` apenas como filtro de conversa, não como dependência de conexão viva
- se a instância estiver desconectada, exibir no máximo um aviso não-bloqueante no painel, sem impedir:
  - Sugerir
  - Analisar
  - Objeção
  - Perguntar

#### 3) Tornar a coleta de contexto mais resiliente
Objetivo: evitar que joins mais frágeis derrubem a função.

Mudanças:
- revisar a parte de `lead_stage_positions` + relações de funil/etapa
- se necessário, simplificar a consulta em etapas separadas para reduzir chance de erro de relação
- normalizar campos opcionais antes de montar prompt
- garantir que corpos de mensagem não-string ou vazios não causem crash na montagem do transcript

#### 4) Melhorar o cliente `src/hooks/useSalesCopilot.ts`
Objetivo: diferenciar erro HTTP de erro real de rede/stream e não deixar UX quebrada.

Mudanças:
- separar tratamento de:
  - `fetch` falhou
  - resposta não-OK
  - stream interrompido
  - JSON parcial/inválido no SSE
- mostrar toast específico para erro de conectividade do Copiloto
- preservar o painel aberto e impedir estado inconsistente
- manter fallback amigável mesmo se a stream abortar no meio

#### 5) Validar o comportamento no WhatsApp
Arquivos envolvidos:
- `supabase/functions/sales-copilot/index.ts`
- `src/hooks/useSalesCopilot.ts`
- possivelmente `src/components/whatsapp/SalesCopilotPanel.tsx`

### Resultado esperado
Depois da correção:
- qualquer botão da aba Copiloto deve funcionar em conversas da `Gabi 2`
- se faltar contexto, o Copiloto responde com contexto parcial
- se houver erro real de IA/backend, aparece mensagem clara sem `NetworkError` genérico
- a tela não quebra e o vendedor continua no chat

### Detalhes técnicos
- foco no endpoint `POST /functions/v1/sales-copilot`
- sem depender da UAZAPI para as ações do Copiloto
- manter streaming SSE, mas com fallback seguro
- seguir o padrão já usado nas funções de WhatsApp mais estáveis para autenticação e organização
