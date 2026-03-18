import { useState } from 'react';
import { User, Tag, TrendingUp, ShoppingCart, StickyNote, Trash2, Plus, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useContactNotes } from '@/hooks/useContactNotes';
import { format } from 'date-fns';

interface ContactPanelProps {
  phone: string | null;
  senderName: string | null;
}

export default function ContactPanel({ phone, senderName }: ContactPanelProps) {
  const { notes, loading: notesLoading, addNote, deleteNote } = useContactNotes(phone);
  const [noteText, setNoteText] = useState('');

  if (!phone) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Selecione um contato
      </div>
    );
  }

  const formatPhone = (p: string) => {
    if (p.length === 13 && p.startsWith('55')) {
      return `(${p.slice(2, 4)}) ${p.slice(4, 9)}-${p.slice(9)}`;
    }
    return p;
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addNote(noteText);
    setNoteText('');
  };

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* Contact header */}
      <div className="flex flex-col items-center gap-2 pb-4 border-b border-border">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-8 w-8 text-primary" />
        </div>
        <h3 className="font-semibold text-foreground text-sm">
          {senderName || formatPhone(phone)}
        </h3>
        <span className="text-xs text-muted-foreground">{formatPhone(phone)}</span>
      </div>

      {/* Notes */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <StickyNote className="h-3 w-3" /> Notas internas
        </h4>
        
        {/* Add note */}
        <div className="flex gap-1.5 mb-2">
          <Textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Adicionar nota..."
            className="text-xs min-h-[50px] flex-1 resize-none"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAddNote();
              }
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 self-end"
            onClick={handleAddNote}
            disabled={!noteText.trim()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Notes list */}
        {notesLoading ? (
          <p className="text-xs text-muted-foreground italic">Carregando...</p>
        ) : notes.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhuma nota adicionada</p>
        ) : (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {notes.map(note => (
              <div key={note.id} className="bg-muted/50 rounded-lg p-2 group relative">
                <p className="text-xs text-foreground whitespace-pre-wrap">{note.content}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(note.created_at), 'dd/MM/yy HH:mm')}
                  </span>
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tags placeholder */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Tag className="h-3 w-3" /> Tags
        </h4>
        <p className="text-xs text-muted-foreground italic">Nenhuma tag vinculada</p>
      </div>

      {/* Funnel placeholder */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3" /> Funis
        </h4>
        <p className="text-xs text-muted-foreground italic">Nenhum funil vinculado</p>
      </div>

      {/* Sales placeholder */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <ShoppingCart className="h-3 w-3" /> Vendas
        </h4>
        <p className="text-xs text-muted-foreground italic">Nenhuma venda encontrada</p>
      </div>
    </div>
  );
}
