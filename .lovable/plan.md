
## Gerar arquivo de deploy das funções Supabase

Vou criar um arquivo pronto para você rodar no terminal, com os 2 deploys que você pediu.

## Arquivo a criar

```text
deploy-wz-group-sync.sh
```

## Conteúdo do arquivo

```bash
#!/usr/bin/env bash
set -e

echo "Deploy da função wz-group-sync..."
supabase functions deploy wz-group-sync --project-ref emfbocpmphtftqcezaib

echo "Deploy da função uazapi-webhook..."
supabase functions deploy uazapi-webhook --project-ref emfbocpmphtftqcezaib

echo "Deploy finalizado."
```

## Como você vai usar

Depois de criado, você roda:

```bash
chmod +x deploy-wz-group-sync.sh
./deploy-wz-group-sync.sh
```

## Observação

Se o Supabase pedir login antes, rode:

```bash
supabase login
```

Depois rode o arquivo novamente.
