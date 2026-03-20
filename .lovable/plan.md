

## Melhorias nos Atalhos: Mídia + Gestão de Categorias

### O que será feito

**1. Suporte a mídia nos atalhos (áudio, vídeo, documento)**

Cada atalho poderá ter um arquivo anexo opcional. Ao usar o atalho, o sistema envia o texto + mídia automaticamente.

**Banco de dados** (SQL para executar no Supabase):
```sql
ALTER TABLE public.whatsapp_shortcuts
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_filename text;
```

**ShortcutManager.tsx**:
- Adicionar botão de upload de arquivo no formulário (aceita imagem, vídeo, áudio, PDF/doc)
- Upload vai para o bucket `whatsapp-media` (já existe)
- Salva `media_url`, `media_type` e `media_filename` junto com o atalho
- Na lista, mostrar ícone indicando o tipo de mídia (🖼️ 🎥 🎵 📄)

**ShortcutMenu.tsx** (popup do `/`):
- Mostrar ícone de mídia ao lado do título quando o atalho tem anexo

**ChatInput.tsx**:
- Quando um atalho com mídia é selecionado, além de preencher o texto, setar o `attachment` automaticamente (baixar o arquivo da URL e criar um File object, ou passar a URL diretamente para o `sendWhatsAppMessage`)

**2. Gestão de categorias (select + criar nova + excluir)**

Trocar o campo de texto livre por um **Select/Combobox** que:
- Lista categorias existentes (extraídas dos atalhos já cadastrados)
- Permite digitar para criar uma nova categoria na hora
- Botão de "X" ao lado de cada categoria no select para excluí-la (o que remove a categoria de todos os atalhos que a usam, movendo-os para "Geral")

**Implementação no ShortcutManager.tsx**:
- Substituir o `<Input>` + `<datalist>` por um `Popover`/`Command` combo (padrão shadcn Combobox)
- Input de texto filtra categorias existentes; se digitar algo novo, aparece opção "Criar: [nome]"
- Cada categoria no dropdown tem um botão de lixeira para excluir
- Ao excluir uma categoria, faz `UPDATE whatsapp_shortcuts SET category = 'Geral' WHERE category = [excluída]`

### Arquivos editados

| Arquivo | Mudança |
|---|---|
| `src/components/whatsapp/ShortcutManager.tsx` | Upload de mídia no form + combobox de categorias |
| `src/components/whatsapp/ShortcutMenu.tsx` | Mostrar ícone de mídia nos atalhos |
| `src/components/whatsapp/ChatInput.tsx` | Ao selecionar atalho com mídia, enviar mídia junto |

### SQL para executar

```sql
ALTER TABLE public.whatsapp_shortcuts
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_filename text;
```

