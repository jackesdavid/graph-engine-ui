// The editor as a person uses it: tap a kind in the palette, a node appears; tap the node, its
// settings open. Runs in jsdom (no layout), which is enough for the wiring between the pieces.
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import FlowEditor from './FlowEditor.svelte';
import type { Catalog, GraphDoc } from '../types.js';

const catalog: Catalog = {
	kinds: [
		{
			slug: 'reply',
			label: 'Reply to the form',
			category: 'Replies',
			inputs: [{ name: 'exec_in', type: 'exec', required: false }, { name: 'message', type: 'text', required: false }],
			outputs: [],
			default_config: { status: 'ok' },
			fields: [{ key: 'status', label: 'Status', required: true, kind: 'choice', options: ['ok', 'error'] }]
		}
	]
};

describe('FlowEditor', () => {
	it('adds the tapped kind to the graph and shows its settings when the node is tapped', async () => {
		let graph: GraphDoc = { nodes: [], edges: [] };
		const changes: GraphDoc[] = [];
		render(FlowEditor, { props: { graph, catalog, onchange: (g: GraphDoc) => changes.push(g) } });

		await fireEvent.click(screen.getAllByRole('button', { name: 'Add node' })[0]);
		await fireEvent.click(screen.getByRole('button', { name: /Reply to the form/ }));
		flushSync();

		const body = document.querySelector('.geui-body');
		expect(body, 'the node is drawn').not.toBeNull();
		expect(screen.getByText(/Reply to the form added/)).toBeTruthy();
		expect(changes.at(-1)?.nodes.map((n) => n.kind)).toEqual(['reply']);

		await fireEvent.pointerDown(body!, { pointerId: 1, clientX: 10, clientY: 10 });
		await fireEvent.pointerUp(document.querySelector('.geui-canvas')!, { pointerId: 1, clientX: 11, clientY: 10 });
		flushSync();
		expect(screen.getByLabelText(/Status/)).toBeTruthy();
		expect(document.querySelector('.geui-side.open')).not.toBeNull();
	});
});
