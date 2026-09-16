# Metrics → Financeiro: contrato v1 e story MF-001

Data: 2026-09-16. Responsabilidades desta definição: arquitetura (@architect) e critérios/story (@po, conforme autorização da tarefa e Constitution). Estado: pronto para implementação em modo shadow. A autorização atual do usuário abrange execução conjunta e implantação segura, condicionada aos gates técnicos e à configuração verificada; dados não comprovados não autorizam ativação financeira. Esta frente de documentação/QA não executa deploy, push ou reparação histórica.

Fonte dos requisitos: [auditoria de 16/09/2026](./AUDITORIA-INTEGRACAO-METRICS-FINANCEIRO-2026-09-16.md), em especial seções 2–5. Este arquivo concentra contrato e story por determinação do escopo; a integração no repositório de trabalho deve referenciar MF-001 em `docs/stories/` antes de escrever código. O Metrics original tem alterações de outra frente e deve ser preservado.

## 1. Arquitetura mínima

```text
Fornecedor → autenticação obrigatória → gravação durável do evento original
                                         + trabalho financeiro na mesma transação
                                         ├─ processamento Metrics/CRM existente
                                         └─ outbox financeiro (normalização allowlist)
                                                ↓ pull servidor, lease e ACK
                                           inbox Financeiro → projeção shadow
API/relatório oficial → reconciliação futura → revisão auditável da mesma venda
```

- A gravação de entrada e o enfileiramento não dependem de funil, lead, CRM, WhatsApp ou logística. Evento autenticado desconhecido é preservado com motivo de pendência; não é descartado por um parser de status.
- O receptor só confirma aceitação depois de persistir. Falha de persistência retorna erro recuperável para o fornecedor; falha posterior do CRM não impede a entrega financeira.
- A origem mantém o raw completo com acesso administrativo restrito. A ponte exporta somente um objeto financeiro construído por allowlist; não exporta raw, nomes, documentos, e-mails, telefones, endereços, IPs, parâmetros livres de rastreamento nem tokens. Não espalhar o payload original em logs.
- O produtor e o consumidor continuam dependentes da disponibilidade do backend receptor. A implementação local não comprova recuperação histórica nem completude das vendas.
- Shadow é uma restrição de servidor: eventos e projeções separados de `transactions`, fechamento, Resultado e Caixa. A v1 não oferece parâmetro capaz de habilitar lançamentos reais.

## 2. Identidade, revisão e valores

Identidade de entidade: tupla `(platform, account_id, charge_id, item_id)`. `account_id` é identificador técnico da conta do fornecedor autenticada, nunca empresa inferida pelo comprador. `charge_id` é cobrança/transação; pedido+produto não substitui cobrança recorrente. `item_id` é item estável do fornecedor. Sem item confiável, o evento pode ficar na granularidade de cobrança com item reservado `__charge__`, sem inventar alocação por produto. Ausência de conta ou cobrança estável exige quarentena.

Identidade do evento: `event_id` determinístico para uma revisão financeira. Preferir identificador de evento do fornecedor quando comprovadamente único e imutável, com namespace da plataforma/conta. Se o fornecedor reutiliza o identificador para atualizações ou não o fornece, incluir hash canônico dos campos semânticos e versão do parser. Nunca incluir data de recebimento no hash de deduplicação. Serializar tuplas de forma não ambígua, por exemplo JSON; não concatenar IDs sem escape.

- `payload_hash` é SHA-256 do envelope financeiro canônico sem campos de transporte (`received_at`, lease, número de entrega). Mesma `event_id` com hash diferente é conflito e vai para quarentena; não sobrescrever silenciosamente.
- Valores são inteiros em unidade mínima da moeda; na v1 somente `BRL`, portanto centavos. Sem ponto flutuante para parsing monetário. Campo desconhecido é `null`, nunca zero nem bruto substituindo líquido. Valores não negativos representam magnitudes; o tipo de evento dá o significado do ajuste.
- `gross_cents` e `net_cents` pertencem à granularidade declarada. Total de cobrança nunca pode ser repetido em cada item e somado. Sem alocação comprovada, emitir somente `__charge__`, informar `allocation_status: unallocated` e não gerar ranking por produto.
- Líquido informado não equivale a saldo liberado, recebimento bancário, margem ou lucro. Deduções só podem ser componentes comprovados; a diferença bruto−líquido não vira automaticamente taxa.
- `beneficiary_id` identifica recebedor conhecido na plataforma, sem dados pessoais. Uma comissão de terceiro não pode ser utilizada como líquido da empresa. Beneficiário não validado mantém qualidade pendente.

