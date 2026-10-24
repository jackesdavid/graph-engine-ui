<script lang="ts">
	// The selected node's settings, as a card: its name and number, what it is for (behind the help
	// button) and delete; then the declared fields (the engine's `fields`); then every data input
	// that is not wired, so a value can be typed instead of wired; then any other key of the default
	// configuration. A product can take over any field with its own editor (an account picker, say)
	// through `fieldEditor`.
	import type { Component } from 'svelte';
	import type { CatalogField, CatalogKind, GraphDoc, GraphNode, Messages } from '../types.js';
	import type { Ports } from '../geometry.js';
	import { dataIn } from '../geometry.js';
	import { wiredInto } from '../graph.js';
	import FieldInput from './FieldInput.svelte';
	import Icon from './Icon.svelte';

	export type FieldEditorProps = { node: GraphNode; field: CatalogField; value: unknown; onchange: (v: unknown) => void; readonly: boolean };

	type Props = {
		graph: GraphDoc;
		node: GraphNode | undefined;
		kind: CatalogKind | undefined;
		ports: Ports | undefined;
		title: string;
		/** The node family's colour, for the dot by its name. */
		color?: string;
		messages: Messages;
		readonly?: boolean;
		labelOfPort?: (n: GraphNode, name: string) => string;
		fieldEditor?: (node: GraphNode, field: CatalogField) => Component<FieldEditorProps> | undefined;
		onconfig: (id: number, config: Record<string, unknown>) => void;
		ondelete: (id: number) => void;
	};
	let { graph, node, kind, ports, title, color, messages, readonly = false, labelOfPort = (_n, name) => name, fieldEditor, onconfig, ondelete }: Props = $props();

	let about = $state(false);

	function guess(key: string, v: unknown): CatalogField {
		const kindOf: CatalogField['kind'] = typeof v === 'boolean' ? 'bool' : typeof v === 'number' ? 'num' : 'text';
		return { key, label: key, required: false, kind: kindOf };
	}

	const sections = $derived.by(() => {
		if (!node || !kind || !ports) return { settings: [] as CatalogField[], inputs: [] as CatalogField[] };
		const declared = kind.fields ?? [];
		const taken = new Set(declared.map((f) => f.key));
		const inputs: CatalogField[] = [];
		for (const p of dataIn(ports)) {
			if (taken.has(p.name)) continue;
			taken.add(p.name);
			if (wiredInto(graph, node.id, p.name)) continue;
			const k: CatalogField['kind'] = p.type === 'num' ? 'num' : p.type === 'bool' ? 'bool' : 'text';
			inputs.push({ key: p.name, label: labelOfPort(node, p.name), required: p.required, kind: k });
		}
		const rest = Object.keys(kind.default_config ?? {})
			.filter((k) => !taken.has(k))
			.map((k) => guess(k, (kind.default_config as Record<string, unknown>)[k]));
		return { settings: [...declared, ...rest], inputs };
	});

	function set(key: string, v: unknown) {
		if (!node) return;
		onconfig(node.id, { ...node.config, [key]: v });
	}
</script>

{#if !node || !kind}
	<div class="geui-card geui-empty">
		<Icon name="sliders-horizontal" size={20} />
		<p>{messages.nothingSelected}</p>
	</div>
{:else}
	<div class="geui-card geui-inspector">
		<div class="geui-head">
			<span class="name">
				<span class="dot" style="background: {color ?? 'var(--primary, #d6336c)'}"></span>
				<span class="label">{title}</span>
				<span class="id">#{node.id}</span>
			</span>
			<span class="actions">
				{#if kind.about}
					<button type="button" class="icon" class:on={about} title={messages.whatIsThis} aria-label={messages.whatIsThis} aria-pressed={about} onclick={() => (about = !about)}>
						<Icon name="circle-question-mark" size={14} />
					</button>
				{/if}
				{#if !readonly}
					<button type="button" class="icon danger" title={messages.deleteNode} aria-label={messages.deleteNode} onclick={() => ondelete(node.id)}>
						<Icon name="trash" size={14} />
					</button>
				{/if}
			</span>
		</div>
		{#if about && kind.about}
			<p class="geui-about">{kind.about}</p>
		{/if}
		{#each [['settings', sections.settings], ['inputs', sections.inputs]] as const as [name, fields] (name)}
			{#if fields.length}
				{#if name === 'inputs' && sections.settings.length}
					<h4>{messages.inputs}</h4>
				{/if}
				{#each fields as f (f.key)}
					{@const Custom = fieldEditor?.(node, f)}
					<div class="geui-field">
						<label for="geui-f-{node.id}-{f.key}">{f.label}{f.required ? ' *' : ''}</label>
						{#if Custom}
							<Custom {node} field={f} value={node.config[f.key]} onchange={(v: unknown) => set(f.key, v)} {readonly} />
						{:else}
							<FieldInput field={f} value={node.config[f.key]} onchange={(v) => set(f.key, v)} {messages} {readonly} id="geui-f-{node.id}-{f.key}" />
						{/if}
					</div>
				{/each}
			{/if}
		{/each}
	</div>
{/if}

<style>
	.geui-card {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.625rem;
		padding: 0.75rem;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 0.75rem;
		background: var(--card, #fff);
		color: var(--card-foreground, var(--foreground, #18181b));
	}
	.geui-empty {
		justify-items: center;
		padding: 1.5rem 1rem;
		text-align: center;
		color: var(--muted-foreground, #71717a);
	}
	.geui-empty p {
		margin: 0;
		font-size: 0.8rem;
		line-height: 1.45;
	}
	.geui-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.name {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		font-size: 0.875rem;
		font-weight: 500;
	}
	.dot {
		flex-shrink: 0;
		width: 6px;
		height: 6px;
		border-radius: 999px;
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.id {
		flex-shrink: 0;
		color: var(--muted-foreground, #71717a);
	}
	.actions {
		display: flex;
		flex-shrink: 0;
	}
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: 0.375rem;
		background: transparent;
		color: var(--muted-foreground, #71717a);
		cursor: pointer;
	}
	.icon:hover,
	.icon.on {
		background: var(--accent, #f4f4f5);
		color: var(--foreground, #18181b);
	}
	.icon.danger:hover {
		color: var(--destructive, #e11d48);
	}
	.geui-about {
		margin: 0;
		padding: 0.5rem 0.625rem;
		border-radius: 0.5rem;
		background: var(--muted, #f4f4f5);
		color: var(--muted-foreground, #71717a);
		font-size: 0.75rem;
		line-height: 1.5;
		white-space: pre-line;
	}
	h4 {
		margin: 0.25rem 0 0;
		padding-top: 0.5rem;
		border-top: 1px solid var(--border, #e4e4e7);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted-foreground, #71717a);
	}
	.geui-field {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
	}
	label {
		font-size: 0.75rem;
		color: var(--muted-foreground, #71717a);
	}
	@media (pointer: coarse) {
		.icon {
			width: 44px;
			height: 44px;
		}
	}
</style>
