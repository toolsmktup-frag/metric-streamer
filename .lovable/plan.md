

## Reorganização do Menu Lateral

### Problemas Identificados

1. **"Gerenciar Funis" aparece 2x** — dentro de Tráfego ("+ Novo funil") e no rodapé da sidebar
2. **Leads tem 6 itens** — "Minhas Metas" e "Config. de Metas" poluem a seção principal
3. **WhatsApp flutua sozinho** entre Leads e Ferramentas, sem contexto
4. **Automações está em Ferramentas** mas é automação de WhatsApp — deveria estar junto
5. **"Equipe" em Ferramentas** — é gestão/admin, não ferramenta
6. **Anúncios só tem 2 itens** ("Geral ADS" e "Vendas") e conceitualmente se mistura com Tráfego
7. **Ecommerce em Inteligência** — parece deslocado

### Proposta de Estrutura Nova

```text
📊 AdMetrics
─────────────────────
Resumo Geral

▸ TRÁFEGO & ADS
  ├ [funis dinâmicos...]
  ├ + Novo funil
  ├ Geral ADS          (era Anúncios)
  └ Vendas             (era Anúncios)

▸ LEADS & CRM
  ├ Dashboard Leads
  ├ Todos os Leads
  ├ Funis de Leads
  ├ Fontes / UTMs
  └ Metas              (sub-menu: Minhas Metas + Config.)

▸ WHATSAPP
  ├ Chat
  └ Automações          (movido de Ferramentas)

▸ INTELIGÊNCIA
  ├ Inteligência de Cliente
  ├ Análise de CRM
  └ Ecommerce

▸ CONFIGURAÇÕES
  ├ Equipe              (movido de Ferramentas)
  ├ Integrações
  ├ Importar
  ├ Agente IA
  └ Gerenciar Funis     (remove duplicata)
```

### O que muda

| Mudança | Motivo |
|---------|--------|
| Seção "Anúncios" absorvida por "Tráfego & ADS" | Elimina seção com só 2 itens; contexto é o mesmo |
| "Automações" move para "WhatsApp" | São automações de WhatsApp, faz sentido agrupar |
| "Equipe" move para "Configurações" | É gestão de time, não ferramenta operacional |
| "Ferramentas" vira "Configurações" | Nome mais preciso para o que sobra (integrações, importar, equipe) |
| Metas vira sub-grupo dentro de Leads | Reduz itens visíveis; metas são contexto de leads |
| Remove "Gerenciar Funis" duplicado do rodapé | Já existe dentro de Configurações |

### Implementação

1. **Reorganizar constantes no `AppSidebar.tsx`** — mover itens entre arrays, renomear seções
2. **Agrupar Metas como sub-menu colapsável** dentro de Leads (mesmo padrão dos funis de tráfego)
3. **Mover Automações para junto do WhatsApp** e criar seção "WhatsApp" com label
4. **Remover o `navLink` duplicado de "Gerenciar Funis"** da linha 313
5. **Atualizar permissões** — WhatsApp + Automações sob `mod_whatsapp`; Geral ADS e Vendas sob `mod_trafego` (ou manter `mod_anuncios` internamente, só muda a seção visual)

Nenhuma rota muda, nenhuma página muda — é só reorganização visual do sidebar.

