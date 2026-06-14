import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-2d';
import type { GraphAction, GraphDocument, GraphEdge, GraphNode } from '../types';
import './GraphView.css';

export type GraphLayout = 'force' | 'layered' | 'tree' | 'balloon' | 'radial' | 'circular' | 'mindmap';
export type GraphNodeShape = 'circle' | 'card' | 'rounded' | 'diamond' | 'hexagon';
export type GraphColorMode = 'action' | 'group';

interface Props {
  document: GraphDocument;
  compact?: boolean;
  initialLayout?: GraphLayout;
  onOpenFullPage?: () => void;
}

type ForceNode = GraphNode & { x?: number; y?: number; fx?: number; fy?: number };
type ForceLink = GraphEdge & {
  source: string | ForceNode;
  target: string | ForceNode;
};

interface GraphControls {
  arrows: boolean;
  animate: boolean;
  changedOnly: boolean;
  dependenciesOnly: boolean;
  nodeScale: number;
  linkScale: number;
  textThreshold: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
}

const SHAPE_KEY = 'tf9-graph-node-shape';
const COLOR_KEY = 'tf9-graph-color-mode';
const PALETTE = ['#ef4444', '#f97316', '#3b82f6', '#14b8a6', '#8b5cf6', '#ec4899', '#64748b'];
const HIERARCHY_KINDS: Array<{ kind: GraphNode['kind']; label: string }> = [
  { kind: 'group', label: 'Group' },
  { kind: 'target', label: 'Target' },
  { kind: 'module', label: 'Module' },
  { kind: 'managed', label: 'Resource' },
  { kind: 'data', label: 'Data' },
];
const HIERARCHY_COLORS: Record<GraphNode['kind'], string> = {
  repository: '#7c3aed',
  group: '#2563eb',
  target: '#0891b2',
  module: '#d97706',
  managed: '#dc2626',
  data: '#16a34a',
};
// Most-impactful first — drives container fill and the impact summary order.
const SEVERITY: GraphAction[] = ['replace', 'delete', 'update', 'create'];
const DEFAULT_CONTROLS: GraphControls = {
  arrows: false,
  animate: true,
  changedOnly: false,
  dependenciesOnly: false,
  nodeScale: 0.75,
  linkScale: 0.7,
  textThreshold: 1.25,
  centerForce: 0.35,
  repelForce: 85,
  linkForce: 0.28,
  linkDistance: 75,
};

// Canvas paints with plain color strings, so the live theme tokens are read
// from the resolved CSS custom properties rather than via CSS.
interface ThemeTokens {
  canvas: string; neutral: string; highlight: string; link: string; linkDep: string; linkMuted: string;
  create: string; update: string; remove: string; replace: string;
  text: string; border: string;
}

function readTokens(): ThemeTokens {
  const style = typeof window !== 'undefined'
    ? getComputedStyle(window.document.documentElement)
    : null;
  const get = (name: string, fallback: string) => (style?.getPropertyValue(name).trim() || fallback);
  return {
    canvas: get('--gv-canvas', '#07101d'),
    neutral: get('--gv-neutral', '#94a3b8'),
    highlight: get('--gv-highlight', '#fbbf24'),
    link: get('--gv-link', 'rgba(150,170,195,.42)'),
    linkDep: get('--gv-link-dep', 'rgba(95,155,255,.58)'),
    linkMuted: get('--gv-link-muted', 'rgba(140,155,175,.18)'),
    create: get('--tf-add', '#22c55e'),
    update: get('--tf-change', '#f59e0b'),
    remove: get('--tf-destroy', '#ef4444'),
    replace: get('--tf-replace', '#a78bfa'),
    text: get('--text-1', '#dbe5f2'),
    border: get('--border', '#263548'),
  };
}

function useThemeTokens(): ThemeTokens {
  const [tokens, setTokens] = useState<ThemeTokens>(readTokens);
  useEffect(() => {
    const update = () => setTokens(readTokens());
    update();
    const observer = new MutationObserver(update);
    observer.observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-variant'],
    });
    return () => observer.disconnect();
  }, []);
  return tokens;
}

function storedChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    if (value && (allowed as readonly string[]).includes(value)) return value as T;
  } catch {
    // Storage is optional.
  }
  return fallback;
}

const ACTION_LABEL: Record<string, string> = {
  create: 'Create', update: 'Update', delete: 'Destroy', replace: 'Replace', '': 'No change',
};

function actionMark(action?: GraphAction): string {
  if (action === 'create') return '+';
  if (action === 'update') return '~';
  if (action === 'delete') return '-';
  if (action === 'replace') return '±';
  return '·';
}

