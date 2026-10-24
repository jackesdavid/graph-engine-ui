<script lang="ts">
	// The add-node menu: a small floating search, opened by "Add node" or by letting a wire go on the
	// empty canvas. With a wire (`portType`), kinds that take that type come first and wear its
	// colour; each row shows the colours of what the kind hands on.
	import type { CatalogKind, Messages } from '../types.js';
	import { portColor } from '../colors.js';
	import Icon from './Icon.svelte';

	type Props = {
		open: boolean;
		/** Where the menu opens, in the editor's coordinates. */
		at: { x: number; y: number };
		/** The type of the wire being connected, or `undefined` for a plain "Add node". */
		portType?: string;
		kinds: CatalogKind[];
		messages: Messages;
		onpick: (k: CatalogKind) => void;
	};
	let { open = $bindable(), at, portType, kinds, messages, onpick }: Props = $props();

	let q = $state('');
	let input: HTMLInputElement | undefined = $state();
	// Focus on every open, after the pointer event that opened the menu has settled.
	$effect(() => {
		if (open) requestAnimationFrame(() => input?.focus({ preventScroll: true }));
	});

	const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
	const takes = (k: CatalogKind, t: string) => k.inputs.some((p) => p.type === t);
	const list = $derived.by(() => {
		const needle = fold(q.trim());
		return kinds
			.filter((k) => !needle || fold(`${k.label} ${k.category} ${k.slug}`).includes(needle))
			.filter((k) => !portType || k.inputs.length > 0)
			.map((k) => ({ k, score: !portType ? 0 : takes(k, portType) ? 2 : k.inputs.some((p) => p.type === 'any') ? 1 : 0 }))
			.sort((a, b) => b.score - a.score || a.k.label.localeCompare(b.k.label));
	});

	function close() {
		open = false;
		q = '';
	}
	function pick(k: CatalogKind) {
		close();
		onpick(k);
	}
	function key(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
		else if (e.key === 'Enter' && list[0]) pick(list[0].k);
	}
</script>

{#if open}
	<button type="button" class="geui-cs-backdrop" aria-label={messages.close} onclick={close}></button>
	<div class="geui-cs" style="left: {at.x}px; top: {at.y}px" role="dialog" aria-label={portType ? messages.connectTo : messages.addNode}>
		<div class="geui-cs-head">
			{#if portType}
				<span class="dot" style="background: {portColor(portType)}"></span>
			{/if}
			<span class="title">{portType ? messages.connectTo : messages.addNode}</span>
			<button type="button" class="x" aria-label={messages.close} onclick={close}><Icon name="x" size={14} /></button>
		</div>
		<div class="geui-cs-search">
			<input bind:this={input} bind:value={q} placeholder={messages.search} aria-label={messages.search} onkeydown={key} />
		</div>
		<div class="geui-cs-list">
			{#each list as { k, score } (k.slug)}
				<button type="button" class="geui-cs-item" onclick={() => pick(k)} title={k.about?.split('\n')[0] ?? ''}>
					{#if score === 2 && portType}
						<span class="dot" style="background: {portColor(portType)}"></span>
					{:else}
						<span class="dot hollow"></span>
					{/if}
					<span class="label">{k.label}</span>
					<span class="outs">
						{#each k.outputs.filter((p) => p.type !== 'exec').slice(0, 3) as p (p.name)}
							<span class="out" style="background: {portColor(p.type)}"></span>
						{/each}
					</span>
				</button>
			{:else}
				<p class="none">{messages.noResults}</p>
			{/each}
		</div>
	</div>
{/if}

<style>
	.geui-cs-backdrop {
		position: fixed;
		inset: 0;
		z-index: 59;
		border: 0;
		background: transparent;
		cursor: default;
	}
	.geui-cs {
		position: absolute;
		z-index: 60;
		display: flex;
		flex-direction: column;
		width: 264px;
		max-width: calc(100% - 16px);
		max-height: 360px;
		border: 1px solid var(--border, #e4e4e7);
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--popover, #fff) 95%, transparent);
		color: var(--popover-foreground, var(--foreground, #18181b));
		box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
		backdrop-filter: blur(4px);
		animation: geui-pop 0.15s ease-out;
	}
	@keyframes geui-pop {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
	}
	.geui-cs-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--border, #e4e4e7);
	}
	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--muted-foreground, #71717a);
	}
	.x {
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
	.x:hover {
		color: var(--foreground, #18181b);
	}
	.geui-cs-search {
		padding: 0.375rem 0.5rem;
	}
	.geui-cs-search input {
		box-sizing: border-box;
		width: 100%;
		height: 2rem;
		padding: 0 0.625rem;
		border: 1px solid var(--input, #e4e4e7);
		border-radius: 0.5rem;
		background: var(--geui-input-bg, var(--background, #fff));
		color: inherit;
		font: inherit;
		font-size: 0.8rem;
	}
	.geui-cs-search input:focus {
		outline: 2px solid var(--ring, #d6336c);
		outline-offset: 0;
	}
	.geui-cs-list {
		flex: 1;
		overflow-y: auto;
		padding: 0 0.5rem 0.5rem;
	}
	.geui-cs-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 2rem;
		padding: 0.375rem 0.5rem;
		border: 0;
		border-radius: 0.5rem;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.geui-cs-item:hover,
	.geui-cs-item:focus-visible {
		background: var(--accent, #f4f4f5);
	}
	.dot {
		flex-shrink: 0;
		width: 8px;
		height: 8px;
		border-radius: 999px;
	}
	.dot.hollow {
		border: 1px solid var(--border, #d4d4d8);
	}
	.label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.75rem;
		font-weight: 500;
	}
	.outs {
		display: flex;
		flex-shrink: 0;
		gap: 2px;
	}
	.out {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		opacity: 0.6;
	}
	.none {
		padding: 1rem 0;
		text-align: center;
		font-size: 0.75rem;
		color: var(--muted-foreground, #71717a);
	}
	@media (pointer: coarse) {
		.geui-cs-item {
			min-height: 44px;
		}
		.geui-cs-search input {
			height: 44px;
			font-size: 16px;
		}
	}
</style>
