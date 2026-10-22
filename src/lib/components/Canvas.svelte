<script lang="ts">
	// The canvas: an SVG world under one translate/scale. Touch first: two fingers pinch and pan
	// anywhere; one finger does what the active tool says (move, pan, link, cut). Wires are made by
	// tapping an output and then an input — the same gesture with a mouse, a finger or a pencil.
	import type { CatalogPort, GraphDoc, GraphEdge, GraphNode, LiveState, Messages, Point, Tool } from '../types.js';
	import { connect, disconnect, edgeKey, unfilled, wiredInto } from '../graph.js';
	import {
		HEAD_H,
		PORT_R,
		ROW_H,
		clampZoom,
		dataIn,
		dataOut,
		execIn,
		execOut,
		fitBoxes,
		nodeHeight,
		nodeWidth,
		portY,
		wirePath,
		zoomAround,
		type Ports,
		type Viewport
	} from '../geometry.js';
	import { portColor } from '../colors.js';

	type Props = {
		graph: GraphDoc;
		portsOf: (n: GraphNode) => Ports;
		titleOf: (n: GraphNode) => string;
		colorOf: (n: GraphNode) => string;
		labelOfPort?: (n: GraphNode, p: CatalogPort) => string;
		selected: Set<number>;
		tool: Tool;
		live?: LiveState;
		readonly?: boolean;
		messages: Messages;
		onnotice?: (message: string) => void;
		/** A node was tapped (pressed and released without moving): show its settings. */
		ontapnode?: (id: number) => void;
	};

	let {
		graph = $bindable(),
		portsOf,
		titleOf,
		colorOf,
		labelOfPort = (_n, p) => p.name,
		selected = $bindable(),
		tool = $bindable(),
		live = {},
		readonly = false,
		messages,
		onnotice = () => {},
		ontapnode = () => {}
	}: Props = $props();

	let svg: SVGSVGElement | undefined = $state();
	let view = $state<Viewport>(graph.viewport ?? { x: 40, y: 40, zoom: 1 });

	// Gesture state. `pointers` tracks every finger so a second one turns any gesture into a pinch.
	let pointers = new Map<number, Point>();
	let pinch: { d: number; cx: number; cy: number; view: Viewport } | null = null;
	let pinching = false;
	let drag: { id: number; off: Point; carried: number[] } | null = null;
	let panning: { sx: number; sy: number; view: Viewport } | null = null;
	let viaDrag: { key: string; idx: number } | null = null;
	let marquee = $state<{ a: Point; b: Point } | null>(null);
	let pending = $state<{ node: number; port: string } | null>(null);
	let cursor = $state<Point>({ x: 0, y: 0 });
	let hoverEdge = $state<string | null>(null);
	// A press on a node that ends where it began, without a second finger, is a tap.
	let tap: { id: number; x: number; y: number } | null = null;

	const byId = $derived(new Map(graph.nodes.map((n) => [n.id, n])));
	const running = $derived(new Set(live.running ?? []));
	const failed = $derived(new Set(live.failed ?? []));
	const done = $derived(new Set(live.done ?? []));

	type Laid = { n: GraphNode; p: Ports; w: number; h: number; title: string; color: string; missing: CatalogPort[] };
	const laid = $derived(
		new Map(
			graph.nodes.map((n): [number, Laid] => {
				const p = portsOf(n);
				const title = titleOf(n);
				return [n.id, { n, p, w: nodeWidth(title), h: nodeHeight(p), title, color: colorOf(n), missing: unfilled(graph, n, p.inputs) }];
			})
		)
	);

	function world(e: { clientX: number; clientY: number }): Point {
		const r = svg!.getBoundingClientRect();
		return { x: (e.clientX - r.left - view.x) / view.zoom, y: (e.clientY - r.top - view.y) / view.zoom };
	}

	function persistView() {
		graph.viewport = { x: Math.round(view.x), y: Math.round(view.y), zoom: Math.round(view.zoom * 100) / 100 };
	}

	export function fit() {
		if (!svg) return;
		const r = svg.getBoundingClientRect();
		view = fitBoxes([...laid.values()].map((l) => ({ x: l.n.x, y: l.n.y, w: l.w, h: l.h })), r.width, r.height);
		persistView();
	}

	export function zoomBy(f: number) {
		if (!svg) return;
		const r = svg.getBoundingClientRect();
		view = zoomAround(view, f, r.width / 2, r.height / 2);
		persistView();
	}

	/** World point at the centre of the visible canvas: where a new node lands. */
	export function centre(): Point {
		if (!svg) return { x: 0, y: 0 };
		const r = svg.getBoundingClientRect();
		return { x: (r.width / 2 - view.x) / view.zoom - 90, y: (r.height / 2 - view.y) / view.zoom - 30 };
	}

	export function cancelWire() {
		pending = null;
	}

	$effect(() => {
		// First open of a flow with no saved viewport: frame everything.
		if (svg && !graph.viewport && graph.nodes.length) fit();
	});

	function wheel(node: SVGSVGElement) {
		const h = (e: WheelEvent) => {
			e.preventDefault();
			const r = node.getBoundingClientRect();
			if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 2) {
				// Pinch on a trackpad arrives as ctrl+wheel; a mouse wheel zooms too.
				const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
				view = zoomAround(view, f, e.clientX - r.left, e.clientY - r.top);
			} else {
				view = { ...view, x: view.x - e.deltaX, y: view.y - e.deltaY };
			}
			persistView();
		};
		node.addEventListener('wheel', h, { passive: false });
		return { destroy: () => node.removeEventListener('wheel', h) };
	}

	function selectNode(e: PointerEvent, id: number) {
		if (e.shiftKey) {
			const next = new Set(selected);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			selected = next;
		} else if (!selected.has(id)) {
			selected = new Set([id]);
		}
	}

	function nodeDown(e: PointerEvent, n: GraphNode) {
		e.stopPropagation();
		selectNode(e, n.id);
		tap = { id: n.id, x: e.clientX, y: e.clientY };
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size >= 2) return;
		if (tool === 'pan' || readonly) {
			panning = { sx: e.clientX, sy: e.clientY, view };
			svg?.setPointerCapture?.(e.pointerId);
			return;
		}
		if (tool !== 'move') return; // link/cut: the body is inert so port taps are precise
		svg?.setPointerCapture?.(e.pointerId);
		const w = world(e);
		const carried = selected.has(n.id) && selected.size > 1 ? [...selected].filter((id) => id !== n.id) : [];
		drag = { id: n.id, off: { x: w.x - n.x, y: w.y - n.y }, carried };
		e.preventDefault();
	}

	function canvasDown(e: PointerEvent) {
		if (pending) {
			pending = null;
			return;
		}
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size >= 2) {
			panning = null;
			marquee = null;
			return;
		}
		if (tool === 'move' && !readonly) {
			if (!e.shiftKey) selected = new Set();
			const w = world(e);
			marquee = { a: w, b: w };
		} else {
			selected = new Set();
			panning = { sx: e.clientX, sy: e.clientY, view };
		}
		svg?.setPointerCapture?.(e.pointerId);
		e.preventDefault();
	}

	let raf: number | null = null;
	let lastMove: PointerEvent | null = null;
	function canvasMove(e: PointerEvent) {
		if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		lastMove = e;
		if (raf !== null) return;
		raf = requestAnimationFrame(() => {
			raf = null;
			if (lastMove) move(lastMove);
		});
	}

	function move(e: PointerEvent) {
		if (pointers.size >= 2) {
			drag = null;
			panning = null;
			viaDrag = null;
			marquee = null;
			tap = null;
			const [a, b] = [...pointers.values()];
			const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
			const r = svg!.getBoundingClientRect();
			const cx = (a.x + b.x) / 2 - r.left;
			const cy = (a.y + b.y) / 2 - r.top;
			if (!pinch) pinch = { d, cx, cy, view };
			else {
				const zoom = clampZoom(pinch.view.zoom * (d / pinch.d));
				const wx = (pinch.cx - pinch.view.x) / pinch.view.zoom;
				const wy = (pinch.cy - pinch.view.y) / pinch.view.zoom;
				view = { x: cx - wx * zoom, y: cy - wy * zoom, zoom };
			}
			pinching = true;
			return;
		}
		if (pinching) return;
		if (pending) cursor = world(e);
		if (marquee) {
			marquee = { a: marquee.a, b: world(e) };
		} else if (viaDrag) {
			const vias = [...(graph.edge_vias?.[viaDrag.key] ?? [])];
			vias[viaDrag.idx] = world(e);
			graph.edge_vias = { ...(graph.edge_vias ?? {}), [viaDrag.key]: vias };
		} else if (panning) {
			view = { ...panning.view, x: panning.view.x + e.clientX - panning.sx, y: panning.view.y + e.clientY - panning.sy };
		} else if (drag) {
			const w = world(e);
			const n = byId.get(drag.id);
			if (!n) return;
			const nx = Math.round(w.x - drag.off.x);
			const ny = Math.round(w.y - drag.off.y);
			const dx = nx - n.x;
			const dy = ny - n.y;
			if (!dx && !dy) return;
			const moving = new Set([drag.id, ...drag.carried]);
			graph.nodes = graph.nodes.map((m) => (moving.has(m.id) ? { ...m, x: m.x + dx, y: m.y + dy } : m));
			// Bends of wires whose both ends move travel with the group.
			if (drag.carried.length && graph.edge_vias) {
				const vias = { ...graph.edge_vias };
				for (const ed of graph.edges) {
					const k = edgeKey(ed);
					if (moving.has(ed.from) && moving.has(ed.to) && vias[k]) vias[k] = vias[k].map((p) => ({ x: p.x + dx, y: p.y + dy }));
				}
				graph.edge_vias = vias;
			}
		}
	}

	function canvasUp(e: PointerEvent) {
		if (tap && !pinching && pointers.size <= 1 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 8) ontapnode(tap.id);
		tap = null;
		pointers.delete(e.pointerId);
		svg?.releasePointerCapture?.(e.pointerId);
		if (pointers.size < 2) pinch = null;
		if (pointers.size === 0) {
			if (pinching) persistView();
			pinching = false;
		}
		if (marquee) {
			const x0 = Math.min(marquee.a.x, marquee.b.x);
			const x1 = Math.max(marquee.a.x, marquee.b.x);
			const y0 = Math.min(marquee.a.y, marquee.b.y);
			const y1 = Math.max(marquee.a.y, marquee.b.y);
			const hit = [...laid.values()].filter((l) => l.n.x < x1 && l.n.x + l.w > x0 && l.n.y < y1 && l.n.y + l.h > y0).map((l) => l.n.id);
			selected = new Set([...(e.shiftKey ? selected : []), ...hit]);
			marquee = null;
		}
		if (panning) persistView();
		panning = null;
		drag = null;
		viaDrag = null;
	}

	function outTap(e: Event, n: GraphNode, port: string) {
		e.stopPropagation();
		if (readonly || tool === 'cut') return;
		pending = { node: n.id, port };
		const l = laid.get(n.id);
		cursor = { x: n.x + (l?.w ?? 0), y: n.y + (portY(l!.p, port, 'out') ?? 0) };
	}

	function inTap(e: Event, n: GraphNode, port: CatalogPort) {
		e.stopPropagation();
		if (readonly) return;
		const existing = graph.edges.filter((ed) => ed.to === n.id && ed.to_port === port.name);
		const addingFanIn = port.type === 'exec' && pending;
		if ((existing.length && !addingFanIn) || tool === 'cut') {
			// Tapping a wired input unwires it (the last wire for an exec input).
			if (existing.length) graph = disconnect(graph, existing[existing.length - 1]);
			pending = null;
			return;
		}
		if (!pending) {
			onnotice(messages.pickOutputFirst);
			return;
		}
		const from = byId.get(pending.node);
		const fromPort = from ? laid.get(from.id)?.p.outputs.find((p) => p.name === pending!.port) : undefined;
		const r = connect(graph, { from: pending.node, from_port: pending.port, to: n.id, to_port: port.name }, fromPort, port);
		if ('graph' in r) graph = r.graph;
		else if (r.error === 'incompatible') onnotice(messages.incompatible);
		pending = null;
	}

	function wireDown(e: PointerEvent, ed: GraphEdge, key: string) {
		e.stopPropagation();
		if (readonly) return;
		if (tool === 'cut' || e.altKey) {
			graph = disconnect(graph, ed);
			return;
		}
		if (tool !== 'move') return;
		const vias = graph.edge_vias?.[key] ?? [];
		const w = world(e);
		if (vias.length < 2) {
			const next = [...vias, w].sort((a, b) => a.x - b.x);
			graph.edge_vias = { ...(graph.edge_vias ?? {}), [key]: next };
			viaDrag = { key, idx: next.indexOf(w) };
		} else {
			const near = vias.reduce((bi, v, i) => (Math.hypot(v.x - w.x, v.y - w.y) < Math.hypot(vias[bi].x - w.x, vias[bi].y - w.y) ? i : bi), 0);
			viaDrag = { key, idx: near };
		}
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		svg?.setPointerCapture?.(e.pointerId);
	}

	function viaDown(e: PointerEvent, key: string, idx: number) {
		e.stopPropagation();
		if (readonly) return;
		if (e.altKey || tool === 'cut') {
			const vias = (graph.edge_vias?.[key] ?? []).filter((_, i) => i !== idx);
			const all = { ...(graph.edge_vias ?? {}) };
			if (vias.length) all[key] = vias;
			else delete all[key];
			graph.edge_vias = all;
			return;
		}
		viaDrag = { key, idx };
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		svg?.setPointerCapture?.(e.pointerId);
	}

	function edgeEnds(ed: GraphEdge): { a: Point; b: Point; color: string; colorTo: string } | null {
		const f = laid.get(ed.from);
		const t = laid.get(ed.to);
		if (!f || !t) return null;
		const fy = portY(f.p, ed.from_port, 'out');
		const ty = portY(t.p, ed.to_port, 'in');
		if (fy === undefined || ty === undefined) return null;
		const fp = f.p.outputs.find((p) => p.name === ed.from_port);
		const tp = t.p.inputs.find((p) => p.name === ed.to_port);
		return {
			a: { x: f.n.x + f.w, y: f.n.y + fy },
			b: { x: t.n.x, y: t.n.y + ty },
			color: portColor(fp?.type ?? 'any'),
			colorTo: portColor(tp?.type ?? 'any')
		};
	}

	// A finger needs a bigger target than the 12px dot it sees (28px across: rows are 24px apart).
	const HIT_R = 14;

	const cursorClass = $derived(panning ? 'grabbing' : tool === 'link' || tool === 'cut' ? 'crosshair' : 'grab');