## 3. Envelope financeiro v1

Campos comuns a produtor, testes e consumidor. O produtor pode armazenar metadados internos adicionais, mas a resposta da ponte é validada com esquema fechado.

```typescript
type FinancialEventV1 = {
  schema_version: 1;
  parser_version: string;
  event_id: string;
  payload_hash: string;
  platform: 'guru' | 'ticto' | 'youshop' | 'eduzz';
  account_id: string;
  charge_id: string;
  item_id: string;
  source_event_id: string | null;
  source_revision: number | null;
  source_updated_at: string | null; // ISO-8601 UTC, data da origem
  occurred_at: string | null;
  received_at: string; // ISO-8601 UTC, entrada no Metrics
  purchased_at: string | null;
  approved_at: string | null;
  kind: 'sale_snapshot' | 'refund' | 'chargeback' | 'chargeback_reversal' | 'unknown';
  status: 'pending' | 'approved' | 'cancelled' | 'refunded' | 'chargeback' | 'unknown';
  currency: 'BRL';
  gross_cents: number | null;
  net_cents: number | null;
  adjustment_cents: number | null; // apenas valor comprovado do ajuste
  net_quality: 'missing' | 'reported_unverified' | 'verified';
  net_source: string | null; // caminho conhecido do campo, não conteúdo livre
  beneficiary_id: string | null;
  product_id: string | null; // ID da origem, não nome livre do comprador
  offer_id: string | null;
  quantity: number | null;
  allocation_status: 'charge_level' | 'item_verified' | 'unallocated';
  verification_ref: string | null; // referência interna opaca, sem URL/token
  warnings: string[]; // códigos allowlist, nunca mensagens/payloads livres
};
```

`reported_unverified` requer `net_cents` não nulo e origem de campo conhecida; `missing` requer líquido nulo. `verified` exige referência interna de reconciliação real, conta/beneficiário verificados e evidência registrada; o webhook sozinho não pode promover qualidade. Parsers iniciais só emitem `missing` ou `reported_unverified`. Mapeamento conta→empresa e produto→produto financeiro reside no Financeiro, separado do envelope e com estado pendente/verificado.

Guru: `payment.net` pode ser registrado como informado e não confirmado; reconhecer tanto `refunded`/`chargeback` quanto aliases `sale_refunded`/`sale_chargeback`. Não concluir ajuste integral a partir do valor histórico da compra. Ticto: nenhuma inferência automática entre `owner_commissions`, `producer.amount` e `marketplace_commission` sem comprovar beneficiário/unidade. YouShop: `order.commission` não é líquido verificado; autenticação de origem obrigatória. Eduzz: fatura paga e comissão processada podem exigir eventos distintos; sem configuração/semântica validada, permanecer pendente.

## 4. Ordering e histórico

Preservar todas as revisões no inbox. Transporte e sequência da outbox ordenam entrega, não a verdade comercial. Usar `source_revision` confiável quando disponível; em seguida, `source_updated_at` comprovado da origem. Nunca usar `received_at` como autorização para evento antigo sobrescrever estado novo.

- Revisão menor: manter histórico e classificar `stale`; não regredir projeção.
- Revisão/timestamp igual com conteúdo divergente: `conflict`; não escolher silenciosamente.
- Sem marcador comparável: registrar `ordering_unverified`; manter histórico para revisão, sem promover nova versão a fechamento. Um estorno recebido fora de ordem deve continuar visível como pendência, não desaparecer pela regra de atualização.
- `occurred_at`, compra, aprovação e recebimento são conceitos separados. Competência gerencial usa política explícita; ausência de aprovação nunca cai silenciosamente em “hoje”.
- Reembolso parcial, chargeback e reversão preservam o vínculo à cobrança original; não apagam venda nem confundem valor do ajuste com valor total da venda. A v1 shadow não altera períodos fechados.

