

# Gerar arquivo TXT com os scripts SQL para rodar no Supabase

Vou juntar os dois scripts (Step 1 e Step 2) em um único arquivo `.txt` para você copiar e colar no SQL Editor do Supabase.

## Conteúdo do arquivo

1. **PASSO 1** — Insert dos mapeamentos de produto na tabela `lead_product_mappings`
2. **PASSO 2** — Preview query (comentada) + bloco DO para reprocessar leads históricos

## Instruções de uso

1. Abra o SQL Editor do Supabase
2. Cole o conteúdo do PASSO 1 e rode — isso cria os mapeamentos
3. Cole o conteúdo do PASSO 2 e rode — isso reprocessa os leads existentes
4. Verifique as mensagens NOTICE no resultado para ver quantos leads foram processados

## Implementação

- Criar arquivo `/mnt/documents/scripts-recompra-potes.txt` com ambos os scripts concatenados, separados por comentários claros

