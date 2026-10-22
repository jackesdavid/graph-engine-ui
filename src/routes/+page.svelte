<script lang="ts">
	// Playground: the editor over a small catalogue, to try it by hand (`pnpm dev`).
	import { FlowEditor, type Catalog, type GraphDoc } from '#lib';

	const catalog: Catalog = {
		kinds: [
			{
				slug: 'on_command', label: 'When a form is sent', category: 'Triggers', can_start: true,
				inputs: [], outputs: [{ name: 'exec_out', type: 'exec', required: false }, { name: 'amount', type: 'num', required: false }, { name: 'note', type: 'text', required: false }],
				default_config: { command: '' }, about: 'Starts when someone sends a form.'
			},
			{
				slug: 'allocate', label: 'Allocate', category: 'Money',
				inputs: [{ name: 'amount', type: 'num', required: true }, { name: 'total', type: 'num', required: false }],
				outputs: [{ name: 'legs', type: 'list', required: false }],
				default_config: { legs: [], partial: 'priority' },
				fields: [
					{ key: 'legs', label: 'Legs', required: true, kind: 'rows', fields: [
						{ key: 'label', label: 'Label', required: true, kind: 'text' },
						{ key: 'mode', label: 'Mode', required: true, kind: 'choice', options: ['percent', 'fixed', 'input', 'rest'] },
						{ key: 'value', label: 'Value', required: false, kind: 'num' }
					] },
					{ key: 'partial', label: 'Partial payment', required: true, kind: 'choice', options: ['priority', 'proportional'] }
				],
				about: 'Splits an amount into legs that add up exactly.'
			},
			{
				slug: 'if', label: 'Branch', category: 'Control',
				inputs: [{ name: 'exec_in', type: 'exec', required: false }, { name: 'condition', type: 'bool', required: true }],
				outputs: [{ name: 'true', type: 'exec', required: false }, { name: 'false', type: 'exec', required: false }],
				default_config: {}
			},
			{
				slug: 'reply', label: 'Reply to the form', category: 'Replies',
				inputs: [{ name: 'exec_in', type: 'exec', required: false }, { name: 'message', type: 'text', required: false }],
				outputs: [], default_config: { status: 'ok', message: 'Done.' }
			}
		]
	};

	let graph = $state<GraphDoc>({
		nodes: [
			{ id: 1, kind: 'on_command', x: 40, y: 80, config: { command: 'receive' } },
			{ id: 2, kind: 'allocate', x: 320, y: 140, config: { legs: [{ label: 'material', mode: 'input', value: '' }, { label: 'main', mode: 'rest', value: '' }], partial: 'priority' } },
			{ id: 3, kind: 'reply', x: 600, y: 60, config: { status: 'ok', message: 'Received.' } }
		],
		edges: [
			{ from: 1, from_port: 'exec_out', to: 3, to_port: 'exec_in' },
			{ from: 1, from_port: 'amount', to: 2, to_port: 'amount' }
		],
		next_id: 4
	});
	let running = $state<number[]>([]);
</script>

<main>
	<header>
		<h1>graph-engine-ui</h1>
		<button onclick={() => (running = running.length ? [] : [1])}>Toggle live</button>
	</header>
	<div class="frame">
		<FlowEditor bind:graph {catalog} live={{ running }} />
	</div>
	<pre>{JSON.stringify(graph, null, 1).slice(0, 600)}</pre>
</main>

<style>
	:global(body) {
		margin: 0;
		font-family: system-ui, sans-serif;
	}
	main {
		padding: 1rem;
	}
	header {
		display: flex;
		gap: 1rem;
		align-items: center;
	}
	.frame {
		height: 70vh;
	}
</style>
