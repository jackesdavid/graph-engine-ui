<script lang="ts">
	// Every node kind, grouped by category, searchable by name and description.
	import type { CatalogKind, Messages } from '../types.js';
	import { categoryColor } from '../colors.js';

	type Props = {
		kinds: CatalogKind[];
		messages: Messages;
		categoryColors?: Record<string, string>;
		onpick: (k: CatalogKind) => void;
	};
	let { kinds, messages, categoryColors = {}, onpick }: Props = $props();
	let q = $state('');

	const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
	const groups = $derived.by(() => {
		const needle = fold(q.trim());
		const hit = kinds.filter((k) => !needle || fold(`${k.label} ${k.category} ${k.about ?? ''}`).includes(needle));
		const by = new Map<string, CatalogKind[]>();
		for (const k of hit) by.set(k.category, [...(by.get(k.category) ?? []), k]);
		return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	});
</script>

<div class="geui-palette">
	<input class="geui-search" placeholder={messages.search} bind:value={q} aria-label={messages.search} />
	{#if groups.length === 0}
		<p class="geui-muted">{messages.noResults}</p>
	{/if}
	{#each groups as [cat, ks] (cat)}
		<h4><span class="dot" style="background: {categoryColor(cat, categoryColors)}"></span>{cat}</h4>
		{#each ks as k (k.slug)}
			<button type="button" class="geui-kind" onclick={() => onpick(k)} title={k.about ?? ''}>
				<span class="label">{k.label}</span>
				{#if k.about}<span class="about">{k.about.split('\n')[0]}</span>{/if}
			</button>
		{/each}
	{/each}
</div>

<style>
	.geui-palette {
		display: grid;
		gap: 0.4rem;
		padding: 1rem;
	}
	.geui-search {
		min-height: 44px;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--input, #e4e4e7);
		border-radius: calc(var(--radius, 0.625rem) * 0.8);
		background: var(--background, #fff);
		color: var(--foreground, #18181b);
		font: inherit;
		margin-bottom: 0.5rem;
	}
	h4 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.75rem 0 0.25rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--muted-foreground, #71717a);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
	}
	.geui-kind {
		display: grid;
		gap: 0.15rem;
		min-height: 44px;
		padding: 0.5rem 0.75rem;
		border: 1px solid transparent;
		border-radius: calc(var(--radius, 0.625rem) * 0.8);
		background: transparent;
		color: var(--foreground, #18181b);
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.geui-kind:hover,
	.geui-kind:focus-visible {
		background: var(--accent, #f4f4f5);
		border-color: var(--border, #e4e4e7);
	}
	.label {
		font-weight: 500;
	}
	.about {
		font-size: 0.8rem;
		color: var(--muted-foreground, #71717a);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.geui-muted {
		color: var(--muted-foreground, #71717a);
	}
</style>