function actionColor(tokens: ThemeTokens, action?: GraphAction): string {
  if (action === 'create') return tokens.create;
  if (action === 'update') return tokens.update;
  if (action === 'delete') return tokens.remove;
  if (action === 'replace') return tokens.replace;
  return tokens.neutral;
}

function dominantAction(counts?: Record<string, number>): GraphAction {
  if (counts) for (const action of SEVERITY) if (counts[action]) return action;
  return '';
}

function hash(value: string): number {
  let result = 0;
  for (let i = 0; i < value.length; i++) result = ((result << 5) - result + value.charCodeAt(i)) | 0;
  return Math.abs(result);
}

function hierarchyColor(kind: GraphNode['kind']): string {
  return HIERARCHY_COLORS[kind];
}

function synthesize(doc: GraphDocument): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const repoLabel = doc.repo || 'repository';
  const repoID = `repo:${repoLabel}`;
  const nodes: GraphNode[] = [{ id: repoID, kind: 'repository', label: repoLabel, repo: doc.repo }];
  const edges: GraphEdge[] = [...(doc.edges ?? [])];
  const groups = new Set<string>();
  const targets = new Map<string, string>();

  for (const node of doc.nodes ?? []) {
    const group = node.group || '';
    const groupID = `group:${group}`;
    const targetID = `target:${node.target}`;
    // A group that is empty or just repeats the repository name adds no
    // information — skip it and parent the target straight to the repo so the
    // graph does not show two same-named container nodes.
    const groupRedundant = !group || group === repoLabel;
    const targetParent = groupRedundant ? repoID : groupID;
    if (!groupRedundant && !groups.has(group)) {
      groups.add(group);
      nodes.push({ id: groupID, kind: 'group', label: group, parent: repoID, repo: doc.repo, group });
      edges.push({ id: `contains:${repoID}:${groupID}`, source: repoID, target: groupID, kind: 'containment' });
    }
    if (node.target && !targets.has(node.target)) {
      targets.set(node.target, targetParent);
      nodes.push({ id: targetID, kind: 'target', label: node.target, parent: targetParent, repo: doc.repo, group, target: node.target });
      edges.push({ id: `contains:${targetParent}:${targetID}`, source: targetParent, target: targetID, kind: 'containment' });
    }
  }

  for (const node of doc.nodes ?? []) {
    const parent = node.parent?.endsWith(':root') ? `target:${node.target}` : node.parent;
    nodes.push({ ...node, parent });
    if (parent) edges.push({ id: `contains:${parent}:${node.id}`, source: parent, target: node.id, kind: 'containment' });
  }
  return { nodes, edges };
}

function aggregateActions(nodes: GraphNode[]): Map<string, Record<string, number>> {
  const byID = new Map(nodes.map(node => [node.id, node]));
  const counts = new Map<string, Record<string, number>>();
  for (const node of nodes) {
    if (!node.action) continue;
    let current: GraphNode | undefined = node;
    while (current) {
      const item = counts.get(current.id) ?? {};
      item[node.action] = (item[node.action] ?? 0) + 1;
      counts.set(current.id, item);
      current = current.parent ? byID.get(current.parent) : undefined;
    }
  }
  return counts;
}

function nodeRadius(node: GraphNode): number {
  if (node.kind === 'repository') return 13;
  if (node.kind === 'group') return 11;
  if (node.kind === 'target') return 9;
  if (node.kind === 'module') return 7;
  return node.action ? 7 : 4;
}

function layoutDagMode(layout: GraphLayout): 'lr' | 'td' | 'radialout' | undefined {
  if (layout === 'layered' || layout === 'mindmap') return 'lr';
  if (layout === 'tree') return 'td';
  if (layout === 'radial' || layout === 'balloon') return 'radialout';
  return undefined;
}

