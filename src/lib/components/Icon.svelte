<script lang="ts">
	// A Lucide icon from `icons.ts`. In HTML it is an <svg>; inside the canvas (`inside`) it is a
	// <g> at the given position, so a node can carry its glyph without leaving the SVG.
	import { ICONS, type IconName } from '../icons.js';

	type Props = { name: IconName; size?: number; stroke?: number; inside?: { x: number; y: number }; class?: string };
	let { name, size = 16, stroke = 2, inside, class: cls = '' }: Props = $props();
	const node = $derived(ICONS[name] ?? ICONS.box);
</script>

{#if inside}
	<g transform="translate({inside.x} {inside.y}) scale({size / 24})" fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" class={cls}>
		{#each node as [tag, attrs], i (i)}
			<svelte:element this={tag} xmlns="http://www.w3.org/2000/svg" {...attrs} />
		{/each}
	</g>
{:else}
	<svg
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		stroke-width={stroke}
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		class={cls}
	>
		{#each node as [tag, attrs], i (i)}
			<svelte:element this={tag} xmlns="http://www.w3.org/2000/svg" {...attrs} />
		{/each}
	</svg>
{/if}
