# MF-001 — Publicação controlada do código

Data: 2026-09-16. Responsável operacional: @devops.

## Autorização e limite da exceção

O usuário autorizou publicar somente a integração testada, tratando falhas antigas separadamente. Após esclarecimento de que testes locais não garantem cobertura real de 100%, confirmou: “sim, faça”. A autorização excepcional é restrita ao lint legado e à indisponibilidade do CodeRabbit/WSL. Não altera a Constitution, não dispensa os demais gates nem concede aprovação de líquido, cobertura ou contabilização automática.

Esta publicação versiona MF-001 sobre GitHub main `4797936a704607bb97861b232cb7c5ab44bfae65`, reconsultado imediatamente antes da preparação. O checkout isolado contém somente o delta financeiro, o guard de testes Node e o script typecheck; nenhum commit de recompra/Shopify foi transportado. O original fora deste checkout permanece intacto. Nenhum histórico será reescrito.

## Gates reexecutados no conjunto a publicar

- `npm run typecheck`: passou.
- `npm test`: 78/78 (26 financeiros e 52 existentes).
- `npm run build`: passou; avisos legados de bundle e Browserslist.
- ESLint dos seis arquivos TypeScript novos e setup de teste: zero erros.
- `npm run lint`: 1217 erros / 24 avisos no projeto completo, exceção expressa. Nos receptores alterados, comparação com `git show HEAD`: Guru 2→2, Ticto 18→18, YouShop 4→4, Eduzz 1→1; setup 0→0.
- `git diff --check`: passou.
- CodeRabbit/WSL indisponíveis; não declarar scanner aprovado.
- Scanner pontual do delta para chaves privadas, tokens GitHub, AWS, Stripe e JWT: nenhum arquivo suspeito. Não equivale a auditoria completa de segredos.
- `npm audit`: 0 críticos, 15 altos, 4 moderados, 1 baixo. Dependências/lockfile inalterados; riscos existentes precisam de remediação separada, não são considerados corrigidos por MF-001.
- Parecer @qa anterior: PASS técnico local, 32 cenários cruzados/SQL; restrição de publicação por lint/CodeRabbit agora tem exceção explícita do usuário. A exceção não reclassifica verificações externas pendentes como aprovadas.

## Ativação e rollback

Push Git não equivale a aplicar migration ou publicar Edge Functions. Não há workflow GitHub de deploy neste checkout. O responsável pela implantação aplica exclusivamente as migrations MF-001 e mantém exportação desabilitada até validar cada conta/origem. Não publicar YouShop sem confirmar token na origem: a função atualmente publicada diverge do main e aceita tráfego global.

Segredos ficam nos servidores. Primeiro validar ingestão e conferência isolada; nenhum evento desta versão gera lançamento real. Preservar pendências de líquido, competência, identidade e beneficiário. Histórico não será reparado nesta publicação.

Rollback: interromper agendamento e desabilitar exportação das contas, preservando inbox/outbox. Não apagar dados/migrations, não remover autenticação, não reenviar eventos ao CRM. Se necessário, corrigir código com novo commit; nunca forçar ou reescrever main.
