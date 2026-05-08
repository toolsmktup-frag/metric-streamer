Diagnóstico rápido: na sessão atual não houve POST para `functions/v1/sync-meta`; só houve leitura do último registro em `meta_sync_log`, que ainda é de 2h atrás. A tela atual `/integracoes` não possui botão de sync do Meta — ela só mostra URLs de webhook Guru/Ticto/Eduzz. O sync Meta é disparado nas telas `Resumo` / `FunilResumo` pelo botão `Sincronizar`.

Plano de correção:

1. Garantir feedback claro no botão de sync
- Ajustar o frontend para diferenciar “sync iniciado” de “sync concluído”.
- Se a função retornar imediatamente ou em background, mostrar “Sincronização iniciada” e continuar consultando `meta_sync_log`.
- Evitar que o usuário ache que sincronizou quando nenhuma chamada foi feita.

2. Melhorar polling do status
- Após clicar em `Sincronizar`, forçar refresh imediato de `meta_sync_log`.
- Continuar consultando a cada poucos segundos enquanto houver status `running` recente.
- Mostrar o horário real do último sync e erro, se existir.

3. Revisar o fluxo da Edge Function `sync-meta`
- Confirmar se a função sempre cria um registro novo em `meta_sync_log` ao iniciar.
- Se houver erro de token Meta ou API 400, gravar `status = failed` e `error` no log em vez de parecer `completed` com `records_synced = 0`.
- Manter compatível com deploy manual das Edge Functions conforme regra do projeto.

4. Opcionalmente expor o botão no lugar certo
- Se você quiser acionar pela página `/integracoes`, adicionar uma seção “Meta Ads” ali com botão `Sincronizar Meta` e status do último sync.
- Caso contrário, manter o sync apenas em `Resumo` / `FunilResumo` e melhorar a mensagem indicando onde sincronizar.

Validação:
- Verificar na aba Network se aparece POST para `functions/v1/sync-meta` ao clicar.
- Verificar que `meta_sync_log.started_at` muda para o horário atual.
- Confirmar que sucesso/erro aparecem no app em vez de manter somente o registro antigo.