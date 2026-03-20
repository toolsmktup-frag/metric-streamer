import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, BookOpen, Paperclip, X, Image, Video, FileAudio, FileText, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

interface Shortcut {
  id: string;
  organization_id: string;
  category: string;
  title: string;
  body: string;
  media_url?: string | null;
  media_type?: string | null;
  media_filename?: string | null;
}

function getMediaIcon(type: string | null | undefined) {
  if (!type) return null;
  if (type.startsWith('image')) return <Image className="h-3 w-3 text-blue-500" />;
  if (type.startsWith('video')) return <Video className="h-3 w-3 text-purple-500" />;
  if (type.startsWith('audio')) return <FileAudio className="h-3 w-3 text-orange-500" />;
  return <FileText className="h-3 w-3 text-muted-foreground" />;
}

function CategoryCombobox({
  value,
  onChange,
  categories,
  onDeleteCategory,
}: {
  value: string;
  onChange: (v: string) => void;
  categories: string[];
  onDeleteCategory: (cat: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = categories.filter(c =>
    c.toLowerCase().includes(search.toLowerCase())
  );
  const showCreate = search.trim() && !categories.some(c => c.toLowerCase() === search.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-between w-full h-8 px-3 text-xs rounded-md border border-input bg-background hover:bg-accent/50 transition-colors"
        >
          <span className="truncate">{value || 'Selecionar...'}</span>
          <ChevronDown className="h-3 w-3 opacity-50 shrink-0 ml-1" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[220px]" align="start" side="bottom">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar ou criar..."
            value={search}
            onValueChange={setSearch}
            className="h-8 text-xs"
          />
          <CommandList>
            <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">
              {search.trim() ? 'Nenhuma encontrada' : 'Sem categorias'}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map(cat => (
                <CommandItem
                  key={cat}
                  value={cat}
                  onSelect={() => { onChange(cat); setOpen(false); setSearch(''); }}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    {value === cat && <Check className="h-3 w-3 text-primary" />}
                    <span>{cat}</span>
                  </div>
                  {cat !== 'Geral' && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDeleteCategory(cat); }}
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  )}
                </CommandItem>
              ))}
              {showCreate && (
                <CommandItem
                  value={`create-${search.trim()}`}
                  onSelect={() => { onChange(search.trim()); setOpen(false); setSearch(''); }}
                  className="text-xs text-primary"
                >
                  <Plus className="h-3 w-3 mr-1.5" />
                  Criar "{search.trim()}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function ShortcutManager() {
  const [open, setOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Shortcut | null>(null);
  const [formCategory, setFormCategory] = useState('Geral');
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formMediaFile, setFormMediaFile] = useState<File | null>(null);
  const [formMediaUrl, setFormMediaUrl] = useState<string | null>(null);
  const [formMediaType, setFormMediaType] = useState<string | null>(null);
  const [formMediaFilename, setFormMediaFilename] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchShortcuts = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('whatsapp_shortcuts')
      .select('*')
      .order('category')
      .order('title');
    if (data) setShortcuts(data);
  }, []);

  useEffect(() => {
    if (open) fetchShortcuts();
  }, [open, fetchShortcuts]);

  const resetForm = () => {
    setEditing(null);
    setFormCategory('Geral');
    setFormTitle('');
    setFormBody('');
    setFormMediaFile(null);
    setFormMediaUrl(null);
    setFormMediaType(null);
    setFormMediaFilename(null);
  };

  const startEdit = (s: Shortcut) => {
    setEditing(s);
    setFormCategory(s.category);
    setFormTitle(s.title);
    setFormBody(s.body);
    setFormMediaFile(null);
    setFormMediaUrl(s.media_url || null);
    setFormMediaType(s.media_type || null);
    setFormMediaFilename(s.media_filename || null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Arquivo muito grande (máx 20MB)');
      return;
    }
    setFormMediaFile(file);
    setFormMediaType(file.type);
    setFormMediaFilename(file.name);
    setFormMediaUrl(null);
  };

  const removeMedia = () => {
    setFormMediaFile(null);
    setFormMediaUrl(null);
    setFormMediaType(null);
    setFormMediaFilename(null);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || (!formBody.trim() && !formMediaFile && !formMediaUrl)) {
      toast.error('Preencha título e corpo ou anexe uma mídia');
      return;
    }
    setSaving(true);
    try {
      let mediaUrl = formMediaUrl;
      let mediaType = formMediaType;
      let mediaFilename = formMediaFilename;

      // Upload new file if selected
      if (formMediaFile) {
        const ext = formMediaFile.name.split('.').pop();
        const path = `shortcuts/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('whatsapp-media')
          .upload(path, formMediaFile);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(path);
        mediaUrl = urlData.publicUrl;
        mediaType = formMediaFile.type;
        mediaFilename = formMediaFile.name;
      }

      if (editing) {
        const { error } = await (supabase as any)
          .from('whatsapp_shortcuts')
          .update({
            category: formCategory,
            title: formTitle.trim(),
            body: formBody.trim(),
            media_url: mediaUrl,
            media_type: mediaType,
            media_filename: mediaFilename,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editing.id);
        if (error) throw error;
        toast.success('Atalho atualizado');
      } else {
        const { data: orgId } = await (supabase as any).rpc('get_user_org_id');
        if (!orgId) throw new Error('Organização não encontrada');
        const { error } = await (supabase as any)
          .from('whatsapp_shortcuts')
          .insert({
            organization_id: orgId,
            category: formCategory,
            title: formTitle.trim(),
            body: formBody.trim(),
            media_url: mediaUrl,
            media_type: mediaType,
            media_filename: mediaFilename,
          });
        if (error) throw error;
        toast.success('Atalho criado');
      }
      resetForm();
      fetchShortcuts();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase as any)
      .from('whatsapp_shortcuts')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Atalho removido');
      fetchShortcuts();
    }
  };

  const handleDeleteCategory = async (cat: string) => {
    const { error } = await (supabase as any)
      .from('whatsapp_shortcuts')
      .update({ category: 'Geral', updated_at: new Date().toISOString() })
      .eq('category', cat);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Categoria "${cat}" removida`);
      if (formCategory === cat) setFormCategory('Geral');
      fetchShortcuts();
    }
  };

  const filtered = shortcuts.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
  });

  const grouped: Record<string, Shortcut[]> = {};
  filtered.forEach(s => {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  });

  const categories = [...new Set(shortcuts.map(s => s.category))];
  if (!categories.includes('Geral')) categories.unshift('Geral');

  const hasMedia = formMediaFile || formMediaUrl;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Atalhos de mensagem">
          <BookOpen className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Atalhos de Mensagem
          </DialogTitle>
        </DialogHeader>

        {/* Form */}
        <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/30">
          <p className="text-xs font-semibold text-foreground">
            {editing ? 'Editar atalho' : 'Novo atalho'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Categoria</Label>
              <CategoryCombobox
                value={formCategory}
                onChange={setFormCategory}
                categories={categories}
                onDeleteCategory={handleDeleteCategory}
              />
            </div>
            <div>
              <Label className="text-[10px]">Título (comando)</Label>
              <Input
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder="saudacao"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div>
            <Label className="text-[10px]">Corpo da mensagem</Label>
            <Textarea
              value={formBody}
              onChange={e => setFormBody(e.target.value)}
              placeholder="Olá! Como posso ajudá-lo?"
              className="text-xs min-h-[60px]"
            />
          </div>

          {/* Media attach */}
          <div>
            <Label className="text-[10px]">Mídia (opcional)</Label>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
            />
            {hasMedia ? (
              <div className="flex items-center gap-2 px-2 py-1.5 bg-background border border-border rounded text-xs">
                {getMediaIcon(formMediaType)}
                <span className="truncate flex-1">{formMediaFilename || 'Arquivo'}</span>
                <button onClick={removeMedia} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded border border-dashed border-border transition-colors w-full"
              >
                <Paperclip className="h-3 w-3" />
                Anexar imagem, vídeo, áudio ou documento
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} size="sm" className="text-xs">
              {saving ? 'Salvando...' : editing ? 'Atualizar' : 'Criar'}
            </Button>
            {editing && (
              <Button onClick={resetForm} variant="outline" size="sm" className="text-xs">
                Cancelar
              </Button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar atalhos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        {/* List */}
        <ScrollArea className="flex-1 min-h-0 max-h-[300px]">
          {Object.keys(grouped).length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum atalho cadastrado. Crie o primeiro acima!
            </p>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="mb-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1">
                  {category}
                </p>
                {items.map(item => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-muted transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {getMediaIcon(item.media_type)}
                        <p className="text-xs font-medium text-foreground">/{item.title}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{item.body}</p>
                      {item.media_filename && (
                        <p className="text-[10px] text-muted-foreground/70 truncate">📎 {item.media_filename}</p>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => startEdit(item)}
                        className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
