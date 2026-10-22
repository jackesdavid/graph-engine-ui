<script lang="ts">
	// One configuration value, drawn from its declared field kind (or guessed from its value when
	// the node declares no fields). `rows` is a small table: one line per row, one cell per column.
	import type { CatalogField, Messages } from '../types.js';
	import FieldInput from './FieldInput.svelte';

	type Props = {
		field: CatalogField;
		value: unknown;
		onchange: (v: unknown) => void;
		messages: Messages;
		readonly?: boolean;
		id: string;
	};
	let { field, value, onchange, messages, readonly = false, id }: Props = $props();

	const rows = $derived(Array.isArray(value) ? (value as Record<string, unknown>[]) : []);
	function setCell(i: number, key: string, v: unknown) {
		const next = rows.map((r, j) => (j === i ? { ...r, [key]: v } : r));
		onchange(next);
	}
	function addRow() {
		const blank: Record<string, unknown> = {};
		for (const f of field.fields ?? []) blank[f.key] = f.kind === 'bool' ? false : f.kind === 'choice' ? (f.options?.[0] ?? '') : '';
		onchange([...rows, blank]);
	}
	const num = (s: string) => (s.trim() === '' ? '' : Number.isFinite(Number(s)) ? Number(s) : s);
</script>

{#if field.kind === 'bool'}
	<label class="geui-check">
		<input {id} type="checkbox" checked={value === true || value === 'true'} disabled={readonly} onchange={(e) => onchange(e.currentTarget.checked)} />
		<span>{value === true || value === 'true' ? messages.yes : messages.no}</span>
	</label>
{:else if field.kind === 'choice'}
	<select {id} class="geui-input" value={String(value ?? '')} disabled={readonly} onchange={(e) => onchange(e.currentTarget.value)}>
		{#each field.options ?? [] as o (o)}
			<option value={o}>{o}</option>
		{/each}
	</select>
{:else if field.kind === 'num'}
	<input {id} class="geui-input" inputmode="decimal" value={value === undefined || value === null ? '' : String(value)} disabled={readonly} onchange={(e) => onchange(num(e.currentTarget.value))} />
{:else if field.kind === 'long_text'}
	<textarea {id} class="geui-input" rows="4" value={String(value ?? '')} disabled={readonly} onchange={(e) => onchange(e.currentTarget.value)}></textarea>
{:else if field.kind === 'rows'}
	<div class="geui-rows">
		{#each rows as row, i (i)}
			<div class="geui-row">
				{#each field.fields ?? [] as col (col.key)}
					<label class="geui-cell">
						<span>{col.label}</span>
						<FieldInput field={col} value={row[col.key]} onchange={(v) => setCell(i, col.key, v)} {messages} {readonly} id="{id}-{i}-{col.key}" />
					</label>
				{/each}
				{#if !readonly}
					<button type="button" class="geui-link danger" onclick={() => onchange(rows.filter((_, j) => j !== i))}>{messages.removeRow}</button>
				{/if}
			</div>
		{/each}
		{#if !readonly}
			<button type="button" class="geui-button" onclick={addRow}>{messages.addRow}</button>
		{/if}
	</div>
{:else}
	<input {id} class="geui-input" value={typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')} disabled={readonly} onchange={(e) => onchange(e.currentTarget.value)} />
{/if}

<style>
	.geui-input {
		width: 100%;
		min-height: 44px;
		box-sizing: border-box;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--input, #e4e4e7);
		border-radius: calc(var(--radius, 0.625rem) * 0.8);
		background: var(--background, #fff);
		color: var(--foreground, #18181b);
		font: inherit;
	}
	textarea.geui-input {
		min-height: 88px;
		resize: vertical;
	}
	.geui-input:focus {
		outline: 2px solid var(--ring, #d6336c);
		outline-offset: 1px;
	}
	.geui-check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
	}
	.geui-check input {
		width: 20px;
		height: 20px;
		accent-color: var(--primary, #d6336c);
	}
	.geui-rows {
		display: grid;
		gap: 0.75rem;
	}
	.geui-row {
		display: grid;
		gap: 0.5rem;
		padding: 0.75rem;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: var(--radius, 0.625rem);
	}
	.geui-cell {
		display: grid;
		gap: 0.25rem;
		font-size: 0.8rem;
		color: var(--muted-foreground, #71717a);
	}
	.geui-button {
		min-height: 44px;
		border: 1px dashed var(--border, #e4e4e7);
		border-radius: var(--radius, 0.625rem);
		background: transparent;
		color: var(--foreground, #18181b);
		font: inherit;
		cursor: pointer;
	}
	.geui-link {
		justify-self: start;
		min-height: 36px;
		border: 0;
		background: none;
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
		padding: 0;
	}
	.danger {
		color: var(--destructive, #e11d48);
	}
</style>
