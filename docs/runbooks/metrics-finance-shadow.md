# Metrics → Financeiro: implantação gradual shadow (MF-001)

Implementação local. Não considerar ativa antes de provisionamento e teste ponta a ponta. Não toca transações financeiras, caixa ou CRM no replay. Líquidos são informados/não confirmados; não há conciliação oficial de beneficiário/taxas nesta versão.

**Atualização autorizada de 16/09/2026:** YouShop fica exclusivamente manual mensal no Financeiro. Seu receptor Metrics foi destinado à restauração exata de `fcfb419` para preservar o fluxo anterior; não recebe `financialPreflight` e não pode ter exportação financeira habilitada. A autenticação opcional legada é risco conhecido, não garantia de origem. As instruções de publicação autenticada YouShop abaixo descrevem um eventual rollout futuro e NÃO devem ser executadas agora.

Push na branch conectada pode disparar deploy externo Lovable mesmo sem workflow GitHub. Inspecionar efeitos de sincronização antes de mudanças em receptores; não presumir que publicação Git é apenas preview.

## Ordem obrigatória

1. Revisar e aplicar somente `20260916120000_financial_bridge_shadow.sql` no projeto Metrics. Não aplicar em lote migrações do checkout nem alterar recompra/tracking.
2. Cadastrar contas em `financial_source_accounts` com `export_enabled=false`. `credential_ref` é `guru:<account_slug>` quando autenticação Guru usa api_token, `route:<funnel_platforms.id>` quando usa token de rota, `legacy:<lead_funnels.id>` para Guru legado. Várias rotas podem apontar à MESMA conta comercial; conta não é funil. Validar a identidade oficialmente. Não usar tokens reais como account_id.
3. Configurar segredo aleatório dedicado com pelo menos 32 caracteres `METRICS_FINANCE_BRIDGE_SECRET` nos dois servidores; não usar service role como segredo compartilhado e não colocar em VITE_*, navegador, URL ou repositório. Publicar `financial-bridge` com JWT gateway desligado: o endpoint exige Bearer próprio e só atende `financeiro-shadow-v1`.
4. Publicar receptores individualmente somente após confirmar credenciais em cada fornecedor. **YouShop passa de token opcional para obrigatório:** antes de publicar youshop-webhook, cadastrar rota ativa `platform=youshop`, configurar sua URL com token no fornecedor e testar. Sem isso publicá-lo interrompe a ingestão atual. Guru precisa api_token reconhecido OU token de rota válido; produto/funil inferido nunca autentica. Ticto/Eduzz passam a autenticar antes de early returns também.
5. Validar evento autenticado na inbox e outbox. Falha de persistência retorna503, fornecedor precisa retentar; erro de CRM posterior não elimina fila financeira. Ausência de mapping é `account_unmapped`: evento bruto retido, NÃO exportado. Ausência de cobrança estável/moeda suportada é `identity_or_currency_unverified`.
6. Implantar consumidor Financeiro e testar claim→inbox commit→ACK com fixture autorizada. Habilitar `export_enabled` por conta apenas para shadow. Não habilita lançamentos reais. Conferir dashboard e fila, depois configurar agendamento do consumidor.

## Pendências deliberadas

- Guru usa payment.net somente como informado; conta/beneficiário e política competência carecem confirmação. Identidade payment.marketplace_id precisa conferir exemplos reais por conta; sem identidade confiável não exportar.
- Ticto mantém total por cobrança, sem multiplicar em itens. Owner commissions não viram líquido sem semântica/beneficiário oficial. Parser exige transaction_hash/transaction.id; não usa pedido+produto para recorrência.
- YouShop exige ID transacional explícito. Se fornecedor manda apenas order.id, raw fica pendente até comprovar que representa cobrança, não assinatura. order.commission não é presumido líquido.
- Eduzz paid/comissão processada têm semânticas diferentes; campos sem caminho confirmado permanecem nulos. Comissão não é soma extra de venda.
- Correções na ingestão financeira não reparam histórico Guru nem mudam heurísticas legadas de desmembramento Ticto/CRM. Revisão histórica é outra execução auditável sem reenviar webhooks operacionais.
- Datas sem timezone explícito permanecem nulas; data de recebimento não substitui aprovação. Quantity é somente quantidade explícita no item, nunca “número de potes” deduzido do nome.

## Recuperação e observabilidade

`financial_outbox`: entregas com lease120s, tentativas/backoff até1h. 20tentativas mantém linha pendente/quarentenada e requer investigação; nunca apaga. Inspecionar apenas contagens/IDs técnicos, não exportar raw. Consultas administrativas:

```sql
select normalization_status,count(*),min(received_at) from financial_webhook_inbox group by 1;
select count(*) filter(where delivered_at is null) as pending,
 count(*) filter(where delivered_at is null and attempts>=20) as quarantine,
 min(created_at) filter(where delivered_at is null) as oldest_pending,
 max(delivered_at) as last_ack from financial_outbox;
```

ACK só aceita eventos do lease, é idempotente; ACK de lease antigo não confirma lease novo. Timeout após commit financeiro pode redeliver: inbox deduplica por event_id. Nunca excluir fila para “destravar”. Após corrigir causa de quarentena, administrador pode reiniciar tentativas **somente IDs revisados**, limpando lease e `available_at=now()`; registrar execução.

Para normalizar raws retidos depois do cadastro de conta ou atualizar parser sem CRM: servidor com credenciais em ambiente, `deno run --allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY --allow-net=<HOST_SUPABASE> scripts/financial-replay.ts 100 0`. Segunda posição é ID cursor explícito; comando imprime next_after_id, não dados pessoais. Repetir é seguro. Não chamar guru-webhook/wz-receiver para replay. Segredo service-role apenas ambiente administrativo seguro, nunca argumentos shell.

Desligar exportação: `export_enabled=false` nas contas alvo e parar agendamento financeiro; raws/outbox permanecem. Remover segredo da ponte a desabilita. Não remover migração enquanto receptores novos estiverem instalados. Reverter preflight autenticação não é rollback seguro para YouShop; manter token configurado.
