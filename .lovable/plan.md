

## Melhorias no chat: links clicáveis + viewer de mídia

### 1. Links clicáveis nas mensagens

**Hoje:** URLs em mensagens de texto renderizam como texto puro (sem `<a>`).

**Mudança:** No componente que renderiza o corpo da mensagem (`src/components/whatsapp/MessageBubble.tsx` — ou equivalente no folder `whatsapp/`), criar um helper `linkify(text)` que:
- Detecta URLs (`https?://...`) e telefones/emails via regex.
- Quebra o texto em segmentos e devolve `<a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80">{url}</a>` para os matches.
- Preserva quebras de linha existentes (`whitespace-pre-wrap`).
- Funciona pra mensagens enviadas (texto branco no balão roxo) e recebidas — só usa `text-current` pra herdar a cor do balão.

Aplicado em: balão de texto principal + caption de mídia (imagem/vídeo/documento com legenda).

### 2. Viewer inline de mídia + menu de 3 pontos

**Hoje:** documentos/imagens/vídeos têm botão único que baixa direto.

**Mudança em `MessageBubble.tsx` (ou `MediaMessage.tsx` se separado):**

**Imagem:**
- Renderiza thumbnail clicável dentro do balão (já deve renderizar — confirmar).
- Click no thumb abre **lightbox** (novo componente `MediaLightbox.tsx` usando `Dialog` do shadcn) em fullscreen com a imagem centralizada, fundo escuro, botão fechar (X), botão baixar e setas se houver mais mídia no chat (escopo: só a mídia clicada por enquanto, sem navegação entre mensagens).

**Vídeo:**
- Renderiza `<video controls preload="metadata">` inline no balão (player nativo, máx 320px de largura).
- Click no vídeo OU no botão "expandir" abre o mesmo `MediaLightbox` com player maior.

**PDF/Documento:**
- Substitui o botão "Documento" atual por um card com:
  - Ícone do tipo de arquivo + nome + tamanho (se disponível).
  - Click no card → abre `MediaLightbox` com `<iframe src={url}>` pra PDF ou ícone grande + "Baixar" pra outros formatos (docx, xlsx, etc — browser não renderiza inline).
- Menu de **3 pontos** (`MoreVertical` do lucide) no canto do card com `DropdownMenu`:
  - "Visualizar" (abre lightbox)
  - "Baixar" (download direto, comportamento atual)
  - "Copiar link" (copia URL pro clipboard + toast)

**Menu de 3 pontos também em imagens e vídeos:** mesmo `DropdownMenu` no canto superior direito do thumb (aparece em hover desktop, sempre visível em mobile).

### 3. Componente `MediaLightbox.tsx` (novo)

Localização: `src/components/whatsapp/MediaLightbox.tsx`.

Props:
```ts
{ open: boolean; onClose: () => void;
  type: 'image' | 'video' | 'pdf' | 'document';
  url: string; filename?: string; mimeType?: string; }
```

Estrutura:
- `Dialog` do shadcn em modo fullscreen (sem padding padrão).
- Header com nome do arquivo + botões: baixar, copiar link, fechar.
- Body:
  - `image` → `<img>` centralizado com max-h/w 90vh/vw + zoom no click.
  - `video` → `<video controls autoplay>` 80vh.
  - `pdf` → `<iframe src={url}>` 100% altura.
  - `document` (não-PDF) → ícone grande + "Visualização indisponível" + botão "Baixar".

### Arquivos editados/criados

- **Criado**: `src/components/whatsapp/MediaLightbox.tsx`
- **Criado**: `src/lib/linkify.tsx` (helper puro retornando ReactNode[])
- **Editado**: `src/components/whatsapp/MessageBubble.tsx` (ou arquivo equivalente — confirmar nome no ato da implementação) — usa `linkify` no texto e abre lightbox em mídia
- **Editado**: o componente que renderiza documento (provável `MessageBubble` mesmo) — adiciona menu de 3 pontos com DropdownMenu

### Sem mudanças em backend
Tudo client-side. URLs de mídia já vêm do `whatsapp-chats` / payload UAZAPI.

### Validação
1. Mandar mensagem com link `https://...` → vira clicável, abre em nova aba.
2. Receber/abrir imagem → click no thumb abre lightbox; menu 3 pontos tem baixar/copiar/visualizar.
3. Receber PDF → card mostra nome; click abre PDF inline no lightbox; 3 pontos baixa.
4. Receber DOCX → card mostra nome; lightbox mostra "Visualização indisponível" + baixar.
5. Receber vídeo → toca inline; expandir abre lightbox em player grande.