</script>

<svg
	bind:this={svg}
	use:wheel
	class="geui-canvas {cursorClass}"
	style="background-position: {view.x}px {view.y}px; background-size: {20 * view.zoom}px {20 * view.zoom}px;"
	onpointerdown={canvasDown}
	onpointermove={canvasMove}
	onpointerup={canvasUp}
	onpointercancel={canvasUp}
	role="application"
	aria-label="canvas"
>
	<defs>
		<filter id="geui-shadow" x="-30%" y="-30%" width="160%" height="160%">
			<feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.12)" />
		</filter>
	</defs>
	<g transform="translate({view.x} {view.y}) scale({view.zoom})">
		{#if marquee}
			<rect
				class="geui-marquee"
				x={Math.min(marquee.a.x, marquee.b.x)}
				y={Math.min(marquee.a.y, marquee.b.y)}
				width={Math.abs(marquee.b.x - marquee.a.x)}
				height={Math.abs(marquee.b.y - marquee.a.y)}
				stroke-width={1 / view.zoom}
				stroke-dasharray="{4 / view.zoom} {3 / view.zoom}"
			/>
		{/if}

		{#each graph.edges as ed (edgeKey(ed))}
			{@const ends = edgeEnds(ed)}
			{#if ends}
				{@const key = edgeKey(ed)}
				{@const vias = graph.edge_vias?.[key] ?? []}
				{@const d = wirePath(ends.a, ends.b, vias)}
				{@const hot = running.has(ed.from) || (done.has(ed.from) && running.has(ed.to))}
				{@const gid = `geui-w-${key.replace(/[^a-z0-9]/gi, '_')}`}
				<g role="presentation" onpointerenter={() => (hoverEdge = key)} onpointerleave={() => (hoverEdge = hoverEdge === key ? null : hoverEdge)}>
					<linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={ends.a.x} y1={ends.a.y} x2={ends.b.x} y2={ends.b.y}>
						<stop offset="0" style="stop-color: {ends.color}" />
						<stop offset="1" style="stop-color: {ends.colorTo}" />
					</linearGradient>
					<path {d} class="geui-wire-hit" stroke-width={tool === 'cut' ? 28 : 18} onpointerdown={(e) => wireDown(e, ed, key)} role="presentation" />
					<path
						{d}
						class="geui-wire"
						class:cut={tool === 'cut' || hoverEdge === key}
						class:hot
						stroke="url(#{gid})"
						stroke-width={hot ? 3 : 2}
						stroke-dasharray={tool === 'cut' ? '6 4' : undefined}
					/>
					{#if hot}
						<circle r={3.5 / view.zoom} fill={ends.color} class="geui-inert">
							<animateMotion dur="1.1s" repeatCount="indefinite" path={d} />
						</circle>
					{/if}
					{#each vias as v, i (i)}
						<circle cx={v.x} cy={v.y} r="5" fill={ends.color} class="geui-via" onpointerdown={(e) => viaDown(e, key, i)} role="presentation" />
					{/each}
				</g>
			{/if}
		{/each}

		{#if pending}
			{@const from = laid.get(pending.node)}
			{@const fy = from ? portY(from.p, pending.port, 'out') : undefined}
			{#if from && fy !== undefined}
				{@const fp = from.p.outputs.find((p) => p.name === pending?.port)}
				<path d={wirePath({ x: from.n.x + from.w, y: from.n.y + fy }, cursor)} class="geui-wire pending" stroke={portColor(fp?.type ?? 'any')} stroke-width="2" />
			{/if}
		{/if}

		{#each [...laid.values()] as l (l.n.id)}
			{@const n = l.n}
			{@const sel = selected.has(n.id)}
			{@const run = running.has(n.id)}
			{@const bad = failed.has(n.id)}
			<g transform="translate({n.x} {n.y})" filter="url(#geui-shadow)" class="geui-node" class:sel class:run class:bad>
				<rect width={l.w} height={l.h} rx="9" class="geui-body" onpointerdown={(e) => nodeDown(e, n)} role="presentation" />
				<path d="M0 9 a9 9 0 0 1 9 -9 h{l.w - 18} a9 9 0 0 1 9 9 v{HEAD_H - 9} h-{l.w} z" fill={l.color} fill-opacity="0.18" class="geui-inert" />
				<line x1="0" y1={HEAD_H} x2={l.w} y2={HEAD_H} stroke={l.color} stroke-opacity="0.55" stroke-width="1.5" class="geui-inert" />
				<circle cx="14" cy={HEAD_H / 2} r="4.5" fill={l.color} class="geui-inert" />
				<text x="26" y={HEAD_H / 2 + 4} class="geui-title geui-inert">{l.title}</text>
				{#if run}
					<rect width={l.w} height={l.h} rx="9" class="geui-running geui-inert" />
				{/if}
				{#if l.missing.length}
					<circle cx={l.w - 10} cy="10" r="3.5" class="geui-missing">
						<title>{messages.required}: {l.missing.map((p) => labelOfPort(n, p)).join(', ')}</title>
					</circle>
				{/if}

				{#each execIn(l.p) as p (p.name)}
					{@const wired = !!wiredInto(graph, n.id, p.name)}
					<circle cx="0" cy={HEAD_H / 2} r={HIT_R} class="geui-hit" onpointerdown={(e) => inTap(e, n, p)} role="presentation" />
					<circle cx="0" cy={HEAD_H / 2} r={PORT_R} class="geui-port exec geui-inert" class:filled={wired} />
				{/each}
				{#each execOut(l.p) as p, i (p.name)}
					{@const multi = execOut(l.p).length > 1}
					{@const y = multi ? HEAD_H + i * ROW_H + ROW_H / 2 : HEAD_H / 2}
					{@const isP = pending?.node === n.id && pending?.port === p.name}
					<circle cx={l.w} cy={y} r={HIT_R} class="geui-hit" onpointerdown={(e) => outTap(e, n, p.name)} role="presentation"><title>{labelOfPort(n, p)}</title></circle>
					<circle cx={l.w} cy={y} r={isP ? PORT_R + 1 : PORT_R} class="geui-port exec geui-inert" class:filled={isP} />
					{#if multi}
						<text x={l.w - 12} y={y + 4} text-anchor="end" class="geui-port-label geui-inert">{labelOfPort(n, p)}</text>
					{/if}
				{/each}
				{#each dataIn(l.p) as p, i (p.name)}
					{@const y = HEAD_H + i * ROW_H + ROW_H / 2}
					{@const wired = !!wiredInto(graph, n.id, p.name)}
					{@const missing = l.missing.some((m) => m.name === p.name)}
					{@const literal = !wired && n.config[p.name] !== undefined && n.config[p.name] !== ''}
					<circle cx="0" cy={y} r={HIT_R} class="geui-hit" onpointerdown={(e) => inTap(e, n, p)} role="presentation"><title>{labelOfPort(n, p)} · {p.type}</title></circle>
					<circle
						cx="0"
						cy={y}
						r={PORT_R}
						class="geui-port geui-inert"
						style="fill: {wired ? portColor(p.type) : 'var(--geui-port-empty, var(--background, #fff))'}; stroke: {missing ? 'var(--destructive, #e11d48)' : portColor(p.type)}"
					/>
					{#if literal}
						<circle cx="0" cy={y} r={PORT_R * 0.45} fill={portColor(p.type)} class="geui-inert" />
					{/if}
					<text x="12" y={y + 4} class="geui-port-label geui-inert" class:missing>{labelOfPort(n, p)}{p.required ? '*' : ''}</text>
				{/each}
				{#each dataOut(l.p) as p, i (p.name)}
					{@const offset = execOut(l.p).length > 1 ? execOut(l.p).length : 0}
					{@const y = HEAD_H + (i + offset) * ROW_H + ROW_H / 2}
					{@const isP = pending?.node === n.id && pending?.port === p.name}
					<circle cx={l.w} cy={y} r={HIT_R} class="geui-hit" onpointerdown={(e) => outTap(e, n, p.name)} role="presentation"><title>{labelOfPort(n, p)} · {p.type}</title></circle>
					<circle
						cx={l.w}
						cy={y}
						r={isP ? PORT_R + 1 : PORT_R}
						class="geui-port geui-inert"
						style="fill: {isP ? portColor(p.type) : 'var(--geui-port-empty, var(--background, #fff))'}; stroke: {portColor(p.type)}"
					/>
					<text x={l.w - 12} y={y + 4} text-anchor="end" class="geui-port-label geui-inert">{labelOfPort(n, p)}</text>
				{/each}
			</g>
		{/each}
	</g>
</svg>

<style>
	.geui-canvas {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
		user-select: none;
		background-color: var(--geui-canvas, var(--muted, #f4f4f5));
		background-image: radial-gradient(circle at center, var(--geui-grid, rgba(0, 0, 0, 0.12)) 1px, transparent 0);
	}
	.grab {
		cursor: grab;
	}
	.grabbing {
		cursor: grabbing;
	}
	.crosshair {
		cursor: crosshair;
	}
	.geui-inert {
		pointer-events: none;
	}
	.geui-marquee {
		fill: color-mix(in oklab, var(--primary, #d6336c) 10%, transparent);
		stroke: var(--primary, #d6336c);
		pointer-events: none;
	}
	.geui-wire {
		fill: none;
		stroke-linecap: round;
		stroke-opacity: 0.75;
		pointer-events: none;
		transition: stroke-opacity 0.15s;
	}
	.geui-wire.hot {
		stroke-opacity: 1;
	}
	.geui-wire.cut {
		stroke: var(--destructive, #e11d48);
	}
	.geui-wire.pending {
		stroke-dasharray: 5 4;
	}
	.geui-wire-hit {
		fill: none;
		stroke: transparent;
		cursor: crosshair;
	}
	.geui-via {
		stroke: var(--background, #fff);
		stroke-width: 1.5;
		cursor: grab;
	}
	.geui-body {
		fill: var(--card, #fff);
		stroke: var(--border, #e4e4e7);
		stroke-width: 1;
		cursor: move;
	}
	.geui-node.sel .geui-body {
		stroke: var(--primary, #d6336c);
		stroke-width: 2;
	}
	.geui-node.bad .geui-body {
		stroke: var(--destructive, #e11d48);
		stroke-width: 2;
	}
	.geui-running {
		fill: none;
		stroke: var(--primary, #d6336c);
		stroke-width: 3;
		stroke-dasharray: 8 6;
		animation: geui-march 0.6s linear infinite;
	}
	@keyframes geui-march {
		to {
			stroke-dashoffset: -14;
		}
	}
	.geui-title {
		font: 600 12px var(--geui-font, inherit);
		fill: var(--foreground, #18181b);
	}
	.geui-port {
		stroke-width: 2;
	}
	.geui-hit {
		fill: transparent;
		cursor: pointer;
	}
	.geui-port.exec {
		fill: var(--geui-port-empty, var(--background, #fff));
		stroke: var(--geui-exec, #a1a1aa);
	}
	.geui-port.exec.filled {
		fill: var(--geui-exec, #a1a1aa);
	}
	.geui-port-label {
		font: 10.5px var(--geui-font, inherit);
		fill: var(--muted-foreground, #71717a);
	}
	.geui-port-label.missing {
		fill: var(--destructive, #e11d48);
	}
	.geui-missing {
		fill: var(--destructive, #e11d48);
	}
</style>
