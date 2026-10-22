// Editing operations on the graph document, as pure functions returning the next document. The
// rules are the engine's: a data input has one wire; an exec input may have many; types must fit.

import type { CatalogKind, CatalogPort, GraphDoc, GraphEdge, GraphNode, Point } from './types.js';

export const edgeKey = (e: GraphEdge) => `${e.from}:${e.from_port}->${e.to}:${e.to_port}`;

export function nextId(g: GraphDoc): number {
	const max = g.nodes.reduce((m, n) => Math.max(m, n.id), 0);
	return Math.max(g.next_id ?? 1, max + 1);
}

export function addNode(g: GraphDoc, kind: CatalogKind, at: Point): { graph: GraphDoc; id: number } {
	const id = nextId(g);
	const node: GraphNode = {
		id,
		kind: kind.slug,
		x: Math.round(at.x),
		y: Math.round(at.y),
		// A JSON copy, not structuredClone: the catalogue may be a reactive proxy (Svelte $state),
		// which structuredClone refuses — and a refused clone is a tap that silently does nothing.
		config: JSON.parse(JSON.stringify(kind.default_config ?? {}))
	};
	return { graph: { ...g, nodes: [...g.nodes, node], next_id: id + 1 }, id };
}

export function removeNodes(g: GraphDoc, ids: Set<number>): GraphDoc {
	const vias = { ...(g.edge_vias ?? {}) };
	const edges = g.edges.filter((e) => {
		const keep = !ids.has(e.from) && !ids.has(e.to);
		if (!keep) delete vias[edgeKey(e)];
		return keep;
	});
	return { ...g, nodes: g.nodes.filter((n) => !ids.has(n.id)), edges, edge_vias: vias };
}

/** May a wire go from `from` to `to`? Same type, the wildcard, or a family the input accepts. */
export function compatible(from: CatalogPort | undefined, to: CatalogPort | undefined): boolean {
	if (!from || !to) return true;
	if ((from.type === 'exec') !== (to.type === 'exec')) return false;
	if (from.type === to.type || from.type === 'any' || to.type === 'any') return true;
	return !!to.accepts_family && from.family === to.type;
}

export type Connect = { graph: GraphDoc } | { error: 'incompatible' | 'self' };

export function connect(g: GraphDoc, edge: GraphEdge, fromPort: CatalogPort | undefined, toPort: CatalogPort | undefined): Connect {
	if (edge.from === edge.to) return { error: 'self' };
	if (!compatible(fromPort, toPort)) return { error: 'incompatible' };
	const isExecIn = toPort?.type === 'exec';
	// A data input is fed by one wire: the new one replaces the old. Exec inputs accept many.
	const edges = g.edges.filter(
		(e) => !(e.to === edge.to && e.to_port === edge.to_port && (!isExecIn || (e.from === edge.from && e.from_port === edge.from_port)))
	);
	return { graph: { ...g, edges: [...edges, edge] } };
}

export function disconnect(g: GraphDoc, edge: GraphEdge): GraphDoc {
	const k = edgeKey(edge);
	const vias = { ...(g.edge_vias ?? {}) };
	delete vias[k];
	return { ...g, edges: g.edges.filter((e) => edgeKey(e) !== k), edge_vias: vias };
}

/** Required inputs with neither a wire nor a value in the node's configuration. */
export function unfilled(g: GraphDoc, n: GraphNode, inputs: CatalogPort[]): CatalogPort[] {
	return inputs.filter((p) => {
		if (!p.required || p.type === 'exec') return false;
		if (g.edges.some((e) => e.to === n.id && e.to_port === p.name)) return false;
		const v = n.config[p.name];
		return v === undefined || v === null || v === '';
	});
}

export function wiredInto(g: GraphDoc, node: number, port: string): GraphEdge | undefined {
	return g.edges.find((e) => e.to === node && e.to_port === port);
}
