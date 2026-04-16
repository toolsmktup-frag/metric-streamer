import { useState, useMemo, useRef, useEffect } from 'react';
import { X, Plus, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLeadTags, useOrgTags, useAddTagToLead, useRemoveTagFromLead } from '@/hooks/useLeadTags';
import TagsManagerDialog from './TagsManagerDialog';

interface Props {
  leadId: string;
}

export default function TagsEditor({ leadId }: Props) {
  const { data: leadTags = [] } = useLeadTags(leadId);
  const { data: orgTags = [] } = useOrgTags();
  const addTag = useAddTagToLead();
  const removeTag = useRemoveTagFromLead();

  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const leadTagIds = useMemo(() => new Set(leadTags.map(t => t.id)), [leadTags]);

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    return orgTags
      .filter(t => !leadTagIds.has(t.id))
      .filter(t => !q || t.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [orgTags, leadTagIds, input]);

  const exactMatch = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return null;
    return orgTags.find(t => t.name.toLowerCase() === q) || null;
  }, [orgTags, input]);

  const handleAdd = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addTag.mutate(
      { leadId, name: trimmed },
      {
        onSuccess: () => {
          setInput('');
          setOpen(false);
          inputRef.current?.focus();
        },
      }
    );
  };

  // Open popover when input has focus
  useEffect(() => {
    if (input.trim()) setOpen(true);
  }, [input]);

  return (
    <>
      <div className="space-y-2">
        {/* Existing tag chips */}
        {leadTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {leadTags.map(tag => (
              <Badge
                key={tag.id}
                variant="secondary"
                className="text-[10px] px-1.5 py-0.5 gap-1 group"
                style={{
                  backgroundColor: `${tag.color}20`,
                  color: tag.color,
                  borderColor: `${tag.color}40`,
                }}
              >
                {tag.name}
                <button
                  type="button"
                  onClick={() => removeTag.mutate({ leadId, tagId: tag.id })}
                  className="opacity-60 hover:opacity-100 -mr-0.5"
                  aria-label={`Remover tag ${tag.name}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Input + autocomplete */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <div className="flex gap-1">
              <Input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onFocus={() => setOpen(true)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (input.trim()) handleAdd(input);
                  } else if (e.key === 'Escape') {
                    setOpen(false);
                  }
                }}
                placeholder="Adicionar tag…"
                className="h-7 text-xs flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setManagerOpen(true)}
                title="Gerenciar tags da organização"
              >
                <Settings className="h-3 w-3" />
              </Button>
            </div>
          </PopoverTrigger>
          <PopoverContent
            className="w-[220px] p-1"
            align="start"
            onOpenAutoFocus={e => e.preventDefault()}
          >
            {suggestions.length === 0 && !input.trim() && (
              <p className="text-[10px] text-muted-foreground italic px-2 py-1.5">
                Comece a digitar para sugerir tags…
              </p>
            )}
            {suggestions.length > 0 && (
              <div className="space-y-0.5">
                {suggestions.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleAdd(t.name)}
                    className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent flex items-center gap-1.5"
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            {input.trim() && !exactMatch && (
              <button
                type="button"
                onClick={() => handleAdd(input)}
                className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent flex items-center gap-1.5 text-primary mt-1 border-t border-border pt-1.5"
              >
                <Plus className="h-3 w-3" />
                Criar “{input.trim()}”
              </button>
            )}
          </PopoverContent>
        </Popover>

        {leadTags.length === 0 && !input && (
          <p className="text-[10px] text-muted-foreground italic">Nenhuma tag vinculada</p>
        )}
      </div>

      <TagsManagerDialog open={managerOpen} onOpenChange={setManagerOpen} />
    </>
  );
}