## 5. Ponte pull, lease e confirmação

Implementação recomendada: função de servidor `financial-bridge`, operações `claim` e `ack` via POST HTTPS. Credencial dedicada `METRICS_FINANCE_BRIDGE_SECRET` somente em secrets dos servidores; nunca em `VITE_*`, localStorage, bundle, query string ou resposta. Comparar de forma resistente a timing; segredo ausente desabilita o endpoint. Não usar service-role como segredo compartilhado. Proteger tabelas/RPCs contra acesso anônimo e usuários autenticados comuns; não conceder execução de operações de claim/ack a `public`.

```json
{ "action": "claim", "consumer": "financeiro-shadow-v1", "limit": 50 }
```

```json
{
  "schema_version": 1,
  "lease_token": "opaque-unpredictable-token",
  "lease_expires_at": "2026-09-16T18:02:00.000Z",
  "events": []
}
```

```json
{
  "action": "ack",
  "consumer": "financeiro-shadow-v1",
  "lease_token": "opaque-unpredictable-token",
  "event_ids": ["stable-event-id"]
}
```

- `claim` é atômico, com lock por linha/`SKIP LOCKED` ou mecanismo equivalente; só retorna eventos pendentes ou com lease vencido. Limite máximo do servidor, lease curto e número de tentativas registrados. Um lote não precisa impedir a entrega de outros lotes.
- Escopo da credencial fixa consumidor e contas permitidas no servidor; `consumer` fornecido não pode ampliar escopo. Token de lease imprevisível e vinculado ao consumidor/lote; ACK só confirma IDs realmente entregues por esse lease. ACK expirado não confirma lease novo.
- `ack` só ocorre depois de commit durável no Financeiro. ACK é idempotente para o mesmo lease/evento já confirmado. Resposta inclui quantidade confirmada; IDs indevidos retornam erro e não avançam outros itens silenciosamente.
- Timeout após commit do inbox leva a reentrega, deduplicada por `event_id`. Se ACK falhar, manter dados e retentar com reentrega segura. Não apagar dados da origem ao confirmar entrega.
- Não usar cursor crescente como critério único de exclusão. Cursor, se presente, é observabilidade ou checkpoint contíguo somente de itens confirmados; falhas e leases vencidos permanecem elegíveis independentemente do maior ID já visto.
- Financeiro persiste evento válido/duplicado e também quarentena durável de evento inválido antes de ACK. Não imprimir corpo inválido nem payload em logs. Resposta de transporte estruturalmente inválida não é confirmada.
- Backoff e limite de tentativas preservam itens em quarentena inspecionável; reprocessamento financeiro nunca chama novamente webhook/CRM. Registrar contagem pendente, mais antigo, tentativas, última entrega e última sincronização com sucesso sem PII.

## 6. Story MF-001 — Receber vendas do Metrics com recuperação e comparação segura

Como responsável pelo Financeiro, quero receber eventos de vendas autenticados, identificados e recuperáveis do Metrics, para conferir valores líquidos e produtos sem duplicar receita ou misturar vendas com repasses bancários.

Prioridade: corrigir segurança/durabilidade e implementar contrato/CLI antes de UI. Status inicial: Ready for Development. Escopo: migrações revisáveis, testes, CLI de sincronização, documentação de configuração e implantação segura quando os gates forem satisfeitos. A autorização do usuário não substitui validação de credenciais, mapeamentos, semântica e conciliação; a v1 permanece shadow, sem lançamentos reais. Publicação compete à frente de execução autorizada, não à documentação/QA.

### Critérios de aceitação

