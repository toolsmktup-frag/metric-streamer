

## Auditoria da Automação — Resultado

### 1. ✅ Variação de mensagens — FUNCIONANDO
O executor (linha 361) escolhe aleatoriamente entre as variações:
```typescript
const msg = messages[Math.floor(Math.random() * messages.length)];
```
Se você tem 3 variações, cada execução sorteia uma. OK.

### 2. ✅ Delay entre blocos de mensagem — FUNCIONANDO
O executor (linha 399) aplica delay randômico entre blocos (pula o primeiro):
```typescript
if (bi > 0) await sleep(randomDelay(nodeData.delayMin ?? 1, nodeData.delayMax ?? 5));
```
Com `delayMin: 30` e `delayMax: 59` (como na sua config), ele espera entre 30-59 segundos entre cada bloco. OK.

### 3. ✅ Variáveis de boleto/PIX — FUNCIONANDO
O executor substitui `{{codigo_pix}}`, `{{codigo_boleto}}` e `{{link_boleto}}` (linhas 30-32). Se o webhook não trouxer esses campos, eles ficam em branco (string vazia), sem erro. OK.

### 4. ❌ Distribuição de vendedor (Round-Robin) — NÃO IMPLEMENTADA NO EXECUTOR

**Este é o problema crítico.** O nó Divisor está configurado com `splitMode: round_robin` e vendedoras Daniela e Gabriela, mas o executor (linhas 230-251) **ignora completamente** o `splitMode`, `sellers` e `assignAction`. Ele só faz split por porcentagem:

```typescript
} else if (nodeType === "ab_split") {
  const paths = nodeData.paths || [...];
  const rand = Math.random() * 100;
  // ... só usa percent, ignora sellers
}
```

**O que falta no executor:**
- Round-Robin: usar um contador persistente para distribuir sequencialmente entre vendedores
- Atribuição no CRM: fazer `UPDATE leads SET assigned_to = sellerId WHERE phone = contact_phone`
- Modo `assign_only` vs `assign_and_branch`: respeitar a config de saída única vs múltiplas

### Plano de correção

**Arquivo: `supabase/functions/wz-executor/index.ts`**

Reescrever o bloco `ab_split` (linhas 230-251) para:

1. **Detectar o `splitMode`** — se é `percentage` (comportamento atual), `round_robin`, `random` ou `fixed_count`
2. **Round-Robin**: buscar o último índice usado para este nó (`wz_execution_logs` com `node_id` do divisor, contar quantas execuções passaram) e usar `count % sellers.length` para selecionar o próximo vendedor
3. **Random**: `Math.floor(Math.random() * sellers.length)` para selecionar vendedor aleatoriamente
4. **Atribuir vendedor no CRM**: buscar o lead por `phone` na tabela `leads` e fazer `UPDATE leads SET assigned_to = sellerId`
5. **Respeitar `assignAction`**:
   - `assign_and_branch`: seguir pela edge `path_N` correspondente ao vendedor selecionado
   - `assign_only`: seguir pela edge padrão `path_0` (saída única)
6. **Logar** no `wz_execution_logs` qual vendedor foi selecionado

Após a correção, vou fornecer o código completo da Edge Function para você copiar e colar no Supabase Dashboard.

