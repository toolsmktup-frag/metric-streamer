

## Fix: vendedora não consegue assumir lead sem dono

### Problema atual
No `ContactPanel.tsx` linha 84:
```ts
const showClaimBanner = !!lead?.id && !!lead?.assigned_to && !canEditCrm;
```
O banner só aparece se `assigned_to` está preenchido. Quando o lead está **sem dono** (caso da Maria Cecilia no print), o banner não renderiza E `canEditCrm` é `false` → vendedora vê "Assuma o lead para adicionar notas" mas **não tem botão pra assumir**. Limbo.

### Mudança

**`src/components/whatsapp/ContactPanel.tsx`**
- Trocar `showClaimBanner` para:
  ```ts
  const isUnassigned = !!lead?.id && !lead?.assigned_to;
  const isOtherOwner = !!lead?.id && !!lead?.assigned_to && lead.assigned_to !== currentUserId && !isAdmin;
  const showClaimBanner = !isAdmin && (isUnassigned || isOtherOwner);
  ```
- Ajustar a renderização do banner (linha 172) pra passar `currentOwnerId` opcional (pode ser `null` quando órfão).

**`src/components/whatsapp/ClaimLeadBanner.tsx`**
- Aceitar `currentOwnerId: string | null`.
- Quando `null` (lead sem dono):
  - Avatar genérico com ícone `UserPlus` em vez de iniciais.
  - Texto: *"Lead sem responsável"* + subtítulo *"Clique para assumir"*.
  - Botão: **"Assumir pra mim"** (verde / `default` variant pra destacar — é ação positiva, não transferência).
  - Confirmação no `AlertDialog`: *"Você vai virar a responsável por este lead. Confirmar?"* (sem texto de "transferir de outra vendedora").
- Quando preenchido: comportamento atual (banner cinza, "Lead de [Nome]", confirmação de transferência).

### Resultado esperado
- Lead **sem dono** → banner verde "Lead sem responsável [Assumir pra mim]" no topo do painel. 1 clique + confirmação → vendedora vira dona, controles liberam.
- Lead de **outra vendedora** → banner cinza atual (já funciona).
- Lead **da própria vendedora** ou **admin** → sem banner, edição liberada (já funciona).

### Validação
1. Logar como vendedora, abrir chat da Maria Cecilia (lead sem dono no print) → banner verde aparece.
2. Clicar "Assumir pra mim" → confirmar → notas/funis/tags liberam edição.
3. Abrir chat de lead de outra vendedora → banner cinza com nome do dono (inalterado).
4. Logar como admin → nenhum banner, edição direta (inalterado).

### Sem mudança no Supabase
A RPC `assign_lead_to_seller` já permite vendedor reivindicar lead órfão da própria org (memória `seller-assignment-logic` confirma). Zero migration.

