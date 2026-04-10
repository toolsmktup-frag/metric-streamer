

## Gerar PDF com Respostas ao Diagnóstico de Tracking

Vou criar um PDF profissional respondendo todas as 9 perguntas do documento "tracking_research.pdf" com base na análise real do código do projeto.

### Conteúdo do PDF

**Seção 1 - Arquitetura e Fluxo de Dados**
1. Estrutura do banco (tabelas, colunas de tracking)
2. Processamento de webhooks (Ticto, Guru, Eduzz)
3. Captura de e-mail em tempo real (não existe)

**Seção 2 - Tracking e Identificação**
4. Geração/persistência de visitor_id (não implementado)
5. Captura de fbclid (recém-implementado via query_params)
6. IP e User-Agent (não capturados)

**Seção 3 - Integração Meta Ads**
7. Meta CAPI (não implementada)
8. External ID para deduplicação (não existe)

**Seção 4 - Fluxo de Atribuição**
9. Modelo de atribuição (last-click via webhook)
10. Jornada completa do cliente (apenas último clique)

**Status atual resumido** em tabela com ✅/❌

### Implementação
- Script Python com reportlab
- Output em `/mnt/documents/diagnostico-tracking.pdf`
- QA visual obrigatório

