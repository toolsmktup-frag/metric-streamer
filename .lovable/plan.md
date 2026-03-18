

## Melhorar AudioPlayer no ChatThread

O player atual é apenas um botão play/pause + uma barra estática cinza + velocidade. Falta:
- **Barra de progresso** interativa (mostrando posição atual, clicável para seek)
- **Duração / tempo atual** (ex: `0:12 / 0:45`)

### Mudanças em `src/components/whatsapp/ChatThread.tsx`

Reescrever o componente `AudioPlayer` para:

1. Usar `timeupdate` event do `<audio>` para atualizar `currentTime` e `duration` em estado
2. Renderizar uma barra de progresso com `<input type="range">` ou div clicável que permite seek
3. Mostrar tempo formatado `currentTime / duration`
4. Manter play/pause e velocidade
5. Estilizar a barra de progresso para combinar com o tema (verde para outbound, cinza para inbound) — passando `isOutbound` como prop

Layout: `[Play] [====progress====] [0:12/0:45] [1x]`

### Arquivos alterados
- `src/components/whatsapp/ChatThread.tsx` — reescrever `AudioPlayer`

