<script lang="ts">
	// The whole editor: tools over the canvas, and a side panel with the selected node's settings
	// or the palette. Controlled: the product owns the graph document (bind:graph) and saves it.
	import type { Component } from 'svelte';
	import type { Catalog, CatalogField, CatalogKind, GraphDoc, GraphNode, LiveState, Messages, ResolvedPorts, Tool } from '../types.js';
	import { ENGLISH } from '../types.js';
	import { addNode, removeNodes } from '../graph.js';
	import { categoryColor } from '../colors.js';
	import type { Ports } from '../geometry.js';
	import Canvas from './Canvas.svelte';
	import Inspector, { type FieldEditorProps } from './Inspector.svelte';
	import Palette from './Palette.svelte';

	type Props = {
		graph: GraphDoc;
		catalog: Catalog;
		/** Ports of a configured node whose kind is `dynamic` (the product asks its server). */
		resolvePorts?: (kind: string, config: Record<string, unknown>) => Promise<ResolvedPorts>;
		live?: LiveState;
		readonly?: boolean;
		messages?: Partial<Messages>;
		categoryColors?: Record<string, string>;
		/** A product's own title for a node (e.g. naming the event a trigger listens to). */
		titleOf?: (n: GraphNode, kind: CatalogKind | undefined) => string;
		portLabel?: (n: GraphNode, port: string) => string;
		fieldEditor?: (node: GraphNode, field: CatalogField) => Component<FieldEditorProps> | undefined;
		onchange?: (graph: GraphDoc) => void;
	};
	let {
		graph = $bindable(),
		catalog,
		resolvePorts,
		live = {},
		readonly = false,
		messages: given = {},
		categoryColors = {},
		titleOf,
		portLabel,
		fieldEditor,
		onchange
	}: Props = $props();

	const messages: Messages = $derived({ ...ENGLISH, ...given });
	const kinds = $derived(new Map(catalog.kinds.map((k) => [k.slug, k])));
	let tool = $state<Tool>('move');
	let selected = $state(new Set<number>());
	let panel = $state<'props' | 'add'>('props');
	// On a phone the side panel is a drawer over the canvas, opened from the toolbar.
	let sheet = $state(false);
	let notice = $state<string | null>(null);
	let canvas: Canvas | undefined = $state();
	let resolved = $state<Record<string, ResolvedPorts>>({});

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
	const title = (n: GraphNode) => titleOf?.(n, kinds.get(n.kind)) ?? kinds.get(n.kind)?.label ?? n.kind;
	const color = (n: GraphNode) => categoryColor(kinds.get(n.kind)?.category ?? '', categoryColors);

	const primary = $derived(selected.size === 1 ? graph.nodes.find((n) => selected.has(n.id)) : undefined);

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

	function add(k: CatalogKind) {
		const at = canvas?.centre() ?? { x: 0, y: 0 };
		const r = addNode(graph, k, at);
		graph = r.graph;
		selected = new Set([r.id]);
		panel = 'props';
		sheet = false; // on a phone: close the drawer so the new node is visible
		say(`${k.label} ${messages.added}`);
	}

	function tapped(id: number) {
		selected = new Set([id]);
		panel = 'props';
		sheet = true; // a drawer on a phone; on a wide screen the panel is always there
	}

	function open(p: 'props' | 'add') {
		panel = p;
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

	function key(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
		if (e.key === 'Delete' || e.key === 'Backspace') {
			remove(selected);
			e.preventDefault();
		} else if (e.key === 'Escape') {
			canvas?.cancelWire();
			selected = new Set();
		}
	}

	const tools: { id: Tool; label: () => string; icon: string }[] = [
		{ id: 'move', label: () => messages.move, icon: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20' },
		{ id: 'pan', label: () => messages.pan, icon: 'M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15' },
		{ id: 'link', label: () => messages.link, icon: 'M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8' },
		{ id: 'cut', label: () => messages.cut, icon: 'M6 6m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M6 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12' }
	];
</script>

<svelte:window onkeydown={key} />

<div class="geui">
	<div class="geui-stage">
		<Canvas
			bind:this={canvas}
			bind:graph
			bind:selected
			bind:tool
			{portsOf}
			titleOf={title}
			colorOf={color}
			labelOfPort={(n, p) => portLabel?.(n, p.name) ?? p.name}
			{live}
			{readonly}
			{messages}
			onnotice={say}
			ontapnode={tapped}
		/>
		<div class="geui-tools" role="toolbar">
			{#if !readonly}
				<button type="button" class="geui-add" title={messages.addNode} aria-label={messages.addNode} onclick={() => open('add')}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
					<span>{messages.addNode}</span>
				</button>
			{/if}
			<button type="button" title={messages.inspector} aria-label={messages.inspector} disabled={!primary} onclick={() => open('props')}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>
			</button>
			<span class="sep"></span>
			{#if !readonly}
				{#each tools as t (t.id)}
					<button type="button" class:on={tool === t.id} aria-pressed={tool === t.id} title={t.label()} onclick={() => (tool = t.id)}>
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg>
						<span>{t.label()}</span>
					</button>
				{/each}
				<span class="sep"></span>
			{/if}
			<button type="button" title={messages.zoomOut} onclick={() => canvas?.zoomBy(1 / 1.2)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg></button>
			<button type="button" title={messages.zoomIn} onclick={() => canvas?.zoomBy(1.2)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg></button>
			<button type="button" title={messages.fit} onclick={() => canvas?.fit()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4" /></svg><span>{messages.fit}</span></button>
			{#if readonly}<span class="badge">{messages.readOnly}</span>{/if}
		</div>
		{#if notice}
			<div class="geui-notice" role="status">{notice}</div>
		{/if}
	</div>
	<aside class="geui-side" class:open={sheet}>
		<button type="button" class="geui-close" onclick={() => (sheet = false)} aria-label={messages.close}>
			<span class="grab"></span>
		</button>
		{#if !readonly}
			<div class="geui-tabs" role="tablist">
				<button type="button" role="tab" aria-selected={panel === 'props'} class:on={panel === 'props'} onclick={() => (panel = 'props')}>{messages.inspector}</button>
				<button type="button" role="tab" aria-selected={panel === 'add'} class:on={panel === 'add'} onclick={() => (panel = 'add')}>{messages.addNode}</button>
			</div>
		{/if}
		<div class="geui-panel">
			{#if panel === 'add' && !readonly}
				<Palette kinds={catalog.kinds} {messages} {categoryColors} onpick={add} />
			{:else}
				<Inspector
					{graph}
					node={primary}
					kind={primary ? kinds.get(primary.kind) : undefined}
					ports={primary ? portsOf(primary) : undefined}
					title={primary ? title(primary) : ''}
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
		display: grid;
		grid-template-columns: minmax(0, 1fr) 340px;
		height: 100%;
		min-height: 420px;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: var(--radius, 0.625rem);
		overflow: hidden;
		background: var(--background, #fff);
		color: var(--foreground, #18181b);
	}
	.geui {
		position: relative;
	}
	.geui-close {
		display: none;
	}
	@media (max-width: 820px) {
		.geui {
			grid-template-columns: 1fr;
		}
		/* A drawer from the bottom, over the canvas, opened from the toolbar. */
		.geui-side {
			position: absolute;
			left: 0;
			right: 0;
			bottom: 0;
			height: min(72%, 600px);
			z-index: 5;
			background: var(--background, #fff);
			border-left: 0 !important;
			border-top: 1px solid var(--border, #e4e4e7);
			border-radius: 16px 16px 0 0;
			box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.12);
			transform: translateY(105%);
			transition: transform 0.2s ease;
		}
		.geui-side.open {
			transform: none;
		}
		.geui-close {
			display: flex;
			justify-content: center;
			align-items: center;
			min-height: 32px;
			border: 0;
			background: transparent;
			cursor: pointer;
		}
		.grab {
			width: 44px;
			height: 5px;
			border-radius: 999px;
			background: var(--border, #d4d4d8);
		}
		/* Icons only: the toolbar has to fit a phone. */
		.geui-tools span {
			display: none;
		}
		.geui-tools button {
			padding: 0;
		}
	}
	.geui-stage {
		position: relative;
		min-width: 0;
		min-height: 0;
	}
	.geui-tools {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: var(--radius, 0.625rem);
		background: var(--background, #fff);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}
	.geui-tools button {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 44px;
		min-height: 44px;
		padding: 0 0.6rem;
		border: 0;
		border-radius: calc(var(--radius, 0.625rem) * 0.8);
		background: transparent;
		color: var(--foreground, #18181b);
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.geui-tools button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.geui-tools .geui-add {
		background: var(--primary, #d6336c);
		color: var(--primary-foreground, #fff);
	}
	.geui-tools button.on {
		background: var(--primary, #d6336c);
		color: var(--primary-foreground, #fff);
	}
	.geui-tools svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.sep {
		width: 1px;
		height: 24px;
		background: var(--border, #e4e4e7);
		margin: 0 0.25rem;
	}
	.badge {
		padding: 0 0.6rem;
		font-size: 0.8rem;
		color: var(--muted-foreground, #71717a);
	}
	.geui-notice {
		position: absolute;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		max-width: 90%;
		padding: 0.6rem 1rem;
		border-radius: var(--radius, 0.625rem);
		background: var(--foreground, #18181b);
		color: var(--background, #fff);
		font-size: 0.9rem;
	}
	.geui-side {
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-left: 1px solid var(--border, #e4e4e7);
	}
	.geui-tabs {
		display: flex;
		border-bottom: 1px solid var(--border, #e4e4e7);
	}
	.geui-tabs button {
		flex: 1;
		min-height: 48px;
		border: 0;
		border-bottom: 2px solid transparent;
		background: transparent;
		color: var(--muted-foreground, #71717a);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	.geui-tabs button.on {
		color: var(--foreground, #18181b);
		border-bottom-color: var(--primary, #d6336c);
	}
	.geui-panel {
		overflow: auto;
		min-height: 0;
		flex: 1;
	}
</style>
