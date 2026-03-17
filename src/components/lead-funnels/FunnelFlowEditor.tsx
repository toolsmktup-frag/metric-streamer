import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
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
  ReactFlowProvider,
  useReactFlow,
  NodeChange,
  EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { LeadFunnelStage, FunnelSourceNode as SourceNodeType } from '@/types/leadFunnels';
import PageNode from './flow/PageNode';
import SourceNode from './flow/SourceNode';
import ActionNode from './flow/ActionNode';
import ConversionEdge from './flow/ConversionEdge';
import FlowToolbar, { DragNodeData } from './flow/FlowToolbar';
import NodeConfigPanel from './flow/NodeConfigPanel';
import { toast } from 'sonner';

const nodeTypes = {
  page: PageNode,
  trafficSource: SourceNode,
  action: ActionNode,
};

const edgeTypes = {
  conversion: ConversionEdge,
};

interface FunnelFlowEditorProps {
  stages: LeadFunnelStage[];
  sourceNodes: SourceNodeType[];
  leadCounts: Record<string, number>;
  edges: { source_node_id: string; target_node_id: string; source_type: string }[];
  funnelId: string;
  onAutoSaveNodes?: (nodes: Node[]) => Promise<void>;
  onAutoSaveEdges?: (edges: Edge[]) => Promise<void>;
}

function useDebounce(callback: () => void, delay: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const trigger = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => callbackRef.current(), delay);
  }, [delay]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return trigger;
}

function FlowCanvas({
  stages,
  sourceNodes,
  leadCounts,
  edges: savedEdges,
  funnelId,
  onAutoSaveNodes,
  onAutoSaveEdges,
}: FunnelFlowEditorProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const initialNodes: Node[] = useMemo(() => {
    const stageNodes: Node[] = stages
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s, i) => ({
        id: `stage-${s.id}`,
        type: 'page',
        position: { x: s.position_x || 350, y: s.position_y || i * 160 },
        data: {
          label: s.name,
          color: s.color,
          count: leadCounts[s.id] || 0,
          pageType: (s as any).page_type || 'content',
          pageUrl: s.page_url || '',
          thumbnailUrl: s.thumbnail_url || '',
          stageId: s.id,
        },
      }));

    const srcNodes: Node[] = sourceNodes.map((sn, i) => ({
      id: `source-${sn.id}`,
      type: 'trafficSource',
      position: { x: sn.position_x || 0, y: sn.position_y || i * 120 },
      data: { label: sn.label, sourceType: sn.source_type, sourceId: sn.id },
    }));

    return [...srcNodes, ...stageNodes];
  }, [stages, sourceNodes, leadCounts]);

  const initialEdges: Edge[] = useMemo(() =>
    savedEdges.map((e, i) => ({
      id: `edge-${i}`,
      source: e.source_type === 'source' ? `source-${e.source_node_id}` : `stage-${e.source_node_id}`,
      target: `stage-${e.target_node_id}`,
      type: 'conversion',
      animated: true,
      data: { count: 0 },
    })),
    [savedEdges]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Refs for debounced saves
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(flowEdges);
  nodesRef.current = nodes;
  edgesRef.current = flowEdges;

  const saveNodes = useCallback(async () => {
    if (!onAutoSaveNodes) return;
    setSaving(true);
    try {
      await onAutoSaveNodes(nodesRef.current);
    } catch {
      toast.error('Erro ao salvar posições');
    } finally {
      setSaving(false);
    }
  }, [onAutoSaveNodes]);

  const saveEdges = useCallback(async () => {
    if (!onAutoSaveEdges) return;
    setSaving(true);
    try {
      await onAutoSaveEdges(edgesRef.current);
    } catch {
      toast.error('Erro ao salvar conexões');
    } finally {
      setSaving(false);
    }
  }, [onAutoSaveEdges]);

  const debouncedSaveNodes = useDebounce(saveNodes, 1500);
  const debouncedSaveEdges = useDebounce(saveEdges, 1500);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, type: 'conversion', animated: true, data: { count: 0 } }, eds));
      debouncedSaveEdges();
    },
    [setEdges, debouncedSaveEdges]
  );

  // Auto-save on node drag stop
  const onNodeDragStop = useCallback(() => {
    debouncedSaveNodes();
  }, [debouncedSaveNodes]);

  // Handle node click → open config
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setConfigOpen(true);
  }, []);

  // Drop from toolbar
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/reactflow');
    if (!raw) return;

    const dragData: DragNodeData = JSON.parse(raw);
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const newId = `${dragData.nodeType}-${Date.now()}`;

    let newNode: Node;

    if (dragData.nodeType === 'source') {
      newNode = {
        id: newId,
        type: 'trafficSource',
        position,
        data: { label: dragData.label, sourceType: dragData.sourceType || 'other', count: 0 },
      };
    } else if (dragData.nodeType === 'page') {
      newNode = {
        id: newId,
        type: 'page',
        position,
        data: {
          label: dragData.label,
          pageType: dragData.pageType || 'content',
          color: '#3b82f6',
          count: 0,
          pageUrl: '',
        },
      };
    } else {
      newNode = {
        id: newId,
        type: 'action',
        position,
        data: { label: dragData.label, actionType: dragData.actionType || 'delay' },
      };
    }

    setNodes((nds) => [...nds, newNode]);
    debouncedSaveNodes();
  }, [screenToFlowPosition, setNodes, debouncedSaveNodes]);

  // Update node data from config panel
  const handleUpdateNode = useCallback((nodeId: string, newData: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: newData } : n))
    );
    setSelectedNode((prev) => prev && prev.id === nodeId ? { ...prev, data: newData } : prev);
    debouncedSaveNodes();
  }, [setNodes, debouncedSaveNodes]);

  // Delete node
  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    debouncedSaveNodes();
    debouncedSaveEdges();
  }, [setNodes, setEdges, debouncedSaveNodes, debouncedSaveEdges]);

  // Handle edge deletion
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
    const hasRemoval = changes.some((c) => c.type === 'remove');
    if (hasRemoval) debouncedSaveEdges();
  }, [onEdgesChange, debouncedSaveEdges]);

  return (
    <div className="flex h-[600px] border border-border rounded-xl overflow-hidden bg-background relative">
      {/* Saving indicator */}
      {saving && (
        <div className="absolute top-2 right-2 z-50 bg-card border border-border rounded-full px-3 py-1 flex items-center gap-2 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-xs text-muted-foreground">Salvando...</span>
        </div>
      )}

      <FlowToolbar />

      <div className="flex-1" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onNodeDragStop={onNodeDragStop}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: 'conversion', animated: true }}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-background"
        >
          <Background color="hsl(var(--border))" gap={20} />
          <Controls className="!bg-card !border-border [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground" />
          <MiniMap
            className="!bg-muted !border-border"
            nodeColor={(n) => {
              if (n.type === 'page') return (n.data as any).color || '#3b82f6';
              if (n.type === 'trafficSource') return '#10b981';
              return '#6366f1';
            }}
          />
        </ReactFlow>
      </div>

      <NodeConfigPanel
        node={selectedNode}
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        onUpdate={handleUpdateNode}
        onDelete={handleDeleteNode}
      />
    </div>
  );
}

const FunnelFlowEditor: React.FC<FunnelFlowEditorProps> = (props) => {
  return (
    <ReactFlowProvider>
      <FlowCanvas {...props} />
    </ReactFlowProvider>
  );
};

export default FunnelFlowEditor;
