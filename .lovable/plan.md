

## Plano: 4 Features do Chat WhatsApp (em sequência)

---

### 1. Emoji Picker

**Componente**: `EmojiPicker.tsx` dentro de `src/components/whatsapp/`

- Criar um componente com emojis organizados por categorias (Frequentes, Carinhas, Gestos, Objetos, etc.) usando emojis nativos Unicode (sem biblioteca externa)
- Botão de Smile ao lado do clip no `ChatInput.tsx` que abre um `Popover` com grid de emojis
- Campo de busca no topo do popover para filtrar emojis por nome
- Ao clicar num emoji, insere no texto do input na posição do cursor e fecha o popover
- Categorias selecionáveis por tabs/ícones no topo

**Arquivos alterados**: `ChatInput.tsx`, novo `EmojiPicker.tsx`

---

### 2. Gravação de Áudio (PTT)

**Componente**: `AudioRecorder.tsx` dentro de `src/components/whatsapp/`

- Botão de microfone que aparece no lugar do botão Send quando o input está vazio (igual WhatsApp real)
- Usa `MediaRecorder` API do browser para gravar áudio (format: `audio/webm` ou `audio/ogg`)
- UI durante gravação: fundo vermelho pulsante, timer de duração, botão de cancelar (lixeira) e enviar (send)
- Ao enviar: upload do blob para `whatsapp-media` storage, depois `sendWhatsAppMessage` com `message_type: 'audio'`
- Mensagem otimista com status pending igual texto

**Arquivos alterados**: `ChatInput.tsx` (lógica de swap mic/send), novo `AudioRecorder.tsx`

---

### 3. Atalhos de Mensagem (Respostas Rápidas)

**Banco de dados** (1 migration):
```sql
create table public.whatsapp_shortcuts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade not null,
  category text not null default 'Geral',
  title text not null,        -- nome curto ex: "saudacao"
  body text not null,          -- texto completo
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- RLS: org members only
```

**Componentes**:
- `ShortcutMenu.tsx` -- dropdown que aparece quando o usuário digita `/` no input. Lista atalhos filtrados pelo texto após `/`, agrupados por categoria. Clicar substitui o `/comando` pelo body do atalho.
- `ShortcutManager.tsx` -- dialog CRUD acessível via botão no input (ícone de Zap/BookOpen). Listar, criar, editar, deletar atalhos. Campos: categoria (select/input), título, corpo. Busca por título/corpo.

**Lógica no ChatInput**: detectar quando `text` começa com `/` e mostrar o `ShortcutMenu` como popover acima do input.

**Arquivos alterados**: `ChatInput.tsx`, novos `ShortcutMenu.tsx`, `ShortcutManager.tsx`, 1 migration

---

### 4. Notas Internas

**Banco de dados** (na mesma migration ou separada):
```sql
create table public.whatsapp_contact_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade not null,
  phone text not null,
  content text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
-- RLS: org members only
```

**UI no ContactPanel**: seção "Notas" com:
- Lista de notas existentes (scroll, ordenadas por data desc)
- Input + botão para adicionar nova nota
- Cada nota mostra texto, data e botão de deletar
- Hook `useContactNotes(phone)` para fetch/insert/delete

**Arquivos alterados**: `ContactPanel.tsx`, novo hook `useContactNotes.ts`, 1 migration

---

### Resumo de entregas

| # | Feature | Novos arquivos | Migration |
|---|---------|---------------|-----------|
| 1 | Emoji Picker | `EmojiPicker.tsx` | Nao |
| 2 | Gravação de Áudio | `AudioRecorder.tsx` | Nao |
| 3 | Atalhos de Mensagem | `ShortcutMenu.tsx`, `ShortcutManager.tsx` | Sim (1) |
| 4 | Notas Internas | `useContactNotes.ts` | Sim (1) |

Total: 5 novos arquivos, 2 migrations, edição em `ChatInput.tsx` e `ContactPanel.tsx`.

