// The editor as a person uses it: tap a kind in the palette, a node appears; tap the node, its
// settings open. Runs in jsdom (no layout), which is enough for the wiring between the pieces.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
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
	afterEach(cleanup);

	it('adds the tapped kind to the graph and shows its settings when the node is tapped', async () => {
		let graph: GraphDoc = { nodes: [], edges: [] };
		const changes: GraphDoc[] = [];
		// Reactive, like an app that loaded the catalogue into $state.
		const live = $state(catalog);
		render(FlowEditor, { props: { graph, catalog: live, onchange: (g: GraphDoc) => changes.push(g) } });

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

	it('shows the settings a configured node really has: a second dropdown, labelled and grouped', async () => {
		const trigger: Catalog = {
			kinds: [
				{
					slug: 'on_event',
					label: 'When Event',
					category: 'Triggers',
					inputs: [],
					outputs: [{ name: 'exec_out', type: 'exec', required: false }],
					default_config: { event: '' },
					dynamic: true,
					fields: [{ key: 'event', label: 'Event', required: true, kind: 'choice', options: [] }]
				}
			]
		};
		const graph: GraphDoc = { nodes: [{ id: 1, kind: 'on_event', x: 0, y: 0, config: { event: 'form.submitted' } }], edges: [] };
		const resolvePorts = async () => ({
			inputs: [],
			outputs: [{ name: 'exec_out', type: 'exec', required: false }],
			fields: [
				{
					key: 'event',
					label: 'Event',
					required: true,
					kind: 'choice' as const,
					options: ['form.submitted', 'payment.registered'],
					choices: [
						{ value: 'form.submitted', label: 'Form sent', group: 'Forms' },
						{ value: 'payment.registered', label: 'Payment registered', group: 'Finance' }
					]
				},
				{ key: 'form', label: 'Form', required: true, kind: 'choice' as const, options: ['pay'], choices: [{ value: 'pay', label: 'Pay a bill' }] }
			]
		});
		render(FlowEditor, { props: { graph, catalog: trigger, resolvePorts } });
		await new Promise((r) => setTimeout(r, 0));
		flushSync();

		const body = document.querySelector('.geui-body');
		await fireEvent.pointerDown(body!, { pointerId: 1, clientX: 10, clientY: 10 });
		await fireEvent.pointerUp(document.querySelector('.geui-canvas')!, { pointerId: 1, clientX: 11, clientY: 10 });
		flushSync();

		const event = screen.getByLabelText(/Event/) as HTMLSelectElement;
		expect(event.value).toBe('form.submitted');
		expect([...event.querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['Forms', 'Finance']);
		expect(screen.getByRole('option', { name: 'Form sent' })).toBeTruthy();
		const form = screen.getByLabelText(/Form \*/) as HTMLSelectElement;
		// Nothing chosen yet: an empty entry rather than silently showing the first form.
		expect(form.value).toBe('');
		expect(screen.getByRole('option', { name: 'Pay a bill' })).toBeTruthy();
	});

	it('lets a wire go on the empty canvas: the menu offers what it can feed, and the new node arrives wired', async () => {
		const kinds: Catalog = {
			kinds: [
				{
					slug: 'on_command',
					label: 'When a form is sent',
					category: 'Triggers',
					inputs: [],
					outputs: [{ name: 'exec_out', type: 'exec', required: false }],
					default_config: {}
				},
				...catalog.kinds
			]
		};
		const graph: GraphDoc = { nodes: [{ id: 1, kind: 'on_command', x: 0, y: 0, config: {} }], edges: [] };
		const changes: GraphDoc[] = [];
		render(FlowEditor, { props: { graph, catalog: kinds, onchange: (g: GraphDoc) => changes.push(g) } });

		const out = [...document.querySelectorAll('.geui-hit')].at(-1)!;
		await fireEvent.pointerDown(out, { pointerId: 1, clientX: 180, clientY: 13 });
		flushSync();
		expect(screen.getByText(/Wiring from #1.exec_out/)).toBeTruthy();
		await fireEvent.pointerDown(document.querySelector('.geui-canvas')!, { pointerId: 2, clientX: 300, clientY: 40 });
		flushSync();

		expect(screen.getByRole('dialog', { name: 'Connect to…' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /Reply to the form/ }));
		flushSync();
		const last = changes.at(-1)!;
		expect(last.nodes.map((n) => n.kind)).toEqual(['on_command', 'reply']);
		expect(last.edges).toEqual([{ from: 1, from_port: 'exec_out', to: 2, to_port: 'exec_in' }]);
	});

	it('duplicates and deletes the selection from the bar at the bottom', async () => {
		const graph: GraphDoc = { nodes: [{ id: 1, kind: 'reply', x: 0, y: 0, config: { status: 'ok' } }], edges: [] };
		const changes: GraphDoc[] = [];
		render(FlowEditor, { props: { graph, catalog, onchange: (g: GraphDoc) => changes.push(g) } });
		await fireEvent.pointerDown(document.querySelector('.geui-body')!, { pointerId: 1, clientX: 10, clientY: 10 });
		await fireEvent.pointerUp(document.querySelector('.geui-canvas')!, { pointerId: 1, clientX: 10, clientY: 10 });
		flushSync();
		expect(screen.getByText('1 selected')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: /Duplicate/ }));
		flushSync();
		expect(changes.at(-1)!.nodes.map((n) => n.id)).toEqual([1, 2]);
		await fireEvent.click(screen.getByRole('button', { name: /Delete \(/ }));
		flushSync();
		expect(changes.at(-1)!.nodes.map((n) => n.id)).toEqual([1]);
	});
});
