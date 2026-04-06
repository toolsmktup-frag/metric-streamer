

## Plano: Correções Pré-Produção do Módulo Automações WhatsApp

### Problema 1 (CRITICO): wz-scheduler fora do config.toml
O `config.toml` não tem `[functions.wz-scheduler]`. O cron job chama via service_role_key no header, mas dependendo de como o deploy foi feito, pode bloquear.

**Correção**: Adicionar `[functions.wz-scheduler] verify_jwt = false` ao `config.toml`.

### Problema 2 (MEDIO): Delay antes do 1o bloco
O loop de envio faz `sleep(randomDelay())` antes de cada bloco, incluindo o primeiro. O lead espera 1-5s a mais sem motivo.

**Correção**: Mover o delay para rodar apenas entre blocos (skip no index 0).

### Problema 3 (MEDIO): eduzz-webhook sem forward para wz-receiver
Se houver vendas Eduzz, as automações não disparam.

**Correção**: Adicionar bloco de forward ao `eduzz-webhook/index.ts` (mesmo padrão do ticto/guru).

### Problema 4 (BAIXO): Sem retry na UAZAPI
Não faremos retry agora para não complicar. Apenas nota de melhoria futura.

---

### Arquivos alterados

1. `supabase/config.toml` -- adicionar wz-scheduler
2. `supabase/functions/wz-executor/index.ts` -- mover delay para bi > 0
3. `supabase/functions/eduzz-webhook/index.ts` -- adicionar forward wz-receiver

### Resultado
O módulo estará pronto para teste com muitos leads. Os 3 webhooks (Ticto, Guru, Eduzz) alimentam automações. O scheduler roda via cron. O primeiro bloco de mensagem é enviado sem delay extra.

