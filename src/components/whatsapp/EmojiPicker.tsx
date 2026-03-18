import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';

const EMOJI_DATA: Record<string, string[]> = {
  '😊 Carinhas': [
    '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
    '😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🫡',
    '🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴',
    '😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐',
    '😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢',
    '😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀',
  ],
  '👋 Gestos': [
    '👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟',
    '🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏',
    '🙌','🫶','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀',
  ],
  '❤️ Corações': [
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞',
    '💓','💗','💖','💘','💝','💟','♥️','🫶',
  ],
  '🎉 Objetos': [
    '🎉','🎊','🎈','🎁','🏆','🥇','⭐','🌟','💫','✨','🔥','💯','✅','❌','⚡','💡',
    '📌','📎','🔗','🔔','📢','💬','💭','🗨️','📝','📅','📊','📈','📉','💰','💵','💳',
    '📱','💻','⌨️','📧','📞','🕐','⏰','⏳','🚀','🏠','🏢','🏪',
  ],
  '🍕 Comida': [
    '🍕','🍔','🍟','🌭','🍿','🧂','🥚','🍳','🥞','🧇','🥓','🥩','🍗','🍖','🌮','🌯',
    '🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🍡','🍧',
    '🍨','🍦','🥧','🧁','🍰','🎂','☕','🍵','🧃','🥤','🍺','🍻','🥂','🍷',
  ],
};

const EMOJI_SEARCH_MAP: Record<string, string[]> = {
  'sorriso': ['😀','😃','😄','😁','😊'],
  'riso': ['😆','😅','🤣','😂'],
  'coracao': ['❤️','🧡','💛','💚','💙','💜','💖','💕'],
  'amor': ['🥰','😍','😘','❤️','💕','💖'],
  'triste': ['😢','😭','😞','😔','🙁'],
  'raiva': ['😤','😡','😠','🤬'],
  'fogo': ['🔥'],
  'ok': ['👌','✅','👍'],
  'like': ['👍','💯'],
  'mao': ['👋','🤚','✋','👏','🙌','🤝'],
  'festa': ['🎉','🎊','🥳','🎈'],
  'estrela': ['⭐','🌟','💫','✨'],
  'foguete': ['🚀'],
  'dinheiro': ['💰','💵','💳','🤑'],
  'telefone': ['📱','📞'],
  'comida': ['🍕','🍔','🍟','🍗'],
  'cafe': ['☕'],
  'check': ['✅','☑️'],
  'x': ['❌'],
};

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export default function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(Object.keys(EMOJI_DATA)[0]);

  const filteredEmojis = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase().trim();
    const results = new Set<string>();
    
    // Search by keyword
    for (const [keyword, emojis] of Object.entries(EMOJI_SEARCH_MAP)) {
      if (keyword.includes(q)) {
        emojis.forEach(e => results.add(e));
      }
    }
    // Also search all emojis in all categories
    for (const emojis of Object.values(EMOJI_DATA)) {
      emojis.forEach(e => results.add(e));
    }
    
    return results.size > 0 ? Array.from(results).slice(0, 60) : [];
  }, [search]);

  const categoryKeys = Object.keys(EMOJI_DATA);
  const categoryIcons = categoryKeys.map(k => k.split(' ')[0]);

  return (
    <div className="w-72 max-h-80 flex flex-col">
      {/* Search */}
      <div className="p-2 border-b border-border">
        <Input
          placeholder="Buscar emoji..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-7 text-xs"
          autoFocus
        />
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="flex gap-0.5 px-2 py-1 border-b border-border">
          {categoryKeys.map((cat, i) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`text-base p-1 rounded hover:bg-muted transition-colors ${
                activeCategory === cat ? 'bg-muted' : ''
              }`}
              title={cat}
            >
              {categoryIcons[i]}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {search ? (
          <div className="grid grid-cols-8 gap-0.5">
            {(filteredEmojis || []).map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                onClick={() => onSelect(emoji)}
                className="text-xl h-8 w-8 flex items-center justify-center rounded hover:bg-muted transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : (
          <>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
              {activeCategory}
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJI_DATA[activeCategory]?.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  onClick={() => onSelect(emoji)}
                  className="text-xl h-8 w-8 flex items-center justify-center rounded hover:bg-muted transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
