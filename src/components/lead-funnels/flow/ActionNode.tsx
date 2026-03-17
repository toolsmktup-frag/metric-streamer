import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageCircle, Mail, Clock, GitBranch, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';

const actionConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  whatsapp: { icon: <MessageCircle className="h-4 w-4" />, color: '#25d366' },
  email: { icon: <Mail className="h-4 w-4" />, color: '#f59e0b' },
  delay: { icon: <Clock className="h-4 w-4" />, color: '#6366f1' },
  condition: { icon: <GitBranch className="h-4 w-4" />, color: '#ec4899' },
};

interface ActionNodeData {
  label: string;
  actionType: string;
  notes?: string;
}

function ActionNode({ data, selected }: { data: ActionNodeData; selected?: boolean }) {
  const config = actionConfig[data.actionType] || actionConfig.delay;
  const hasNotes = !!data.notes?.trim();

  return (
    <div
      className={cn(
        'rounded-full border-2 bg-card px-4 py-2.5 shadow-md flex items-center gap-2 min-w-[130px] transition-shadow relative',
        selected && 'shadow-lg ring-2 ring-primary/30'
      )}
      style={{ borderColor: config.color }}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary !w-3 !h-3" />

      {/* Notes indicator */}
      {hasNotes && (
        <div className="absolute -top-2 -right-2 z-10 bg-amber-400 rounded-full p-1 shadow-sm" title={data.notes}>
          <StickyNote className="h-3 w-3 text-amber-900" />
        </div>
      )}

      <span style={{ color: config.color }}>{config.icon}</span>
      <span className="text-sm font-medium text-foreground">{data.label}</span>
      <Handle type="source" position={Position.Right} className="!bg-primary !w-3 !h-3" />
    </div>
  );
}

export default ActionNode;
