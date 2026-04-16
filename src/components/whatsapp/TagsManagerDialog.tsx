import { useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useOrgTagsWithUsage, useRenameOrgTag, useDeleteOrgTag } from '@/hooks/useLeadTags';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TagsManagerDialog({ open, onOpenChange }: Props) {
  const { data: tags = [], isLoading } = useOrgTagsWithUsage(open);
  const renameTag = useRenameOrgTag();
  const deleteTag = useDeleteOrgTag();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const startEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditValue(currentName);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };
  const saveEdit = () => {
    if (!editingId) return;
    renameTag.mutate(
      { tagId: editingId, newName: editValue },
      { onSuccess: cancelEdit }
    );
  };

  const handleDelete = (id: string) => {
    if (confirmDeleteId === id) {
      deleteTag.mutate(id, { onSuccess: () => setConfirmDeleteId(null) });
    } else {
      setConfirmDeleteId(id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar tags da organização</DialogTitle>
          <DialogDescription>
            Renomeie ou exclua tags. Mudanças se aplicam a todos os leads vinculados.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto -mx-2 px-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Carregando…</p>
          ) : tags.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6 italic">
              Nenhuma tag criada ainda
            </p>
          ) : (
            <div className="space-y-1">
              {tags.map(tag => {
                const isEditing = editingId === tag.id;
                const isConfirming = confirmDeleteId === tag.id;
                return (
                  <div
                    key={tag.id}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group"
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    {isEditing ? (
                      <Input
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="h-7 text-sm flex-1"
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm flex-1 truncate">{tag.name}</span>
                    )}
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {tag.usage_count} {tag.usage_count === 1 ? 'lead' : 'leads'}
                    </Badge>

                    {isEditing ? (
                      <>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit} disabled={renameTag.isPending}>
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100"
                          onClick={() => startEdit(tag.id, tag.name)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-7 w-7 ${isConfirming ? 'opacity-100 text-destructive' : 'opacity-0 group-hover:opacity-100'}`}
                          onClick={() => handleDelete(tag.id)}
                          title={isConfirming ? 'Clique novamente para confirmar' : 'Excluir tag'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {confirmDeleteId && (
          <p className="text-[11px] text-destructive">
            Clique no ícone de lixeira novamente para confirmar a exclusão. A tag será removida de todos os leads vinculados.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
