import { describe, expect, it } from 'vitest';
import { addNode, compatible, connect, disconnect, duplicateNodes, edgeKey, removeNodes, unfilled } from './graph.js';
import { fitBoxes, fitWidth, nodeHeight, portY, wirePath, zoomAround, HEAD_H, NODE_W, NODE_W_FIT_MAX, ROW_H } from './geometry.js';
import type { CatalogKind, GraphDoc } from './types.js';

const kind = (slug: string, inputs: [string, string, boolean?][], outputs: [string, string][]): CatalogKind => ({
	slug,
	label: slug,
	category: 'Test',
	inputs: inputs.map(([name, type, required]) => ({ name, type, required: !!required })),
	outputs: outputs.map(([name, type]) => ({ name, type, required: false })),
	default_config: { x: 1 }
});

const reply = kind('reply', [['exec_in', 'exec'], ['message', 'text', true]], []);
const trigger = kind('on_command', [], [['exec_out', 'exec'], ['message', 'text'], ['total', 'num']]);
const empty: GraphDoc = { nodes: [], edges: [] };

describe('graph operations', () => {
	it('duplicates a selection with the wires inside it, not the ones leaving it', () => {
		let g = addNode(addNode(addNode(empty, trigger, { x: 0, y: 0 }).graph, reply, { x: 300, y: 0 }).graph, reply, { x: 600, y: 0 }).graph;
		g = { ...g, edges: [{ from: 1, from_port: 'exec_out', to: 2, to_port: 'exec_in' }, { from: 2, from_port: 'exec_out', to: 3, to_port: 'exec_in' }] };
		const d = duplicateNodes(g, new Set([1, 2]));
		expect(d.ids).toEqual([4, 5]);
		expect(d.graph.nodes.slice(3).map((n) => [n.kind, n.x, n.y])).toEqual([['on_command', 48, 48], ['reply', 348, 48]]);
		expect(d.graph.edges.slice(2)).toEqual([{ from: 4, from_port: 'exec_out', to: 5, to_port: 'exec_in' }]);
		expect(d.graph.next_id).toBe(6);
	});

	it('adds nodes with fresh ids and their default config', () => {
		const a = addNode(empty, trigger, { x: 10.4, y: 20 });
		const b = addNode(a.graph, reply, { x: 300, y: 20 });
		expect([a.id, b.id]).toEqual([1, 2]);
		expect(b.graph.nodes[1].config).toEqual({ x: 1 });
		expect(b.graph.next_id).toBe(3);
	});

	it('keeps data inputs single-fed and checks types', () => {
		let g = addNode(addNode(addNode(empty, trigger, { x: 0, y: 0 }).graph, trigger, { x: 0, y: 200 }).graph, reply, { x: 300, y: 0 }).graph;
		const text = { name: 'message', type: 'text', required: false };
		const num = { name: 'total', type: 'num', required: false };
		const target = { name: 'message', type: 'text', required: true };
		const r1 = connect(g, { from: 1, from_port: 'message', to: 3, to_port: 'message' }, text, target);
		if (!('graph' in r1)) throw new Error('should connect');
		const r2 = connect(r1.graph, { from: 2, from_port: 'message', to: 3, to_port: 'message' }, text, target);
		if (!('graph' in r2)) throw new Error('should connect');
		expect(r2.graph.edges).toHaveLength(1);
		expect(r2.graph.edges[0].from).toBe(2);
		expect(connect(g, { from: 1, from_port: 'total', to: 3, to_port: 'message' }, num, target)).toEqual({ error: 'incompatible' });
		g = disconnect(r2.graph, r2.graph.edges[0]);
		expect(g.edges).toHaveLength(0);
	});

	it('lets exec inputs take several wires', () => {
		const g = addNode(addNode(addNode(empty, trigger, { x: 0, y: 0 }).graph, trigger, { x: 0, y: 200 }).graph, reply, { x: 300, y: 0 }).graph;
		const ex = { name: 'exec_out', type: 'exec', required: false };
		const exIn = { name: 'exec_in', type: 'exec', required: false };
		const a = connect(g, { from: 1, from_port: 'exec_out', to: 3, to_port: 'exec_in' }, ex, exIn);
		if (!('graph' in a)) throw new Error();
		const b = connect(a.graph, { from: 2, from_port: 'exec_out', to: 3, to_port: 'exec_in' }, ex, exIn);
		if (!('graph' in b)) throw new Error();
		expect(b.graph.edges).toHaveLength(2);
		expect(compatible(ex, { name: 'm', type: 'text', required: false })).toBe(false);
	});

	it('removing a node removes its wires and their bends', () => {
		const e = { from: 1, from_port: 'message', to: 2, to_port: 'message' };
		const g: GraphDoc = { nodes: [{ id: 1, kind: 'a', x: 0, y: 0, config: {} }, { id: 2, kind: 'b', x: 0, y: 0, config: {} }], edges: [e], edge_vias: { [edgeKey(e)]: [{ x: 1, y: 1 }] } };
		const out = removeNodes(g, new Set([2]));
		expect(out.edges).toHaveLength(0);
		expect(out.edge_vias).toEqual({});
	});

	it('finds required inputs nobody filled', () => {
		const n = { id: 3, kind: 'reply', x: 0, y: 0, config: { message: '' } };
		expect(unfilled({ nodes: [n], edges: [] }, n, reply.inputs).map((p) => p.name)).toEqual(['message']);
		expect(unfilled({ nodes: [n], edges: [] }, { ...n, config: { message: 'ok' } }, reply.inputs)).toHaveLength(0);
	});
});

describe('geometry', () => {
	const ports = { inputs: reply.inputs, outputs: [] };
	it('places exec pins on the header and data ports in rows', () => {
		expect(portY(ports, 'exec_in', 'in')).toBe(HEAD_H / 2);
		expect(portY(ports, 'message', 'in')).toBe(HEAD_H + ROW_H / 2);
		expect(portY(ports, 'nope', 'in')).toBeUndefined();
		expect(nodeHeight(ports)).toBeGreaterThan(HEAD_H);
	});

	it('puts several exec arms in the body, before data outputs', () => {
		const p = { inputs: [], outputs: [{ name: 'true', type: 'exec', required: false }, { name: 'false', type: 'exec', required: false }, { name: 'v', type: 'num', required: false }] };
		expect(portY(p, 'true', 'out')).toBe(HEAD_H + ROW_H / 2);
		expect(portY(p, 'v', 'out')).toBe(HEAD_H + 2 * ROW_H + ROW_H / 2);
	});

	it('zooms around a point and fits boxes', () => {
		const v = zoomAround({ x: 0, y: 0, zoom: 1 }, 2, 100, 100);
		expect(v).toEqual({ x: -100, y: -100, zoom: 2 });
		const f = fitBoxes([{ x: 0, y: 0, w: 100, h: 100 }], 400, 400);
		expect(f.zoom).toBeLessThanOrEqual(1.5);
		expect(wirePath({ x: 0, y: 0 }, { x: 100, y: 0 })).toMatch(/^M 0 0 C/);
	});
});

describe('node width', () => {
	it('fits the title, or both columns of port names side by side, within bounds', () => {
		expect(fitWidth(40, 30, 30)).toBe(NODE_W);
		expect(fitWidth(250, 0, 0)).toBe(32 + 250 + 14);
		expect(fitWidth(60, 120, 110)).toBe(12 + 120 + 24 + 110 + 12);
		expect(fitWidth(900, 0, 0)).toBe(NODE_W_FIT_MAX);
	});
});
