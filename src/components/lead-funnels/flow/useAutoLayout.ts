import { useCallback } from 'react';
import type { Node, Edge } from '@xyflow/react';

const HORIZONTAL_GAP = 300;
const VERTICAL_GAP = 140;

/**
 * BFS-based horizontal tree layout.
 * Sources on the left, then pages/actions in layers by connection depth.
 */
export function useAutoLayout(
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  edges: Edge[],
  onSave: () => void,
) {
  return useCallback((nodes: Node[]) => {
    if (nodes.length === 0) return;

    // Build adjacency (source → targets)
    const adj = new Map<string, string[]>();
    const hasIncoming = new Set<string>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
      hasIncoming.add(e.target);
    }

    // Find roots (no incoming edges)
    const roots = nodes.filter(n => !hasIncoming.has(n.id)).map(n => n.id);
    if (roots.length === 0) {
      // fallback: use all nodes as roots
      roots.push(...nodes.map(n => n.id));
    }

    // BFS to assign layers
    const layers = new Map<string, number>();
    const queue: string[] = [...roots];
    roots.forEach(r => layers.set(r, 0));

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentLayer = layers.get(current)!;
      const targets = adj.get(current) || [];
      for (const t of targets) {
        const existing = layers.get(t);
        if (existing === undefined || existing < currentLayer + 1) {
          layers.set(t, currentLayer + 1);
          queue.push(t);
        }
      }
    }

    // Assign unvisited nodes to layer 0
    for (const n of nodes) {
      if (!layers.has(n.id)) layers.set(n.id, 0);
    }

    // Group by layer
    const layerGroups = new Map<number, string[]>();
    for (const [nodeId, layer] of layers) {
      if (!layerGroups.has(layer)) layerGroups.set(layer, []);
      layerGroups.get(layer)!.push(nodeId);
    }

    // Position nodes
    const positionMap = new Map<string, { x: number; y: number }>();
    for (const [layer, nodeIds] of layerGroups) {
      const totalHeight = (nodeIds.length - 1) * VERTICAL_GAP;
      const startY = -totalHeight / 2;
      nodeIds.forEach((id, idx) => {
        positionMap.set(id, { x: layer * HORIZONTAL_GAP, y: startY + idx * VERTICAL_GAP });
      });
    }

    setNodes(nds =>
      nds.map(n => {
        const pos = positionMap.get(n.id);
        return pos ? { ...n, position: pos } : n;
      })
    );

    onSave();
  }, [setNodes, edges, onSave]);
}
