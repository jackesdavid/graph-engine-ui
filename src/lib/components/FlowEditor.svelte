<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { IconName } from '../icons.js';

	/** A tab of the side panel a product adds after Properties (details, runs…). */
	export type RailTab = { id: string; label: string; icon?: IconName; content: Snippet };
</script>

<script lang="ts">
	// The whole editor, laid out like the Olhar AI's: the canvas in a well with floating controls
	// (add node top left, the tools down the left edge, the product's own controls top centre, zoom
	// top right, hints and the selection's actions bottom centre), and a resizable side panel with
	// tabs (the selected node's properties, then any the product adds), which folds to an icon rail.
	// On a phone the panel is a drawer from the bottom. Controlled: the product owns the graph
	// document (bind:graph) and saves it.
	import type { Component } from 'svelte';
	import type { Catalog, CatalogField, CatalogKind, GraphDoc, GraphNode, LiveState, Messages, Point, ResolvedPorts, Tool } from '../types.js';
	import { ENGLISH } from '../types.js';
	import { addNode, connect, duplicateNodes, removeNodes } from '../graph.js';
	import { EVENT_COLOR, EVENT_KINDS, categoryColor, categoryIcon } from '../colors.js';
	import { HEAD_H, type Ports } from '../geometry.js';
	import Canvas from './Canvas.svelte';
	import ContextSearch from './ContextSearch.svelte';
	import Icon from './Icon.svelte';
	import Inspector, { type FieldEditorProps } from './Inspector.svelte';

	type Props = {
		graph: GraphDoc;
		catalog: Catalog;
		/** Ports of a configured node whose kind is `dynamic` (the product asks its server). */
		resolvePorts?: (kind: string, config: Record<string, unknown>) => Promise<ResolvedPorts>;
		live?: LiveState;
		readonly?: boolean;
		messages?: Partial<Messages>;
		/** Colours and glyphs by category, over the defaults (needed when categories are translated). */
		categoryColors?: Record<string, string>;
		categoryIcons?: Record<string, IconName>;
		/** A product's own title for a node (e.g. naming the event a trigger listens to). */
		titleOf?: (n: GraphNode, kind: CatalogKind | undefined) => string;
		portLabel?: (n: GraphNode, port: string) => string;
		fieldEditor?: (node: GraphNode, field: CatalogField) => Component<FieldEditorProps> | undefined;
		onchange?: (graph: GraphDoc) => void;
		/** The product's controls, floating at the top centre of the canvas (save, run, publish). */
		toolbar?: Snippet;
		/** More tabs in the side panel, after Properties. */
		tabs?: RailTab[];
		/** The open tab: `properties` or the id of one of `tabs`. */
		tab?: string;
		/** The panels are hidden and the canvas has the room (a product may hide its header too). */
		focused?: boolean;
	};
	let {
		graph = $bindable(),
		catalog,
		resolvePorts,
		live = {},
		readonly = false,
		messages: given = {},
		categoryColors = {},
		categoryIcons = {},
		titleOf,
		portLabel,
		fieldEditor,
		onchange,
		toolbar,
		tabs = [],
		tab = $bindable('properties'),
		focused = $bindable(false)
	}: Props = $props();

	const messages: Messages = $derived({ ...ENGLISH, ...given });
	const kinds = $derived(new Map(catalog.kinds.map((k) => [k.slug, k])));
	let tool = $state<Tool>('move');
	let selected = $state(new Set<number>());
	// Wide screens: the panel is beside the canvas, open or folded to a rail. Phones: a drawer.
	let panelOpen = $state(true);
	let sheet = $state(false);
	let panelW = $state(340);
	let resizing = $state(false);
	let notice = $state<string | null>(null);
	let root: HTMLDivElement | undefined = $state();
	let stage: HTMLDivElement | undefined = $state();
	let canvas: Canvas | undefined = $state();
	let resolved = $state<Record<string, ResolvedPorts>>({});
	// The add-node menu: where it opens, and the wire it will connect, if any.
	let menu = $state(false);
	let menuAt = $state<Point>({ x: 12, y: 60 });
	let menuWire = $state<{ node: number; port: string; type: string; at: Point } | null>(null);
	let pending = $state<{ node: number; port: string } | null>(null);

	const cacheKey = (n: GraphNode) => `${n.kind}|${JSON.stringify(n.config)}`;

	// Ask once per distinct configuration of a dynamic kind; the canvas uses the catalogue's
	// ports until the answer arrives.
	$effect(() => {
		if (!resolvePorts) return;
		for (const n of graph.nodes) {
			const k = kinds.get(n.kind);
			const key = cacheKey(n);
			if (!k?.dynamic || key in resolved) continue;
			resolved[key] = { inputs: k.inputs, outputs: k.outputs };
			resolvePorts(n.kind, n.config).then(
				(p) => (resolved[key] = p),
				() => {}
			);
		}
	});

	function portsOf(n: GraphNode): Ports {
		const k = kinds.get(n.kind);
		if (!k) return { inputs: [], outputs: [] };
		return (k.dynamic && resolved[cacheKey(n)]) || { inputs: k.inputs, outputs: k.outputs };
	}
	/** The node's kind, with the settings its configuration really has (a second dropdown). */
	function kindOf(n: GraphNode): CatalogKind | undefined {
		const k = kinds.get(n.kind);
		const fields = k?.dynamic ? resolved[cacheKey(n)]?.fields : undefined;
		return k && fields ? { ...k, fields } : k;
	}
	const title = (n: GraphNode) => titleOf?.(n, kinds.get(n.kind)) ?? kinds.get(n.kind)?.label ?? n.kind;
	const isEvent = (n: GraphNode) => EVENT_KINDS.has(n.kind) || !!kinds.get(n.kind)?.can_start;
	const color = (n: GraphNode) => (EVENT_KINDS.has(n.kind) ? EVENT_COLOR : categoryColor(kinds.get(n.kind)?.category ?? '', categoryColors));
	const icon = (n: GraphNode): IconName => (EVENT_KINDS.has(n.kind) ? 'zap' : categoryIcon(kinds.get(n.kind)?.category ?? '', categoryIcons));

	const primary = $derived(selected.size === 1 ? graph.nodes.find((n) => selected.has(n.id)) : undefined);
	const allTabs = $derived([{ id: 'properties', label: messages.inspector, icon: 'sliders-horizontal' as IconName }, ...tabs]);
	const current = $derived(tabs.find((t) => t.id === tab));

	let last = '';
	$effect(() => {
		// Tell the product the document changed (positions, wires, config, viewport).
		const now = JSON.stringify(graph);
		if (last && now !== last) onchange?.(graph);
		last = now;
	});

	function say(m: string) {
		notice = m;
		setTimeout(() => (notice = notice === m ? null : notice), 3500);
	}

	function openMenu() {
		menuWire = null;
		menuAt = { x: 12, y: 60 };
		menu = true;
	}

	/** A wire let go on the empty canvas: the menu opens there, offering what it could feed. */
	function wireDropped(from: { node: number; port: string; type: string }, at: Point, screen: Point) {
		if (readonly) return;
		const w = stage?.clientWidth ?? 600;
		const h = stage?.clientHeight ?? 400;
		menuWire = { ...from, at };
		menuAt = { x: Math.max(8, Math.min(screen.x, w - 272)), y: Math.max(8, Math.min(screen.y, h - 368)) };
		menu = true;
	}

	function add(k: CatalogKind) {
		const wire = menuWire;
		menuWire = null;
		// From a wire: the node lands where the wire was let go, its first input on the cursor.
		const at = wire ? { x: wire.at.x, y: wire.at.y - HEAD_H / 2 } : (canvas?.centre() ?? { x: 0, y: 0 });
		const r = addNode(graph, k, at);
		graph = r.graph;
		if (wire) {
			const fromPort = portsOf(graph.nodes.find((n) => n.id === wire.node)!).outputs.find((p) => p.name === wire.port);
			const to = k.inputs.find((p) => p.type === wire.type) ?? k.inputs.find((p) => (p.type === 'exec') === (wire.type === 'exec') && (p.type === 'any' || p.accepts_family));
			if (to) {
				const c = connect(graph, { from: wire.node, from_port: wire.port, to: r.id, to_port: to.name }, fromPort, to);
				if ('graph' in c) graph = c.graph;
			}
		}
		selected = new Set([r.id]);
		tab = 'properties';
		sheet = false; // on a phone: close the drawer so the new node is visible
		say(`${k.label} ${messages.added}`);
	}

	function tapped(id: number) {
		selected = new Set([id]);
		tab = 'properties';
		if (!focused) panelOpen = true;
		sheet = true; // a drawer on a phone; on a wide screen the panel is beside the canvas
	}

	function pickTab(id: string) {
		tab = id;
		panelOpen = true;
		focused = false;
		sheet = true;
	}

	function setConfig(id: number, config: Record<string, unknown>) {
		graph.nodes = graph.nodes.map((n) => (n.id === id ? { ...n, config } : n));
	}

	function remove(ids: Set<number>) {
		if (readonly || ids.size === 0) return;
		graph = removeNodes(graph, ids);
		selected = new Set();
	}

	function duplicate() {
		if (readonly || selected.size === 0) return;
		const r = duplicateNodes(graph, selected);
		graph = r.graph;
		selected = new Set(r.ids);
	}

	function key(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
		if (e.key === 'Delete' || e.key === 'Backspace') {
			remove(selected);
			e.preventDefault();
		} else if (e.key === 'Escape') {
			canvas?.cancelWire();
			selected = new Set();
		} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
			duplicate();
			e.preventDefault();
		} else if (e.key === '`') {
			focused = !focused;
		}
	}

	function startResize(e: PointerEvent) {
		resizing = true;
		(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
	}
	function onResize(e: PointerEvent) {
		if (!resizing || !root) return;
		// The splitter sits on the panel's left edge: dragging it left grows the panel.
		panelW = Math.max(240, Math.min(560, root.getBoundingClientRect().right - e.clientX - 4));
	}
	function endResize() {
		resizing = false;
	}

	const tools: { id: Tool; label: () => string; icon: IconName }[] = [
		{ id: 'move', label: () => messages.move, icon: 'mouse-pointer-2' },
		{ id: 'pan', label: () => messages.pan, icon: 'hand' },
		{ id: 'link', label: () => messages.link, icon: 'link-2' },
		{ id: 'cut', label: () => messages.cut, icon: 'scissors' }
	];
	const zoomPct = $derived(Math.round((graph.viewport?.zoom ?? 1) * 100));
</script>

<svelte:window onkeydown={key} />

<div class="geui" class:focused bind:this={root}>
	<div class="geui-stage" bind:this={stage}>
		<Canvas
			bind:this={canvas}
			bind:graph
			bind:selected
			bind:tool
			{portsOf}
			titleOf={title}
			colorOf={color}
			iconOf={icon}
			strongOf={isEvent}
			labelOfPort={(n, p) => portLabel?.(n, p.name) ?? p.name}
			{live}
			{readonly}
			{messages}
			onnotice={say}
			ontapnode={tapped}
			onwiredrop={wireDropped}
			bind:pending
		/>

		<!-- top left: add node -->
		{#if !readonly}
			<div class="geui-at-tl">
				<button type="button" class="geui-add" title={messages.addNode} aria-label={messages.addNode} onclick={openMenu}>
					<Icon name="plus" size={16} />
					<span>{messages.addNode}</span>
				</button>
			</div>

			<!-- left edge: the tools a finger needs (a mouse has modifiers) -->
			<div class="geui-hud geui-at-l" role="toolbar" aria-orientation="vertical">
				{#each tools as t (t.id)}
					<button type="button" class="geui-btn" class:on={tool === t.id} aria-pressed={tool === t.id} title={t.label()} aria-label={t.label()} onclick={() => ((tool = t.id), canvas?.cancelWire())}>
						<Icon name={t.icon} size={16} />
					</button>
				{/each}
			</div>
		{/if}

		<!-- top centre: the product's controls -->
		{#if toolbar}
			<div class="geui-at-tc">
				<div class="geui-hud">{@render toolbar()}</div>
			</div>
		{/if}

		<!-- top right: zoom, and the panels -->
		<div class="geui-hud geui-at-tr">
			<button type="button" class="geui-btn wide-only" title={messages.zoomOut} aria-label={messages.zoomOut} onclick={() => canvas?.zoomBy(1 / 1.2)}><Icon name="zoom-out" size={16} /></button>
			<span class="geui-zoom wide-only">{zoomPct}%</span>
			<button type="button" class="geui-btn wide-only" title={messages.zoomIn} aria-label={messages.zoomIn} onclick={() => canvas?.zoomBy(1.2)}><Icon name="zoom-in" size={16} /></button>
			<button type="button" class="geui-btn" title={messages.fit} aria-label={messages.fit} onclick={() => canvas?.fit()}><Icon name="maximize" size={16} /></button>
			<button
				type="button"
				class="geui-btn wide-only"
				title={focused ? messages.unfocusCanvas : messages.focusCanvas}
				aria-label={focused ? messages.unfocusCanvas : messages.focusCanvas}
				aria-pressed={focused}
				onclick={() => (focused = !focused)}
			>
				<Icon name={focused ? 'minimize-2' : 'expand'} size={16} />
			</button>
			<button type="button" class="geui-btn narrow-only" title={messages.showPanel} aria-label={messages.showPanel} onclick={() => (sheet = true)}>
				<Icon name="panel-right-open" size={16} />
			</button>
		</div>

		<!-- bottom centre: the wire being drawn · the selection's actions · a notice · the hint -->
		<div class="geui-at-bc">
			{#if notice}
				<div class="geui-pill" role="status">{notice}</div>
			{:else if pending}
				<div class="geui-pill accent">
					{messages.wiringFrom} #{pending.node}.{pending.port}
					<button type="button" class="geui-linkbtn" onclick={() => canvas?.cancelWire()}>{messages.cancel}</button>
				</div>
			{:else if selected.size > 0 && !readonly}
				<div class="geui-hud">
					<span class="geui-count">{selected.size} {messages.selected}</span>
					<button type="button" class="geui-btn" title={messages.duplicate} aria-label={messages.duplicate} onclick={duplicate}><Icon name="copy-plus" size={16} /></button>
					<button type="button" class="geui-btn danger" title={messages.deleteSelection} aria-label={messages.deleteSelection} onclick={() => remove(selected)}><Icon name="trash" size={16} /></button>
				</div>
			{:else if !readonly}
				<div class="geui-pill wide-only">{messages.wireHint}</div>
			{/if}
		</div>

		<ContextSearch bind:open={menu} at={menuAt} portType={menuWire?.type} kinds={catalog.kinds} {messages} onpick={add} />
	</div>

	{#if !focused}
		{#if panelOpen}
			<div
				class="geui-split"
				class:resizing
				onpointerdown={startResize}
				onpointermove={onResize}
				onpointerup={endResize}
				onpointercancel={endResize}
				role="separator"
				aria-orientation="vertical"
				aria-label={messages.resizePanel}
			>
				<span></span>
			</div>
		{:else}
			<div class="geui-mini">
				<button type="button" class="geui-btn" title={messages.showPanel} aria-label={messages.showPanel} onclick={() => (panelOpen = true)}>
					<Icon name="panel-right-open" size={16} />
				</button>
				<span class="geui-rule"></span>
				{#each allTabs as t (t.id)}
					<button type="button" class="geui-btn" title={t.label} aria-label={t.label} onclick={() => pickTab(t.id)}>
						<Icon name={t.icon ?? 'box'} size={16} />
					</button>
				{/each}
			</div>
		{/if}
	{/if}

	<aside class="geui-side" class:open={sheet} class:folded={!panelOpen || focused} style="--geui-panel-w: {panelW}px">
		<button type="button" class="geui-grab" onclick={() => (sheet = false)} aria-label={messages.close}><span></span></button>
		<div class="geui-tabs" role="tablist">
			{#each allTabs as t (t.id)}
				<button type="button" role="tab" aria-selected={tab === t.id} class:on={tab === t.id} title={t.label} onclick={() => (tab = t.id)}>
					<Icon name={t.icon ?? 'box'} size={16} />
					<span>{t.label}</span>
				</button>
			{/each}
			<span class="geui-rule v"></span>
			<button type="button" class="geui-fold" title={messages.hidePanel} aria-label={messages.hidePanel} onclick={() => ((panelOpen = false), (sheet = false))}>
				<Icon name="panel-right-close" size={16} />
			</button>
		</div>
		<div class="geui-panel">
			{#if current}
				{@render current.content()}
			{:else}
				<Inspector
					{graph}
					node={primary}
					kind={primary ? kindOf(primary) : undefined}
					ports={primary ? portsOf(primary) : undefined}
					title={primary ? title(primary) : ''}
					color={primary ? color(primary) : undefined}
					{messages}
					{readonly}
					labelOfPort={(n, name) => portLabel?.(n, name) ?? name}
					{fieldEditor}
					onconfig={setConfig}
					ondelete={(id) => remove(new Set([id]))}
				/>
			{/if}
		</div>
	</aside>
</div>

<style>
	.geui {
		position: relative;
		display: flex;
		gap: 4px;
		height: 100%;
		min-height: 420px;
		color: var(--foreground, #18181b);
	}
	.geui-stage {
		position: relative;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 0.75rem;
	}

	/* Floating controls: small panels over the canvas, blurred so the graph shows through. */
	.geui-hud {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 0.5rem;
		background: var(--geui-hud, color-mix(in oklab, var(--background, #fff) 85%, transparent));
		box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
		backdrop-filter: blur(8px);
	}
	.geui-at-tl {
		position: absolute;
		top: 12px;
		left: 12px;
	}
	.geui-at-l {
		position: absolute;
		top: 50%;
		left: 12px;
		flex-direction: column;
		transform: translateY(-50%);
	}
	.geui-at-tc {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
	}
	.geui-at-tr {
		position: absolute;
		top: 12px;
		right: 12px;
	}
	.geui-at-bc {
		position: absolute;
		bottom: 12px;
		left: 50%;
		max-width: calc(100% - 24px);
		transform: translateX(-50%);
	}
	.geui-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: 0.375rem;
		background: transparent;
		color: var(--foreground, #18181b);
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.geui-btn:hover {
		background: var(--accent, #f4f4f5);
	}
	.geui-btn.on {
		background: color-mix(in oklab, var(--primary, #d6336c) 15%, transparent);
		color: var(--primary, #d6336c);
	}
	.geui-btn.danger {
		color: var(--muted-foreground, #71717a);
	}
	.geui-btn.danger:hover {
		color: var(--destructive, #e11d48);
	}
	.geui-add {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		height: 36px;
		padding: 0 1rem;
		border: 0;
		border-radius: 0.5rem;
		background: var(--primary, #d6336c);
		color: var(--primary-foreground, #fff);
		font: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
		cursor: pointer;
		transition: transform 0.1s;
	}
	.geui-add:active,
	.geui-btn:active {
		transform: scale(0.97);
	}
	.geui-zoom {
		width: 40px;
		text-align: center;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: var(--muted-foreground, #71717a);
	}
	.geui-count {
		padding: 0 6px;
		font-size: 11px;
		color: var(--muted-foreground, #71717a);
		white-space: nowrap;
	}
	.geui-pill {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 4px 12px;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 999px;
		background: var(--geui-hud, color-mix(in oklab, var(--background, #fff) 85%, transparent));
		box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
		backdrop-filter: blur(8px);
		font-size: 11px;
		color: var(--muted-foreground, #71717a);
		white-space: nowrap;
	}
	.geui-pill.accent {
		border-color: color-mix(in oklab, var(--primary, #d6336c) 40%, transparent);
		color: var(--primary, #d6336c);
		font-size: 12px;
	}
	.geui-linkbtn {
		border: 0;
		background: none;
		color: var(--muted-foreground, #71717a);
		font: inherit;
		cursor: pointer;
	}
	.geui-linkbtn:hover {
		color: var(--foreground, #18181b);
	}

	/* The splitter, the folded rail and the panel. */
	.geui-split {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		width: 8px;
		cursor: col-resize;
		touch-action: none;
	}
	.geui-split span {
		width: 4px;
		height: 40px;
		border-radius: 999px;
		background: var(--border, #e4e4e7);
		transition: background 0.15s;
	}
	.geui-split:hover span {
		background: color-mix(in oklab, var(--primary, #d6336c) 60%, transparent);
	}
	.geui-split.resizing span {
		background: var(--primary, #d6336c);
	}
	.geui-mini {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		align-items: center;
		gap: 4px;
		width: 36px;
		padding: 2px;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 0.75rem;
		background: var(--card, #fff);
		box-sizing: border-box;
	}
	.geui-mini .geui-btn {
		color: var(--muted-foreground, #71717a);
	}
	.geui-rule {
		width: 20px;
		height: 1px;
		margin: 2px 0;
		background: var(--border, #e4e4e7);
	}
	.geui-rule.v {
		flex-shrink: 0;
		width: 1px;
		height: 20px;
		margin: 0 2px;
	}
	.geui-side {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
		gap: 8px;
		width: var(--geui-panel-w, 340px);
		min-height: 0;
	}
	.geui-side.folded {
		display: none;
	}
	.geui-grab {
		display: none;
	}
	.geui-tabs {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		gap: 2px;
		padding: 4px;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 0.75rem;
		background: var(--card, #fff);
	}
	.geui-tabs [role='tab'] {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-width: 0;
		padding: 6px;
		border: 0;
		border-radius: 0.5rem;
		background: transparent;
		color: var(--muted-foreground, #71717a);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.geui-tabs [role='tab'] span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.geui-tabs [role='tab']:hover {
		background: var(--accent, #f4f4f5);
		color: var(--foreground, #18181b);
	}
	.geui-tabs [role='tab'].on {
		background: var(--geui-active, var(--muted, #ececec));
		color: var(--foreground, #18181b);
	}
	.geui-tabs :global(svg) {
		flex-shrink: 0;
	}
	.geui-fold {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		padding: 6px;
		border: 0;
		border-radius: 0.5rem;
		background: transparent;
		color: var(--muted-foreground, #71717a);
		cursor: pointer;
	}
	.geui-fold:hover {
		background: var(--accent, #f4f4f5);
		color: var(--foreground, #18181b);
	}
	.geui-panel {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
	.narrow-only {
		display: none;
	}

	/* A finger needs 44px. */
	@media (pointer: coarse) {
		.geui-btn {
			width: 44px;
			height: 44px;
		}
		.geui-add {
			height: 44px;
		}
		.geui-tabs [role='tab'],
		.geui-fold {
			min-height: 44px;
		}
	}

	/* A phone: the panel is a drawer from the bottom; the product's controls go to the bottom. */
	@media (max-width: 820px) {
		.geui {
			gap: 0;
		}
		.geui-split,
		.geui-mini,
		.wide-only {
			display: none !important;
		}
		.narrow-only {
			display: inline-flex;
		}
		.geui-at-tc {
			top: auto;
			bottom: 12px;
		}
		.geui-at-bc {
			bottom: 72px;
		}
		.geui-side,
		.geui-side.folded {
			position: absolute;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 5;
			display: flex;
			width: auto;
			height: min(72%, 600px);
			padding: 0 8px 8px;
			border-top: 1px solid var(--border, #e4e4e7);
			border-radius: 16px 16px 0 0;
			background: var(--background, #fff);
			box-shadow: 0 -8px 24px rgb(0 0 0 / 0.12);
			transform: translateY(105%);
			transition: transform 0.2s ease;
		}
		.geui-side.open {
			transform: none;
		}
		.geui-grab {
			display: flex;
			flex-shrink: 0;
			align-items: center;
			justify-content: center;
			min-height: 28px;
			border: 0;
			background: transparent;
			cursor: pointer;
		}
		.geui-grab span {
			width: 44px;
			height: 5px;
			border-radius: 999px;
			background: var(--border, #d4d4d8);
		}
		.geui-fold,
		.geui-rule.v {
			display: none;
		}
	}
</style>
