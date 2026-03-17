import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Instagram, Facebook, Search, MessageCircle, Youtube, Music, Mail, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

const sourceIcons: Record<string, { icon: React.ReactNode; gradient: string }> = {
  instagram: { icon: <Instagram className="h-5 w-5" />, gradient: 'from-pink-500 to-purple-500' },
  facebook: { icon: <Facebook className="h-5 w-5" />, gradient: 'from-blue-600 to-blue-400' },
  google: { icon: <Search className="h-5 w-5" />, gradient: 'from-red-500 to-yellow-400' },
  whatsapp: { icon: <MessageCircle className="h-5 w-5" />, gradient: 'from-green-500 to-green-400' },
  youtube: { icon: <Youtube className="h-5 w-5" />, gradient: 'from-red-600 to-red-400' },
  tiktok: { icon: <Music className="h-5 w-5" />, gradient: 'from-gray-900 to-gray-600' },
  email: { icon: <Mail className="h-5 w-5" />, gradient: 'from-amber-500 to-orange-400' },
  organic: { icon: <Globe className="h-5 w-5" />, gradient: 'from-emerald-500 to-teal-400' },
};

interface SourceNodeData {
  label: string;
  sourceType: string;
  count?: number;
}

function SourceNode({ data, selected }: { data: SourceNodeData; selected?: boolean }) {
  const config = sourceIcons[data.sourceType] || sourceIcons.organic;

  return (
    <div
      className={cn(
        'rounded-xl shadow-md min-w-[150px] overflow-hidden transition-shadow',
        selected && 'shadow-lg ring-2 ring-primary/30'
      )}
    >
      {/* Gradient header */}
      <div className={cn('bg-gradient-to-r px-3 py-2.5 flex items-center gap-2 text-white', config.gradient)}>
        {config.icon}
        <span className="text-sm font-semibold">{data.label}</span>
      </div>

      {/* Volume badge */}
      {data.count !== undefined && data.count > 0 && (
        <div className="bg-card px-3 py-1.5 flex items-center gap-1.5 border-t border-border">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold text-foreground">{data.count}</span>
          <span className="text-[10px] text-muted-foreground">visitantes</span>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-white !border-2 !border-primary !w-3 !h-3" />
    </div>
  );
}

export default SourceNode;