1. Credencial ausente/incorreta é rejeitada antes de ler ou gravar eventos da ponte; YouShop sem autenticação comprovada não entra como origem confiável. Segredos nunca aparecem no navegador ou logs.
2. Eventos autenticados são persistidos/enfileirados antes do processamento CRM; uma falha de CRM não bloqueia a fila. Status Guru de estorno/chargeback são reconhecidos. Falha de persistência não recebe confirmação de sucesso.
3. Ponte exporta apenas campos allowlist sem PII. Valida esquema, tipos, moeda, inteiros seguros, limites de tamanho e semântica de `net_quality`.
4. Repetir um evento, inclusive com timeout após commit, produz um inbox e nenhum lançamento real. Mesma chave com conteúdo diferente é conflito visível. Atualização legítima de taxas cria revisão e não nova cobrança.
5. Duas cobranças de mesma assinatura/pedido/produto em meses distintos permanecem separadas. Total de cobrança com dois itens não é multiplicado. Beneficiário/conta/item ambíguos ficam pendentes.
6. Eventos atrasados não regridem estado confirmado; sem marcador temporal confiável, ficam pendentes de ordenação. Reembolso parcial/total, chargeback e reversão preservam a trilha e não apagam histórico.
7. Dois consumidores concorrentes não recebem lease ativo do mesmo item. Lease expirado recupera item; ACK incorreto/expirado não confirma entrega nova; ACK duplicado é seguro. Cursor não perde evento antigo pendente.
8. CLI executa claim→validar→commit inbox/projeção shadow→ACK sem UI. Falha do Financeiro, timeout ou reinício preserva recuperação. Dry-run, se existir, não confirma nem consome permanentemente eventos.
9. Sem líquido, data, produto ou empresa comprovados, a projeção informa pendência. Bruto não substitui líquido, zero não substitui desconhecido e repasse não vira nova venda. Nenhum evento recebido promove qualidade a verificada sozinho.
10. Gates de lint, typecheck, testes e build dos repositórios de implementação são executados; falhas preexistentes são diferenciadas. Testes incluem os casos 1–9 e fixtures sintéticas sem PII. @qa emite parecer; limitações e indisponibilidade de ferramentas são registradas com evidência.
11. Configuração, rollback/desativação, replay financeiro, limitações de cobertura e passos restantes são documentados. Nenhuma implantação ou fechamento é declarado completo sem verificações externas.

### Tarefas e checklist

- [x] Ler auditoria e instruções/Constitution do Metrics.
- [x] Definir arquitetura e contrato de transporte/semântica v1.
- [x] Criar MF-001 com critérios prévios à implementação.
- [x] Criar/referenciar story no checkout isolado do Metrics antes de implementação.
- [ ] Implementar recepção/outbox e normalização allowlist independente do CRM.
- [ ] Implementar ponte autenticada com lease/ACK e restrição de acesso.
- [ ] Implementar inbox, validador e projeção shadow no Financeiro.
- [ ] Implementar CLI e instruções de configuração sem credenciais reais.
- [ ] Executar testes de integração/falhas e gates; obter revisão @qa.
- [ ] Atualizar esta story com File List efetiva e evidências dos gates.

### File List

- Criado: `/Users/matheuscolombo/Financeiro Empresas/INTEGRACAO-METRICS-CONTRATO.md` (contrato + MF-001).
- Criado: `/Users/matheuscolombo/Financeiro Empresas/metrics-finance-integration/docs/stories/MF-001.metrics-finance-shadow.md` (story prévia à implementação, com referência ao contrato).
- Fonte existente, somente leitura: `/Users/matheuscolombo/Financeiro Empresas/AUDITORIA-INTEGRACAO-METRICS-FINANCEIRO-2026-09-16.md`.
- Código/migrações/testes: a registrar pelo implementador após definição do checkout; este contrato não afirma existência de arquivos ainda não criados.

### Pendências para produção — não bloqueiam desenvolvimento shadow

- Validar autenticação oficial de cada conta e provisionar segredo dedicado nos dois servidores.
- Confirmar mapeamentos conta→empresa, produto/oferta→produto financeiro, unidades, beneficiário e semântica de líquido em amostras oficiais das quatro plataformas.
- Definir competência, data inicial, sobreposição de importações anteriores, retenção e acesso aos raws.
- Demonstrar conciliação independente com API/relatório e declarar cobertura/limites de recuperação histórica; executar teste real por conta com autorização.
- Revisar histórico Guru de estornos sem reexecutar CRM; eventual reparação é ação separada e auditável.
- Aprovar promoção gradual após comparação shadow: eventos recebidos não significam cobertura de 100% nem líquido conciliado.
