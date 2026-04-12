import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import WzFlowSidebar, { type WzDragData } from './WzFlowSidebar';
import WzNodeConfigPanel from './WzNodeConfigPanel';
import WzTriggerNode from './nodes/WzTriggerNode';
import WzWhatsAppNode from './nodes/WzWhatsAppNode';
import WzTimerNode from './nodes/WzTimerNode';
import WzConditionNode from './nodes/WzConditionNode';
import WzStopNode from './nodes/WzStopNode';
import WzNoteNode from './nodes/WzNoteNode';
import WzAbSplitNode from './nodes/WzAbSplitNode';
import WzSmartDelayNode from './nodes/WzSmartDelayNode';
import WzWebhookNode from './nodes/WzWebhookNode';
import WzTagNode from './nodes/WzTagNode';
import WzGotoNode from './nodes/WzGotoNode';
import { useWzFlow, useCreateWzFlow, useUpdateWzFlow } from '@/hooks/useWzFlows';
import { useWzFlowNodeStats } from '@/hooks/useWzFlowNodeStats';

const nodeTypes: NodeTypes = {
  trigger: WzTriggerNode,
  whatsapp: WzWhatsAppNode,
  timer: WzTimerNode,
  condition: WzConditionNode,
  stop: WzStopNode,
  note: WzNoteNode,
  ab_split: WzAbSplitNode,
  smart_delay: WzSmartDelayNode,
  webhook: WzWebhookNode,
  tag: WzTagNode,
  goto: WzGotoNode,
};

const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: true,
  style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
};

let nodeIdCounter = 0;
function getNodeId() {
  return `wz_node_${Date.now()}_${++nodeIdCounter}`;
}

export default function WzFlowCanvasEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === 'novo';
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const { data: existingFlow, isLoading: loadingFlow } = useWzFlow(isNew ? undefined : id);
  const createFlow = useCreateWzFlow();
  const updateFlow = useUpdateWzFlow();
  const { data: nodeStatsMap } = useWzFlowNodeStats(flowId);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [flowName, setFlowName] = useState('Novo Fluxo');
  const [isActive, setIsActive] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flowId, setFlowId] = useState<string | null>(isNew ? null : id!);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Load existing flow
  useEffect(() => {
    if (existingFlow) {
      setFlowName(existingFlow.name);
      setIsActive(existingFlow.is_active);
      if (existingFlow.nodes?.length) setNodes(existingFlow.nodes as Node[]);
      if (existingFlow.edges?.length) setEdges(existingFlow.edges as Edge[]);
    }
  }, [existingFlow, setNodes, setEdges]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({ ...connection, ...defaultEdgeOptions }, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setConfigOpen(true);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setConfigOpen(false);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    const confirmDelete = window.confirm('Deseja remover esta conexão?');
    if (confirmDelete) {
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      toast.success('Conexão removida');
    }
  }, [setEdges]);

  // Drop handler
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/wz-flow');
    if (!raw || !reactFlowInstance) return;

    const dragData: WzDragData = JSON.parse(raw);

    // Multiple triggers allowed per flow

    const position = reactFlowInstance.screenToFlowPosition({
      x: e.clientX,
      y: e.clientY,
    });

    const nodeData: Record<string, any> = { label: dragData.label };

    if (dragData.nodeType === 'trigger') {
      nodeData.triggerType = dragData.triggerType;
      nodeData.platform = 'any';
    } else if (dragData.nodeType === 'whatsapp') {
      nodeData.messages = [{ text: '', type: 'text' }];
      nodeData.delayMin = 1;
      nodeData.delayMax = 5;
    } else if (dragData.nodeType === 'timer') {
      nodeData.delay = 1;
      nodeData.unit = 'hours';
    } else if (dragData.nodeType === 'condition') {
      nodeData.variable = '';
      nodeData.operator = '';
      nodeData.compareValue = '';
    } else if (dragData.nodeType === 'stop') {
      nodeData.stopType = dragData.stopType || 'stop';
    } else if (dragData.nodeType === 'note') {
      nodeData.text = '';
      nodeData.noteColor = 'yellow';
    } else if (dragData.nodeType === 'ab_split') {
      nodeData.splitMode = 'percentage';
      nodeData.paths = [
        { label: 'A', percent: 50 },
        { label: 'B', percent: 50 },
      ];
      nodeData.sellers = [];
      nodeData.assignAction = 'assign_and_branch';
    } else if (dragData.nodeType === 'smart_delay') {
      nodeData.targetTime = '09:00';
      nodeData.targetDay = 'any';
      nodeData.businessDaysOnly = false;
    } else if (dragData.nodeType === 'webhook') {
      nodeData.url = '';
      nodeData.method = 'POST';
      nodeData.headers = '';
      nodeData.body = '';
    } else if (dragData.nodeType === 'tag') {
      nodeData.tagName = '';
      nodeData.tagAction = 'add';
    } else if (dragData.nodeType === 'goto') {
      nodeData.targetNodeId = '';
      nodeData.targetNodeLabel = '';
    }

    const newNode: Node = {
      id: getNodeId(),
      type: dragData.nodeType,
      position,
      data: nodeData,
    };

    setNodes((nds) => [...nds, newNode]);
  }, [reactFlowInstance, nodes, setNodes]);

  // Node operations
  const handleNodeUpdate = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data } : n))
    );
    setSelectedNode((prev) => (prev?.id === nodeId ? { ...prev, data } : prev));
  }, [setNodes]);

  const handleNodeDelete = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
    setConfigOpen(false);
  }, [setNodes, setEdges]);

  const handleNodeDuplicate = useCallback((nodeId: string) => {
    const original = nodes.find((n) => n.id === nodeId);
    if (!original) return;
    const newNode: Node = {
      ...original,
      id: getNodeId(),
      position: { x: original.position.x + 40, y: original.position.y + 40 },
      selected: false,
    };
    setNodes((nds) => [...nds, newNode]);
  }, [nodes, setNodes]);

  // Save
  const handleSave = async () => {
    setSaving(true);
    try {
      if (flowId) {
        await updateFlow.mutateAsync({
          id: flowId,
          name: flowName,
          is_active: isActive,
          nodes: nodes as any,
          edges: edges as any,
        });
        toast.success('Fluxo salvo!');
      } else {
        const created = await createFlow.mutateAsync({
          name: flowName,
          is_active: isActive,
          nodes: nodes as any,
          edges: edges as any,
        });
        setFlowId(created.id);
        navigate(`/ferramentas/automacoes/${created.id}`, { replace: true });
        toast.success('Fluxo criado!');
      }
    } catch (err) {
      toast.error('Erro ao salvar fluxo');
    } finally {
      setSaving(false);
    }
  };

  if (!isNew && loadingFlow) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/ferramentas/automacoes')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            className="h-8 w-56 text-sm font-semibold border-transparent hover:border-border focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} className="scale-90" />
            <span className="text-xs text-muted-foreground">{isActive ? 'Ativo' : 'Inativo'}</span>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <WzFlowSidebar />

        {/* Canvas */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes.map((n) => ({
              ...n,
              data: { ...n.data, stats: nodeStatsMap?.[n.id] },
            }))}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            className="bg-muted/30"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
          </ReactFlow>
        </div>

        {/* Config Panel */}
        <WzNodeConfigPanel
          node={selectedNode}
          open={configOpen}
          onClose={() => { setConfigOpen(false); setSelectedNode(null); }}
          onUpdate={handleNodeUpdate}
          onDelete={handleNodeDelete}
          onDuplicate={handleNodeDuplicate}
        />
      </div>
    </div>
  );
}
