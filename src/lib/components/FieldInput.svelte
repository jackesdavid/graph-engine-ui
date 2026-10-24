<script lang="ts">
	// One configuration value, drawn from its declared field kind (or guessed from its value when
	// the node declares no fields). `rows` is a small table: one line per row, one cell per column.
	import type { CatalogChoice, CatalogField, Messages } from '../types.js';
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
	// Options grouped under their headings, in the order the groups first appear.
	const groups = $derived.by(() => {
		const out: { group: string; items: CatalogChoice[] }[] = [];
		const all: CatalogChoice[] = field.choices ?? (field.options ?? []).map((o) => ({ value: o, label: o }));
		for (const c of all) {
			const g = c.group ?? '';
			const at = out.find((x) => x.group === g);
			if (at) at.items.push(c);
			else out.push({ group: g, items: [c] });
		}
		return out;
	});
	const known = $derived(groups.some((g) => g.items.some((i) => i.value === String(value ?? ''))));
	const num = (s: string) => (s.trim() === '' ? '' : Number.isFinite(Number(s)) ? Number(s) : s);
</script>

{#if field.kind === 'bool'}
	<label class="geui-check">
		<input {id} type="checkbox" checked={value === true || value === 'true'} disabled={readonly} onchange={(e) => onchange(e.currentTarget.checked)} />
		<span>{value === true || value === 'true' ? messages.yes : messages.no}</span>
	</label>
{:else if field.kind === 'choice'}
	<select {id} class="geui-input" value={String(value ?? '')} disabled={readonly} onchange={(e) => onchange(e.currentTarget.value)}>
		{#if !known}
			<option value={String(value ?? '')} disabled>{value ? String(value) : messages.choose}</option>
		{/if}
		{#each groups as g (g.group)}
			{#if g.group}
				<optgroup label={g.group}>
					{#each g.items as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
				</optgroup>
			{:else}
				{#each g.items as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
			{/if}
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
		max-width: 100%;
		min-height: 2rem;
		box-sizing: border-box;
		padding: 0.25rem 0.625rem;
		border: 1px solid var(--input, #e4e4e7);
		border-radius: 0.5rem;
		background: var(--geui-input-bg, var(--background, #fff));
		color: var(--foreground, #18181b);
		font: inherit;
		font-size: 0.8125rem;
	}
	textarea.geui-input {
		min-height: 80px;
		padding: 0.5rem 0.625rem;
		resize: vertical;
	}
	/* A finger needs 44px; inputs under 16px make iOS zoom the page. */
	@media (pointer: coarse) {
		.geui-input {
			min-height: 44px;
			font-size: 16px;
		}
		.geui-check {
			min-height: 44px;
		}
		.geui-button {
			min-height: 44px;
		}
	}
	.geui-input:focus {
		outline: 2px solid var(--ring, #d6336c);
		outline-offset: 1px;
	}
	.geui-check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2rem;
		font-size: 0.75rem;
		color: var(--muted-foreground, #71717a);
	}
	.geui-check input {
		width: 18px;
		height: 18px;
		accent-color: var(--primary, #d6336c);
	}
	.geui-rows {
		display: grid;
		gap: 0.5rem;
	}
	.geui-row {
		display: grid;
		gap: 0.5rem;
		padding: 0.625rem;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 0.5rem;
		background: var(--muted, #f4f4f5);
	}
	.geui-cell {
		display: grid;
		gap: 0.25rem;
		font-size: 0.7rem;
		color: var(--muted-foreground, #71717a);
	}
	.geui-button {
		min-height: 2rem;
		border: 1px dashed var(--border, #e4e4e7);
		border-radius: 0.5rem;
		font-size: 0.75rem;
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
