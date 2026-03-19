

## Plano: Atualizar telefones dos leads via SQL direto

### O que será feito
Executar um UPDATE na tabela `leads` para preencher o campo `phone` a partir dos dados já armazenados no `metadata` (campos `phone`, `cel`, `telefone`, `Telefone Contato`).

### SQL a executar
```sql
UPDATE public.leads
SET phone = COALESCE(
  metadata->>'phone',
  metadata->>'cel', 
  metadata->>'telefone',
  metadata->>'Telefone Contato'
)
WHERE phone IS NULL
  AND COALESCE(
    metadata->>'phone',
    metadata->>'cel',
    metadata->>'telefone',
    metadata->>'Telefone Contato'
  ) IS NOT NULL;
```

Isso vai popular o campo `phone` de todos os leads que têm telefone no metadata mas estavam com o campo principal vazio, fazendo o botão do WhatsApp aparecer nos cards.

