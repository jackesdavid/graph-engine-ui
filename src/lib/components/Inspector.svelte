<script lang="ts">
	// The selected node's settings. Declared fields come first (the engine's `fields`); then every
	// data input that is not wired, so a value can be typed instead of wired; then any other key of
	// the default configuration. A product can take over any field with its own editor (an account
	// picker, say) through `fieldEditor`.
	import type { Component } from 'svelte';
	import type { CatalogField, CatalogKind, GraphDoc, GraphNode, Messages } from '../types.js';
	import type { Ports } from '../geometry.js';
	import { dataIn } from '../geometry.js';
	import { wiredInto } from '../graph.js';
	import FieldInput from './FieldInput.svelte';

	export type FieldEditorProps = { node: GraphNode; field: CatalogField; value: unknown; onchange: (v: unknown) => void; readonly: boolean };

	type Props = {
		graph: GraphDoc;
		node: GraphNode | undefined;
		kind: CatalogKind | undefined;
		ports: Ports | undefined;
		title: string;
		messages: Messages;
		readonly?: boolean;
		labelOfPort?: (n: GraphNode, name: string) => string;
		fieldEditor?: (node: GraphNode, field: CatalogField) => Component<FieldEditorProps> | undefined;
		onconfig: (id: number, config: Record<string, unknown>) => void;
		ondelete: (id: number) => void;
	};
	let { graph, node, kind, ports, title, messages, readonly = false, labelOfPort = (_n, name) => name, fieldEditor, onconfig, ondelete }: Props = $props();

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

<div class="geui-inspector">
	{#if !node || !kind}
		<p class="geui-muted">{messages.nothingSelected}</p>
	{:else}
		<h3>{title}</h3>
		{#if kind.about}
			<p class="geui-about">{kind.about.split('\n\n')[0]}</p>
		{/if}
		{#each [['settings', sections.settings], ['inputs', sections.inputs]] as const as [name, fields] (name)}
			{#if fields.length}
				<h4>{name === 'settings' ? messages.settings : messages.inputs}</h4>
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
		{#if !readonly}
			<button type="button" class="geui-delete" onclick={() => ondelete(node.id)}>{messages.deleteNode}</button>
		{/if}
	{/if}
</div>

<style>
	.geui-inspector {
		display: grid;
		gap: 0.9rem;
		padding: 1rem;
	}
	h3 {
		margin: 0;
		font-size: 1.05rem;
	}
	h4 {
		margin: 0.5rem 0 0;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted-foreground, #71717a);
	}
	.geui-about,
	.geui-muted {
		margin: 0;
		color: var(--muted-foreground, #71717a);
		font-size: 0.9rem;
		line-height: 1.45;
	}
	.geui-field {
		display: grid;
		gap: 0.35rem;
	}
	label {
		font-size: 0.9rem;
		font-weight: 500;
	}
	.geui-delete {
		min-height: 44px;
		margin-top: 0.5rem;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: var(--radius, 0.625rem);
		background: transparent;
		color: var(--destructive, #e11d48);
		font: inherit;
		cursor: pointer;
	}
</style>
