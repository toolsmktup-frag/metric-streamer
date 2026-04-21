#!/usr/bin/env bash
set -e

echo "Deploy da função wz-group-sync..."
supabase functions deploy wz-group-sync --project-ref emfbocpmphtftqcezaib

echo "Deploy da função uazapi-webhook..."
supabase functions deploy uazapi-webhook --project-ref emfbocpmphtftqcezaib

echo "Deploy finalizado."