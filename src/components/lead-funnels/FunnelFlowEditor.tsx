import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { LeadFunnelStage, FunnelSourceNode as SourceNodeType } from '@/types/leadFunnels';

// Custom Stage Node
function StageNode({ data }: { data: { label: string; color: string; count: number } }) {
  return (
    <div
      className="rounded-lg border-2 bg-card px-4 py-3 min-w-[160px] shadow-sm"
      style={{ borderColor: data.color }}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: data.color }} />
        <span className="text-sm font-medium text-foreground">{data.label}</span>
      </div>
      <p className="text-lg font-bold text-foreground mt-1">{data.count}</p>
      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </div>
  );
}

// Custom Traffic Source Node
function TrafficSourceNode({ data }: { data: { label: string; sourceType: string } }) {
  const icons: Record<string, string> = {
    instagram: '📸',
    facebook: '👤',
    google: '🔍',
    whatsapp: '💬',
    youtube: '▶️',
    tiktok: '🎵',
    email: '📧',
    other: '🌐',
  };

  return (
    <div className="rounded-lg border border-border bg-accent/50 px-4 py-3 min-w-[140px] shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icons[data.sourceType] || icons.other}</span>
        <span className="text-sm font-medium text-foreground">{data.label}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </div>
  );
}

const nodeTypes = {
  stage: StageNode,
  trafficSource: TrafficSourceNode,
};

interface FunnelFlowEditorProps {
  stages: LeadFunnelStage[];
  sourceNodes: SourceNodeType[];
  leadCounts: Record<string, number>;
  edges: { source_node_id: string; target_node_id: string; source_type: string }[];
  onSave?: (nodes: { id: string; x: number; y: number }[], edges: { source: string; target: string }[]) => void;
}

const FunnelFlowEditor: React.FC<FunnelFlowEditorProps> = ({
  stages,
  sourceNodes,
  leadCounts,
  edges: savedEdges,
}) => {
  const initialNodes: Node[] = useMemo(() => {
    const stageNodes: Node[] = stages
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s, i) => ({
        id: `stage-${s.id}`,
        type: 'stage',
        position: { x: s.position_x || 300, y: s.position_y || i * 120 },
        data: { label: s.name, color: s.color, count: leadCounts[s.id] || 0 },
      }));

    const srcNodes: Node[] = sourceNodes.map((sn, i) => ({
      id: `source-${sn.id}`,
      type: 'trafficSource',
      position: { x: sn.position_x || 0, y: sn.position_y || i * 100 },
      data: { label: sn.label, sourceType: sn.source_type },
    }));

    return [...srcNodes, ...stageNodes];
  }, [stages, sourceNodes, leadCounts]);

  const initialEdges: Edge[] = useMemo(() =>
    savedEdges.map((e, i) => ({
      id: `edge-${i}`,
      source: e.source_type === 'source' ? `source-${e.source_node_id}` : `stage-${e.source_node_id}`,
      target: `stage-${e.target_node_id}`,
      animated: true,
      style: { stroke: 'hsl(var(--primary))' },
    })),
    [savedEdges]
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: 'hsl(var(--primary))' } }, eds)),
    [setEdges]
  );

  return (
    <div className="h-[500px] border border-border rounded-xl overflow-hidden bg-background">
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="hsl(var(--border))" gap={20} />
        <Controls className="!bg-card !border-border" />
        <MiniMap
          className="!bg-muted"
          nodeColor={(n) => n.type === 'stage' ? (n.data as any).color : 'hsl(var(--accent))'}
        />
      </ReactFlow>
    </div>
  );
};

export default FunnelFlowEditor;
