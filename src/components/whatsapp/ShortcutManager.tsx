import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, BookOpen } from 'lucide-react';
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

interface Shortcut {
  id: string;
  organization_id: string;
  category: string;
  title: string;
  body: string;
}

export default function ShortcutManager() {
  const [open, setOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Shortcut | null>(null);
  const [formCategory, setFormCategory] = useState('Geral');
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [saving, setSaving] = useState(false);

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
  };

  const startEdit = (s: Shortcut) => {
    setEditing(s);
    setFormCategory(s.category);
    setFormTitle(s.title);
    setFormBody(s.body);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formBody.trim()) {
      toast.error('Preencha título e corpo');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await (supabase as any)
          .from('whatsapp_shortcuts')
          .update({ category: formCategory, title: formTitle.trim(), body: formBody.trim(), updated_at: new Date().toISOString() })
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
              <Input
                value={formCategory}
                onChange={e => setFormCategory(e.target.value)}
                placeholder="Geral"
                className="h-8 text-xs"
                list="shortcut-categories"
              />
              <datalist id="shortcut-categories">
                {categories.map(c => <option key={c} value={c} />)}
              </datalist>
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
                      <p className="text-xs font-medium text-foreground">/{item.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{item.body}</p>
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