function useElementSize(ref: React.RefObject<HTMLDivElement>, compact: boolean) {
  const [size, setSize] = useState({ width: 900, height: compact ? 380 : 680 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setSize({
      width: Math.max(320, element.clientWidth),
      height: Math.max(compact ? 310 : 520, element.clientHeight),
    });
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [compact, ref]);
  return size;
}

export default function GraphView({ document: doc, compact = false, initialLayout = 'force', onOpenFullPage }: Props) {
  const graphRef = useRef<ForceGraphMethods<ForceNode, ForceLink>>();
  const canvasRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(canvasRef, compact);
  const tokens = useThemeTokens();
  const [layout, setLayout] = useState<GraphLayout>(initialLayout);
  const [shape, setShape] = useState<GraphNodeShape>(() => storedChoice(SHAPE_KEY, ['circle', 'card', 'rounded', 'diamond', 'hexagon'], 'circle'));
  const [colorMode, setColorMode] = useState<GraphColorMode>(() => storedChoice(COLOR_KEY, ['action', 'group'], 'action'));
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [hiddenKinds, setHiddenKinds] = useState<Set<GraphNode['kind']>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [actionFilter, setActionFilter] = useState<Set<GraphAction>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const [controls, setControls] = useState<GraphControls>(DEFAULT_CONTROLS);

  const graph = useMemo(() => synthesize(doc), [doc]);
  const counts = useMemo(() => aggregateActions(graph.nodes), [graph.nodes]);
  const groups = useMemo(() => [...new Set(graph.nodes.map(node => node.group).filter(Boolean) as string[])].sort(), [graph.nodes]);
  const groupColors = useMemo(() => new Map(groups.map((group, index) => [group, PALETTE[index % PALETTE.length]])), [groups]);
  const byID = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);

  // Whole-plan change counts for the impact summary bar.
  const impact = useMemo(() => {
    const tally: Record<GraphAction, number> = { create: 0, update: 0, delete: 0, replace: 0, '': 0 };
    for (const node of doc.nodes ?? []) tally[node.action || ''] = (tally[node.action || ''] ?? 0) + 1;
    return tally;
  }, [doc.nodes]);
  const effectiveAction = useCallback((node: GraphNode): GraphAction => node.action || dominantAction(counts.get(node.id)), [counts]);

  // Highlight root: an explicit selection wins, otherwise the hovered node.
  const root = selected ?? hovered;

  // Transitive downstream dependency closure — the blast radius of a change.
  const blast = useMemo(() => {
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    if (!root) return { nodeIds, edgeIds };
    const dependents = new Map<string, { to: string; id: string }[]>();
    for (const edge of graph.edges) {
      if (edge.kind !== 'dependency') continue;
      const list = dependents.get(edge.source) ?? [];
      list.push({ to: edge.target, id: edge.id });
      dependents.set(edge.source, list);
    }
    nodeIds.add(root);
    const queue = [root];
    while (queue.length) {
      const current = queue.shift() as string;
      for (const { to, id } of dependents.get(current) ?? []) {
        edgeIds.add(id);
        if (!nodeIds.has(to)) { nodeIds.add(to); queue.push(to); }
      }
    }
    return { nodeIds, edgeIds };
  }, [graph.edges, root]);

  // Visual highlight = the downstream blast closure plus every node/edge
  // directly touching the root (either direction, containment or dependency),
  // so clicking any node lights up everything it is connected to.
  const lit = useMemo(() => {
    const nodeIds = new Set(blast.nodeIds);
    const edgeIds = new Set(blast.edgeIds);
    if (root) {
      for (const edge of graph.edges) {
        if (edge.source !== root && edge.target !== root) continue;
        edgeIds.add(edge.id);
        nodeIds.add(edge.source);
        nodeIds.add(edge.target);
      }
    }
    return { nodeIds, edgeIds };
  }, [blast, graph.edges, root]);

  // Per-node blast weight: how many resources lie downstream over dependency
  // edges (transitive). Drives node size so high-impact nodes are visibly
  // larger. Memoized DFS over the dependency DAG (cycle-guarded just in case).
  const depWeight = useMemo(() => {
    const adj = new Map<string, string[]>();
    for (const edge of graph.edges) {
      if (edge.kind !== 'dependency') continue;
      const list = adj.get(edge.source) ?? [];
      list.push(edge.target);
      adj.set(edge.source, list);
    }
    const memo = new Map<string, Set<string>>();
    const visiting = new Set<string>();
    const reach = (id: string): Set<string> => {
      const cached = memo.get(id);
      if (cached) return cached;
      const out = new Set<string>();
      if (visiting.has(id)) return out;
      visiting.add(id);
      for (const next of adj.get(id) ?? []) {
        out.add(next);
        for (const r of reach(next)) out.add(r);
      }
      visiting.delete(id);
      memo.set(id, out);
      return out;
    };
    const weight = new Map<string, number>();
    for (const node of graph.nodes) weight.set(node.id, reach(node.id).size);
    return weight;
  }, [graph.nodes, graph.edges]);

  const visible = useMemo(() => {
    const byParent = new Map<string, GraphNode[]>();
    graph.nodes.forEach(node => {
      if (node.parent) byParent.set(node.parent, [...(byParent.get(node.parent) ?? []), node]);
    });
    const hidden = new Set<string>();
    const hideChildren = (id: string) => {
      for (const child of byParent.get(id) ?? []) {
        hidden.add(child.id);
        hideChildren(child.id);
      }
    };
    collapsed.forEach(hideChildren);
    const term = search.trim().toLowerCase();
    let nodes = graph.nodes.filter(node => {
      if (hidden.has(node.id) || hiddenKinds.has(node.kind) || (node.group && hiddenGroups.has(node.group))) return false;
      return !term || `${node.label} ${node.address ?? ''} ${node.kind}`.toLowerCase().includes(term);
    });
    if (controls.changedOnly) {
      const keep = new Set<string>();
      for (const node of nodes) {
        if (!effectiveAction(node)) continue;
        let current: GraphNode | undefined = node;
        while (current) { keep.add(current.id); current = current.parent ? byID.get(current.parent) : undefined; }
      }
      nodes = nodes.filter(node => keep.has(node.id));
    }
    if (actionFilter.size) {
      const keep = new Set<string>();
      for (const node of nodes) {
        if (!actionFilter.has(effectiveAction(node))) continue;
        let current: GraphNode | undefined = node;
        while (current) { keep.add(current.id); current = current.parent ? byID.get(current.parent) : undefined; }
      }
      nodes = nodes.filter(node => keep.has(node.id));
    }
    const ids = new Set(nodes.map(node => node.id));
    const links = graph.edges
      .filter(edge => ids.has(edge.source) && ids.has(edge.target) && (!controls.dependenciesOnly || edge.kind === 'dependency'))
      .map(edge => ({ ...edge, source: edge.source, target: edge.target }));
    return { nodes: nodes.map(node => ({ ...node } as ForceNode)), links };
  }, [actionFilter, byID, collapsed, controls.changedOnly, controls.dependenciesOnly, effectiveAction, graph, hiddenGroups, hiddenKinds, search]);

  const selectedNode = graph.nodes.find(node => node.id === selected);
  const hasChildren = useMemo(() => new Set(graph.nodes.flatMap(node => node.parent ? [node.parent] : [])), [graph.nodes]);
  const relatedCount = selected
    ? graph.edges.filter(edge => edge.source === selected || edge.target === selected).length
    : 0;

  const baseColorFor = useCallback((node: GraphNode) => {
    if (node.kind === 'repository') return '#a78bfa';
    return groupColors.get(node.group || '') ?? PALETTE[hash(node.target || node.kind) % PALETTE.length];
  }, [groupColors]);
  const colorFor = useCallback((node: GraphNode) => hierarchyColor(node.kind), []);

  // Resource size encodes blast radius: base by action, grown by downstream
  // dependent count (sqrt-compressed + capped) with a small nudge from the
  // number of changed attributes. Structural nodes keep their fixed sizes.
  const radiusFor = useCallback((node: GraphNode) => {
    if (node.kind !== 'managed' && node.kind !== 'data') return nodeRadius(node) * controls.nodeScale;
    const base = node.action ? 7 : 4;
    const reach = depWeight.get(node.id) ?? 0;
    const changes = node.changes?.length ?? 0;
    const bonus = Math.min(12, Math.sqrt(reach) * 1.8 + Math.min(3, changes * 0.3));
    return (base + bonus) * controls.nodeScale;
  }, [controls.nodeScale, depWeight]);

  const fit = useCallback(() => {
    window.setTimeout(() => {
      graphRef.current?.zoomToFit(450, compact ? 25 : 70);
      window.setTimeout(() => {
        const zoom = graphRef.current?.zoom() ?? 1;
        if (zoom > 1.25) graphRef.current?.zoom(1.25, 180);
      }, 470);
    }, 20);
  }, [compact]);

  useEffect(() => {
    const charge = graphRef.current?.d3Force('charge');
    if (charge) {
      // Moderate repulsion, and — crucially — cap its range so far-apart
      // clusters stop shoving each other to the canvas edges. Nodes still
      // spread within a cluster, but the whole graph stays compact and the
      // blast radius is readable without zooming.
      if ('strength' in charge) charge.strength(compact ? -34 : -controls.repelForce);
      if ('distanceMax' in charge) charge.distanceMax(compact ? 140 : 220);
    }
    const center = graphRef.current?.d3Force('center');
    if (center && 'strength' in center) center.strength(controls.centerForce);
    const links = graphRef.current?.d3Force('link');
    if (links && 'distance' in links) {
      // Short, strong containment links pull modules tight to their parent so
      // the four clusters sit close around the center instead of flying out.
      links.distance((link: ForceLink) => link.kind === 'containment' ? Math.max(16, controls.linkDistance * 0.42) : controls.linkDistance);
      if ('strength' in links) links.strength((link: ForceLink) => link.kind === 'containment' ? Math.min(1, controls.linkForce * 4.25) : controls.linkForce);
    }
    if (controls.animate) graphRef.current?.d3ReheatSimulation();
  }, [compact, controls.animate, controls.centerForce, controls.linkDistance, controls.linkForce, controls.repelForce, doc.revision, layout, visible.nodes.length]);

  useEffect(() => {
    fit();
  }, [doc.revision, fit, layout]);

  useEffect(() => {
    if (controls.animate) {
      graphRef.current?.resumeAnimation();
      graphRef.current?.d3ReheatSimulation();
    } else {
      graphRef.current?.pauseAnimation();
    }
  }, [controls.animate]);

  useEffect(() => {
    if (layout !== 'circular' || visible.nodes.length === 0) return;
    const radius = Math.max(180, visible.nodes.length * 7);
    visible.nodes.forEach((node, index) => {
      const angle = index / visible.nodes.length * Math.PI * 2;
      node.fx = Math.cos(angle) * radius;
      node.fy = Math.sin(angle) * radius;
    });
  }, [layout, visible.nodes]);

  function changeShape(next: GraphNodeShape) {
    setShape(next);
    try { localStorage.setItem(SHAPE_KEY, next); } catch { /* Storage is optional. */ }
  }

  function changeColorMode(next: GraphColorMode) {
    setColorMode(next);
    try { localStorage.setItem(COLOR_KEY, next); } catch { /* Storage is optional. */ }
  }

  function toggleAction(action: GraphAction) {
    setActionFilter(previous => {
      const next = new Set(previous);
      if (next.has(action)) next.delete(action); else next.add(action);
      return next;
    });
  }

  function toggleKind(kind: GraphNode['kind']) {
    setHiddenKinds(previous => {
      const next = new Set(previous);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return next;
    });
  }

  function toggleCollapse(id: string) {
    setCollapsed(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function setControl<K extends keyof GraphControls>(key: K, value: GraphControls[K]) {
    setControls(previous => ({ ...previous, [key]: value }));
  }

  function resetControls() {
    setControls(DEFAULT_CONTROLS);
    setHiddenGroups(new Set());
    setHiddenKinds(new Set());
    setSearch('');
    setActionFilter(new Set());
  }

  function exportPng() {
    const canvas = canvasRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = window.document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${doc.repo || 'graph'}-${doc.runId || 'export'}.png`;
    link.click();
  }

  const drawNode = useCallback((raw: NodeObject<ForceNode>, ctx: CanvasRenderingContext2D, scale: number) => {
    const node = raw as ForceNode;
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const radius = radiusFor(node);
    const action = effectiveAction(node);
    const actionCol = actionColor(tokens, action);
    const groupCol = colorFor(node);
    const fill = colorMode === 'action' ? actionCol : groupCol;
    const ring = colorMode === 'group' ? baseColorFor(node) : tokens.neutral;
    const dimmed = !!root && !lit.nodeIds.has(node.id);
    const active = root === node.id;
    const adjacent = !active && !!root && lit.nodeIds.has(node.id);
    const structural = node.kind === 'repository' || node.kind === 'group' || node.kind === 'target' || node.kind === 'module';
    const labelVisible = scale > controls.textThreshold
      || active
      || node.kind === 'repository'
      || node.kind === 'group'
      || node.kind === 'target';
    ctx.save();
    ctx.globalAlpha = dimmed ? 0.16 : 1;

    ctx.beginPath();
    if (shape === 'card' || shape === 'rounded') {
      const width = Math.max(34, node.label.length * 4.8 + 18);
      const height = 18;
      ctx.roundRect(x - width / 2, y - height / 2, width, height, shape === 'rounded' ? 9 : 3);
    } else if (shape === 'diamond') {
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y + radius);
      ctx.lineTo(x - radius, y);
      ctx.closePath();
    } else if (shape === 'hexagon') {
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 3 * i;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else {
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    if (!dimmed) {
      ctx.shadowColor = active ? tokens.highlight : fill;
      ctx.shadowBlur = active ? 14 : structural ? 8 : 5;
    }
    ctx.fillStyle = `${fill}cc`;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = active ? '#ffffff' : adjacent ? tokens.highlight : ring;
    ctx.lineWidth = active ? 3.2 : adjacent ? 2.4 : colorMode === 'group' ? 2.2 : structural ? 1.7 : action ? 1.8 : 1;
    ctx.stroke();

    if (node.action) {
      const mark = actionMark(node.action);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(6, Math.min(11, radius * 1.15))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mark, x, y + 0.3);
    }

    if (labelVisible) {
      const fontSize = Math.max(3.5, 11 / scale);
      ctx.font = `${node.kind === 'managed' || node.kind === 'data' ? 500 : 700} ${fontSize}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = tokens.text;
      ctx.shadowColor = tokens.canvas;
      ctx.shadowBlur = 3;
      ctx.fillText(node.label, x + radius + 4, y);
    }
    ctx.restore();
  }, [baseColorFor, controls.textThreshold, lit.nodeIds, colorFor, colorMode, effectiveAction, radiusFor, root, shape, tokens]);

  const paintPointerArea = useCallback((raw: NodeObject<ForceNode>, color: string, ctx: CanvasRenderingContext2D) => {
    const node = raw as ForceNode;
    const radius = Math.max(8, radiusFor(node) + 3);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2);
    ctx.fill();
  }, [radiusFor]);

  const linkLit = useCallback((link: LinkObject<ForceNode, ForceLink>) => root != null && lit.edgeIds.has((link as ForceLink).id), [lit.edgeIds, root]);

  return (
    <div className={`gv${compact ? ' gv-compact' : ''}`}>
      <div className="gv-toolbar">
        <div className="gv-toolbar-main">
          <div className="gv-search"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search in graph..." /></div>
          <select value={layout} onChange={event => setLayout(event.target.value as GraphLayout)} aria-label="Graph layout">
            <option value="force">Force clusters</option>
            <option value="layered">Layered</option>
            <option value="tree">Tree</option>
            <option value="balloon">Balloon</option>
            <option value="radial">Radial tree</option>
            <option value="circular">Circular</option>
            <option value="mindmap">Mind map</option>
          </select>
          <select value={shape} onChange={event => changeShape(event.target.value as GraphNodeShape)} aria-label="Node shape">
            <option value="circle">Circle</option><option value="card">Card</option>
            <option value="rounded">Rounded</option><option value="diamond">Diamond</option>
            <option value="hexagon">Hexagon</option>
          </select>
          <div className="gv-seg" role="group" aria-label="Color by">
            <button className={colorMode === 'action' ? 'on' : ''} onClick={() => changeColorMode('action')}>Action</button>
            <button className={colorMode === 'group' ? 'on' : ''} onClick={() => changeColorMode('group')}>Group</button>
          </div>
          <button onClick={() => graphRef.current?.zoom((graphRef.current.zoom() || 1) * 1.25, 180)}>+</button>
          <button onClick={() => graphRef.current?.zoom((graphRef.current.zoom() || 1) / 1.25, 180)}>−</button>
          <button onClick={fit}>Fit</button>
          <button onClick={() => { graphRef.current?.centerAt(0, 0, 300); graphRef.current?.zoom(1, 300); }}>Reset</button>
          <button onClick={exportPng}>Export</button>
          {!compact && <button className={listsOpen ? 'on' : ''} onClick={() => setListsOpen(open => !open)} aria-expanded={listsOpen}>Lists</button>}
          {!compact && <button className={settingsOpen ? 'on' : ''} onClick={() => setSettingsOpen(open => !open)} aria-expanded={settingsOpen}>Controls</button>}
          {onOpenFullPage && <button className="gv-open" onClick={onOpenFullPage}>Open full page</button>}
        </div>
        <div className="gv-filter-bar">
          <div className="gv-action-filters" aria-label="Terraform action filters">
            {[...SEVERITY, '' as GraphAction].map(action => (
              <button
                key={action || 'none'}
                className={`gv-filter-item${actionFilter.has(action) ? ' on' : ''}`}
                onClick={() => toggleAction(action)}
                title={`Filter to ${ACTION_LABEL[action]}`}
              >
                <i style={{ background: actionColor(tokens, action) }} />
                <b>{actionMark(action)}</b>{ACTION_LABEL[action]} <span>{impact[action]}</span>
              </button>
            ))}
          </div>
          {colorMode === 'group' && (
            <div className="gv-hierarchy-key" aria-label="Hierarchy filters">
              {HIERARCHY_KINDS.map(item => (
                <button
                  key={item.kind}
                  className={hiddenKinds.has(item.kind) ? 'off' : 'on'}
                  onClick={() => toggleKind(item.kind)}
                  aria-pressed={!hiddenKinds.has(item.kind)}
                  title={`${hiddenKinds.has(item.kind) ? 'Show' : 'Hide'} ${item.label.toLowerCase()} nodes`}
                >
                  <i style={{ background: hierarchyColor(item.kind) }} />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="gv-main">
        {!compact && (
          <aside className={`gv-groups${listsOpen ? ' open' : ''}`}>
            <h3>Groups</h3>
            {groups.map(group => (
              <label key={group}>
                <input
                  type="checkbox"
                  checked={!hiddenGroups.has(group)}
                  onChange={() => setHiddenGroups(previous => {
                    const next = new Set(previous);
                    if (next.has(group)) next.delete(group); else next.add(group);
                    return next;
                  })}
                />
                <i
                  className="gv-group-swatch"
                  style={{ background: groupColors.get(group) }}
                />
                <span>{group}</span>
              </label>
            ))}
            <h3>Hierarchy</h3>
            <div className="gv-node-list">
              {graph.nodes.filter(node => hasChildren.has(node.id)).map(node => (
                <button key={node.id} onClick={() => toggleCollapse(node.id)}>
                  <span>{collapsed.has(node.id) ? '+' : '−'}</span>{node.label}
                </button>
              ))}
            </div>
            <h3>Resources</h3>
            <div className="gv-resource-list">
              {visible.nodes.filter(node => node.kind === 'managed' || node.kind === 'data').slice(0, 80).map(node => (
                <button
                  key={node.id}
                  className={`gv-node-item kind-${node.kind}${selected === node.id ? ' selected' : lit.nodeIds.has(node.id) ? ' connected' : selected ? ' dimmed' : ''}`}
                  onClick={() => setSelected(node.id)}
                >
                  <i style={{ background: colorMode === 'action' ? actionColor(tokens, node.action) : colorFor(node) }} />{actionMark(node.action)} {node.label}
                </button>
              ))}
            </div>
          </aside>
        )}
        <div ref={canvasRef} className="gv-canvas">
          {visible.nodes.length === 0 ? (
            <div className="gv-empty">{doc.revision === 0 ? 'Waiting for the first target graph…' : 'No matching graph nodes.'}</div>
          ) : (
            <ForceGraph2D<ForceNode, ForceLink>
              ref={graphRef}
              width={size.width}
              height={size.height}
              graphData={visible}
              backgroundColor={tokens.canvas}
              dagMode={layoutDagMode(layout)}
              dagLevelDistance={layout === 'radial' ? 90 : 120}
              nodeCanvasObject={drawNode}
              nodePointerAreaPaint={paintPointerArea}
              nodeLabel={node => { const w = depWeight.get(node.id) ?? 0; return `${node.kind}: ${node.address || node.label}${w ? ` · ${w} downstream` : ''}`; }}
              onNodeClick={node => setSelected(node.id)}
              onNodeHover={node => setHovered(node ? node.id : null)}
              onBackgroundClick={() => setSelected(null)}
              linkColor={link => root
                ? (linkLit(link) ? tokens.highlight : tokens.linkMuted)
                : ((link as ForceLink).kind === 'dependency' ? tokens.linkDep : tokens.link)}
              linkWidth={link => (linkLit(link) ? 2.2 : (link as ForceLink).kind === 'dependency' ? 1.1 : 0.75) * controls.linkScale}
              linkDirectionalArrowLength={link => controls.arrows && (link as ForceLink).kind === 'dependency' ? 3.5 : 0}
              linkDirectionalArrowRelPos={0.88}
              linkDirectionalParticles={link => linkLit(link) ? 2 : 0}
              linkDirectionalParticleWidth={2}
              linkDirectionalParticleColor={() => tokens.highlight}
              cooldownTicks={layout === 'force' ? 180 : 80}
              warmupTicks={layout === 'force' ? 30 : 10}
              minZoom={0.08}
              maxZoom={8}
            />
          )}
          <div className="gv-count">{visible.nodes.length} nodes · {visible.links.length} relationships{root ? ` · ${lit.nodeIds.size} highlighted · ${blast.nodeIds.size} in blast radius` : ''}</div>
        </div>
        {!compact && settingsOpen && (
          <aside className="gv-controls" aria-label="Graph controls">
            <div className="gv-controls-head">
              <strong>Graph controls</strong>
              <div>
                <button onClick={resetControls} aria-label="Reset graph controls" title="Reset controls">↻</button>
                <button onClick={() => setSettingsOpen(false)} aria-label="Close graph controls">×</button>
              </div>
            </div>
            <section>
              <h3>Filters</h3>
              <div className="gv-control-search"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search nodes..." /></div>
              <label className="gv-switch-row"><span>Changed nodes only</span><input type="checkbox" checked={controls.changedOnly} onChange={event => setControl('changedOnly', event.target.checked)} /></label>
              <label className="gv-switch-row"><span>Dependencies only</span><input type="checkbox" checked={controls.dependenciesOnly} onChange={event => setControl('dependenciesOnly', event.target.checked)} /></label>
            </section>
            {groups.length > 0 && (
              <section>
                <h3>Groups</h3>
                <div className="gv-control-groups">
                  {groups.map(group => (
                    <label key={group}>
                      <input
                        type="checkbox"
                        checked={!hiddenGroups.has(group)}
                        onChange={() => setHiddenGroups(previous => {
                          const next = new Set(previous);
                          if (next.has(group)) next.delete(group); else next.add(group);
                          return next;
                        })}
                      />
                      <i
                        className="gv-group-swatch"
                        style={{ background: groupColors.get(group) }}
                      />
                      <span>{group}</span>
                    </label>
                  ))}
                </div>
              </section>
            )}
            <section>
              <h3>Display</h3>
              <label className="gv-switch-row"><span>Arrows</span><input type="checkbox" checked={controls.arrows} onChange={event => setControl('arrows', event.target.checked)} /></label>
              <label className="gv-range-row"><span>Text fade threshold</span><input aria-label="Text fade threshold" type="range" min="0.15" max="2" step="0.05" value={controls.textThreshold} onChange={event => setControl('textThreshold', Number(event.target.value))} /></label>
              <label className="gv-range-row"><span>Node size</span><input aria-label="Node size" type="range" min="0.6" max="2" step="0.05" value={controls.nodeScale} onChange={event => setControl('nodeScale', Number(event.target.value))} /></label>
              <label className="gv-range-row"><span>Link thickness</span><input aria-label="Link thickness" type="range" min="0.5" max="3" step="0.1" value={controls.linkScale} onChange={event => setControl('linkScale', Number(event.target.value))} /></label>
              <button className="gv-animate" onClick={() => setControl('animate', !controls.animate)}>{controls.animate ? 'Pause animation' : 'Animate'}</button>
            </section>
            <section>
              <h3>Forces</h3>
              <label className="gv-range-row"><span>Center force</span><input aria-label="Center force" type="range" min="0" max="1" step="0.05" value={controls.centerForce} onChange={event => setControl('centerForce', Number(event.target.value))} /></label>
              <label className="gv-range-row"><span>Repel force</span><input aria-label="Repel force" type="range" min="5" max="150" step="5" value={controls.repelForce} onChange={event => setControl('repelForce', Number(event.target.value))} /></label>
              <label className="gv-range-row"><span>Link force</span><input aria-label="Link force" type="range" min="0.05" max="1" step="0.05" value={controls.linkForce} onChange={event => setControl('linkForce', Number(event.target.value))} /></label>
              <label className="gv-range-row"><span>Link distance</span><input aria-label="Link distance" type="range" min="20" max="160" step="5" value={controls.linkDistance} onChange={event => setControl('linkDistance', Number(event.target.value))} /></label>
            </section>
          </aside>
        )}
        {!compact && selectedNode && (
          <aside className="gv-details">
            <button className="gv-details-close" onClick={() => setSelected(null)} aria-label="Close node details">×</button>
            <span className="gv-detail-type"><i style={{ background: colorMode === 'action' ? actionColor(tokens, effectiveAction(selectedNode)) : colorFor(selectedNode) }} />{selectedNode.kind}</span>
            <h3>{selectedNode.address || selectedNode.label}</h3>
            <dl><dt>Type</dt><dd>{selectedNode.kind}</dd><dt>Target</dt><dd>{selectedNode.target || '—'}</dd><dt>Group</dt><dd>{selectedNode.group || '—'}</dd><dt>Action</dt><dd>{ACTION_LABEL[selectedNode.action || '']}</dd><dt>Blast radius</dt><dd>{blast.nodeIds.size} resource{blast.nodeIds.size === 1 ? '' : 's'}</dd></dl>
            {selectedNode.command && <div className="gv-command"><span>Command</span><code>{selectedNode.command}</code></div>}
            {selectedNode.changes && selectedNode.changes.length > 0 && (
              <>
                <h4>What changed</h4>
                <div className="gv-changes">
                  {selectedNode.changes.map(change => (
                    <div className={`gv-change ${change.kind}`} key={`${change.path}:${change.kind}`}>
                      <span className="gv-change-kind">{change.kind}</span>
                      <code>{change.path}</code>
                      <span className="gv-change-flags">
                        {change.replacement && <i>replacement</i>}
                        {change.computed && <i>known after apply</i>}
                        {change.sensitive && <i>sensitive</i>}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="gv-safety-note">Values are intentionally omitted to avoid exposing plan secrets.</p>
              </>
            )}
            {selectedNode.result && (
              <>
                <h4>Terraform result</h4>
                <pre className="gv-result">{selectedNode.result}</pre>
                <p className="gv-result-note">This is the exact resource block emitted by Terraform for this command.</p>
              </>
            )}
            <h4>Relationships ({relatedCount})</h4>
            <ul>{graph.edges.filter(edge => edge.source === selectedNode.id || edge.target === selectedNode.id).slice(0, 12).map(edge => <li key={edge.id}>{edge.source === selectedNode.id ? 'Uses' : 'Used by'} {graph.nodes.find(node => node.id === (edge.source === selectedNode.id ? edge.target : edge.source))?.label}</li>)}</ul>
          </aside>
        )}
      </div>
    </div>
  );
}
