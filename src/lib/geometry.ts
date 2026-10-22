// Where things are on the canvas. Pure functions over a node and its ports, so the canvas, the
// hit tests and the wires all agree, and they can be tested without a browser.

import type { CatalogPort, GraphNode, Point } from './types.js';

export const NODE_W = 184;
export const NODE_W_MAX = 320;
export const HEAD_H = 28;
export const ROW_H = 24;
export const PAD = 8;
export const PORT_R = 6;

export type Ports = { inputs: CatalogPort[]; outputs: CatalogPort[] };

export const isExec = (p: CatalogPort) => p.type === 'exec';
export const dataIn = (p: Ports) => p.inputs.filter((x) => !isExec(x));
export const dataOut = (p: Ports) => p.outputs.filter((x) => !isExec(x));
export const execIn = (p: Ports) => p.inputs.filter(isExec);
export const execOut = (p: Ports) => p.outputs.filter(isExec);

/** A node grows with its title so long labels are not clipped. */
export function nodeWidth(title: string): number {
	return Math.min(NODE_W_MAX, Math.max(NODE_W, 48 + Math.ceil(title.length * 6.8)));
}

/** Rows below the header: data inputs on the left; on the right, exec arms (when there are
 *  several, they live in the body) followed by data outputs. */
export function bodyRows(p: Ports): number {
	const outs = dataOut(p).length + (execOut(p).length > 1 ? execOut(p).length : 0);
	return Math.max(dataIn(p).length, outs, 1);
}

export function nodeHeight(p: Ports): number {
	return HEAD_H + bodyRows(p) * ROW_H + PAD;
}

const rowY = (i: number) => HEAD_H + i * ROW_H + ROW_H / 2;

/** Local y of a port inside its node; `undefined` when the node has no such port. */
export function portY(p: Ports, name: string, side: 'in' | 'out'): number | undefined {
	if (side === 'in') {
		if (execIn(p).some((x) => x.name === name)) return HEAD_H / 2;
		const i = dataIn(p).findIndex((x) => x.name === name);
		return i < 0 ? undefined : rowY(i);
	}
	const arms = execOut(p);
	const a = arms.findIndex((x) => x.name === name);
	if (a >= 0) return arms.length > 1 ? rowY(a) : HEAD_H / 2;
	const i = dataOut(p).findIndex((x) => x.name === name);
	if (i < 0) return undefined;
	return rowY(i + (arms.length > 1 ? arms.length : 0));
}

/** A wire from (x1,y1) to (x2,y2), through up to two bend points, as an SVG path. */
export function wirePath(a: Point, b: Point, vias: Point[] = []): string {
	if (vias.length === 0) {
		const k = Math.max(40, Math.min(120, Math.abs(b.x - a.x) / 2));
		return `M ${a.x} ${a.y} C ${a.x + k} ${a.y}, ${b.x - k} ${b.y}, ${b.x} ${b.y}`;
	}
	const pts = [a, ...vias, b];
	let d = `M ${pts[0].x} ${pts[0].y}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const p = pts[i];
		const q = pts[i + 1];
		const c1x = i === 0 ? p.x + 60 : p.x + (q.x - p.x) * 0.35;
		const c1y = i === 0 ? p.y : p.y + (q.y - p.y) * 0.1;
		const c2x = i === pts.length - 2 ? q.x - 60 : q.x - (q.x - p.x) * 0.35;
		const c2y = i === pts.length - 2 ? q.y : q.y - (q.y - p.y) * 0.1;
		d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${q.x} ${q.y}`;
	}
	return d;
}

export type Viewport = { x: number; y: number; zoom: number };

export const clampZoom = (z: number) => Math.min(2.5, Math.max(0.3, z));

/** The viewport after zooming by `factor` around the screen point (cx, cy), keeping the world
 *  point under it still. */
export function zoomAround(v: Viewport, factor: number, cx: number, cy: number): Viewport {
	const zoom = clampZoom(v.zoom * factor);
	return { x: cx - ((cx - v.x) / v.zoom) * zoom, y: cy - ((cy - v.y) / v.zoom) * zoom, zoom };
}

/** The viewport that shows every box, with a margin, at no more than 1.5×. */
export function fitBoxes(boxes: { x: number; y: number; w: number; h: number }[], width: number, height: number): Viewport {
	if (boxes.length === 0 || width <= 0 || height <= 0) return { x: 40, y: 40, zoom: 1 };
	const minX = Math.min(...boxes.map((b) => b.x)) - 60;
	const minY = Math.min(...boxes.map((b) => b.y)) - 60;
	const maxX = Math.max(...boxes.map((b) => b.x + b.w)) + 60;
	const maxY = Math.max(...boxes.map((b) => b.y + b.h)) + 60;
	const zoom = clampZoom(Math.min(width / (maxX - minX), height / (maxY - minY), 1.5));
	return { x: (width - (maxX - minX) * zoom) / 2 - minX * zoom, y: (height - (maxY - minY) * zoom) / 2 - minY * zoom, zoom };
}

export function nodeBox(n: GraphNode, w: number, h: number) {
	return { x: n.x, y: n.y, w, h };
}
