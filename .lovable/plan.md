# Revisão da lógica de recontato (Pote → Abordar Hoje)

## Como funciona hoje

O campo **`recontact_days`** significa literalmente:

> "Depois de X dias da compra, mover o lead de **Compra Aprovada** para **Para abordar hoje**."

O cron `recontact-cron` roda, pega a data da última compra do lead, soma `recontact_days` e, se passou, move pra etapa de destino. Só mexe se o lead ainda estiver na etapa "De" (protege quem já tá em negociação).

Sua interpretação está **correta**. Os números na tela são "dias após a compra pra ir pra Abordar Hoje".

## O que tá inconsistente nos valores atuais

| Produto         | Pote dura | Configurado | Offset (dias antes do pote acabar) |
|-----------------|-----------|-------------|-------------------------------------|
| Pote 30 dias    | 30        | 25          | 5 dias antes                        |
| Pote 90 dias    | 90        | 75          | 15 dias antes                       |
| Pote 180 dias   | 180       | 155         | 25 dias antes                       |
| Pote 360 dias   | 360       | 330         | 30 dias antes                       |
| Grátis 30 dias  | 30        | 25          | 5 dias antes                        |
| 9 Potes         | 270 (?)   | 250         | 20 dias antes                       |

Cada produto usa um "lembrete" diferente (5, 15, 25, 30 dias antes). Não tem regra clara — fica difícil de manter e de explicar pra equipe.

## Risco extra que vale você saber

Quando um cliente compra **vários potes na mesma compra**, o sistema **soma os dias linearmente** (90 + 180 = 270d a partir da última compra). Se ele acumular muitos potes, o recontato pode nunca disparar dentro de um prazo útil.

## Recomendação (3 opções)

### Opção A — Padronizar offset único (mais simples)

Define **um único valor de "dias antes do pote acabar"** pra todos os produtos (ex: 25 dias). O sistema continua igual, só os números ficam consistentes:

- Pote 30  → 5  (30 − 25, mas como é pote curto, talvez 15)
- Pote 90  → 65 (90 − 25)
- Pote 180 → 155 (180 − 25)
- Pote 360 → 335 (360 − 25)

Vantagem: zero código novo, só ajustar números na UI.
Desvantagem: pote de 30 dias com offset de 25 dá só 5 dias de uso, então precisa de exceção.

### Opção B — Adicionar 2 colunas separadas (mais explícito)

Em vez de um campo confuso `recontact_days`, separar em 2:

- **`pot_duration_days`**: quanto tempo o pote dura (30, 90, 180...)
- **`reminder_days_before`**: quantos dias antes do fim mandar o lembrete (ex: 25)

Na UI vira:
> "Pote 90 dias — Lembrar **25 dias antes** de acabar"

O cron calcula sozinho: `move_at = compra + (pot_duration − reminder_days_before)`.

Vantagem: a vendedora entende na hora o que tá configurando. Mudou a regra de "25d antes"? Edita 1 campo e aplica pra todos.
Desvantagem: precisa migração de schema + ajuste no cron + UI.

### Opção C — Manter como está

Deixa do jeito que tá, só padroniza os valores manualmente seguindo uma regra mental sua.

## Sobre a etapa "Lembrete 25d antes"

Aquele SQL anterior assumiu que existia uma etapa intermediária ("Base de Recontato") e queria criar "Lembrete 25d antes" no meio. Mas o funil real **não tem** "Base de Recontato" — o destino atual é direto **"Para abordar hoje"**.

Então a ideia de criar uma etapa intermediária só faz sentido se você quiser **2 disparos de WhatsApp**: um "faltam 25 dias" (na etapa Lembrete) e outro "acabou hoje" (em Abordar Hoje). Se 1 disparo só já basta, **não precisa de etapa nova**.

## O que eu sugiro fazer

1. Você me confirma qual o offset padrão que faz sentido (ex: "quero lembrar 25 dias antes do pote acabar pra todo mundo, exceto pote de 30d que é 7 dias antes").
2. Decide entre **Opção A** (rápido, só ajusta números) ou **Opção B** (mais limpo, mexe no schema).
3. Decide se quer **1 ou 2 disparos de WhatsApp** (etapa intermediária ou não).

Com essas 3 respostas eu monto o plano de execução final.
