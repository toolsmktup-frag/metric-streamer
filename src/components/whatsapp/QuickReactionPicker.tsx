import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ReactNode } from 'react';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface QuickReactionPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (emoji: string) => void;
  trigger: ReactNode;
}

export default function QuickReactionPicker({ open, onOpenChange, onSelect, trigger }: QuickReactionPickerProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="p-1 w-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-0.5">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onSelect(emoji);
                onOpenChange(false);
              }}
              className="text-xl h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-transform hover:scale-125"
              aria-label={`Reagir com ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
