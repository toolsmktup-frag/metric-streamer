import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Zap } from 'lucide-react';

interface Shortcut {
  id: string;
  category: string;
  title: string;
  body: string;
}

interface ShortcutMenuProps {
  query: string; // text after "/"
  onSelect: (body: string) => void;
  onClose: () => void;
}

export default function ShortcutMenu({ query, onSelect, onClose }: ShortcutMenuProps) {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const fetchShortcuts = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('whatsapp_shortcuts')
      .select('id, category, title, body')
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

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
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
        onSelect(filtered[selectedIndex]?.body || '');
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

  // Group by category
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
                    onClick={() => onSelect(item.body)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      idx === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                    }`}
                  >
                    <span className="font-medium text-foreground">/{item.title}</span>
                    <span className="text-muted-foreground ml-2 truncate">
                      {item.body.slice(0, 60)}{item.body.length > 60 ? '...' : ''}
                    </span>
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
