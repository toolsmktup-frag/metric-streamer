import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Zap, Image, Video, FileAudio, FileText } from 'lucide-react';

interface Shortcut {
  id: string;
  category: string;
  title: string;
  body: string;
  media_url?: string | null;
  media_type?: string | null;
  media_filename?: string | null;
}

interface ShortcutMenuProps {
  query: string;
  onSelect: (body: string, shortcut?: Shortcut) => void;
  onClose: () => void;
}

function getMediaIcon(type: string | null | undefined) {
  if (!type) return null;
  if (type.startsWith('image')) return <Image className="h-3 w-3 text-blue-500" />;
  if (type.startsWith('video')) return <Video className="h-3 w-3 text-purple-500" />;
  if (type.startsWith('audio')) return <FileAudio className="h-3 w-3 text-orange-500" />;
  return <FileText className="h-3 w-3 text-muted-foreground" />;
}

export default function ShortcutMenu({ query, onSelect, onClose }: ShortcutMenuProps) {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const fetchShortcuts = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('whatsapp_shortcuts')
      .select('id, category, title, body, media_url, media_type, media_filename')
      .order('category')
      .order('title');
    if (data) setShortcuts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchShortcuts();
  }, [fetchShortcuts]);

  const filtered = shortcuts.filter(s => {
    if (!query) return true;
    const q = query.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault();
        const s = filtered[selectedIndex];
        onSelect(s?.body || '', s);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [filtered, selectedIndex, onSelect, onClose]);

  if (loading) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg p-3 text-xs text-muted-foreground">
        Carregando atalhos...
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg p-3 text-xs text-muted-foreground">
        Nenhum atalho encontrado
      </div>
    );
  }

  const grouped: Record<string, Shortcut[]> = {};
  filtered.forEach(s => {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  });

  let globalIndex = 0;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg z-50">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
        <Zap className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">Atalhos rápidos</span>
      </div>
      <ScrollArea className="max-h-48">
        <div className="p-1">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider px-2 py-1">
                {category}
              </p>
              {items.map(item => {
                const idx = globalIndex++;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.body, item)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      idx === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {getMediaIcon(item.media_type)}
                      <span className="font-medium text-foreground">/{item.title}</span>
                      <span className="text-muted-foreground ml-1 truncate">
                        {item.body.slice(0, 60)}{item.body.length > 60 ? '...' : ''}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
