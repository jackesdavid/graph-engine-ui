// The shapes the editor reads and writes. They mirror the engine's own serialisation (the graph
// document and `NodeRegistry::catalog_json`), so a product hands over what its API already returns.

/** A port as the catalogue describes it. `exec` ports carry control flow, not data. */
export type CatalogPort = {
	name: string;
	type: string;
	required: boolean;
	/** `scalar` | `list` | `unique` (when the engine sends it). */
	family?: string;
	/** This port asks for a family, so any member of it fits. */
	accepts_family?: boolean;
	about?: string;
};

/** A declared configuration field (the engine's `Fields`): what the inspector draws. */
export type CatalogField = {
	key: string;
	label: string;
	required: boolean;
	kind: 'text' | 'long_text' | 'num' | 'bool' | 'choice' | 'rows';
	options?: string[];
	/** For `rows`: the columns of each row. */
	fields?: CatalogField[];
};

export type CatalogKind = {
	slug: string;
	label: string;
	category: string;
	inputs: CatalogPort[];
	outputs: CatalogPort[];
	default_config: Record<string, unknown>;
	about?: string;
	/** The kind's ports depend on its configuration: ask `resolvePorts` for a configured node. */
	dynamic?: boolean;
	/** A chain can begin here (a trigger). */
	can_start?: boolean;
	fields?: CatalogField[];
};

export type Catalog = { kinds: CatalogKind[] };

export type GraphNode = {
	id: number;
	kind: string;
	x: number;
	y: number;
	config: Record<string, unknown>;
};

export type GraphEdge = { from: number; from_port: string; to: number; to_port: string };

export type Point = { x: number; y: number };

/** The graph document. Unknown top-level fields (a product's metadata) are preserved. */
export type GraphDoc = {
	id?: string;
	name?: string;
	nodes: GraphNode[];
	edges: GraphEdge[];
	next_id?: number;
	/** Where the canvas was looking, so reopening a flow lands in the same place. */
	viewport?: { x: number; y: number; zoom: number };
	/** Up to two bend points per wire, keyed by `edgeKey`. */
	edge_vias?: Record<string, Point[]>;
	[extra: string]: unknown;
};

/** Ports a configured node actually has, as the product's server resolves them. */
export type ResolvedPorts = { inputs: CatalogPort[]; outputs: CatalogPort[] };

/** What is running right now, to light the canvas up. */
export type LiveState = {
	/** Nodes executing now. */
	running?: number[];
	/** Nodes that finished in the current/last run. */
	done?: number[];
	/** Nodes that failed. */
	failed?: number[];
};

/** Every piece of text the editor shows. English by default; a product passes its language. */
export type Messages = {
	move: string;
	pan: string;
	link: string;
	cut: string;
	fit: string;
	zoomIn: string;
	zoomOut: string;
	addNode: string;
	search: string;
	noResults: string;
	inspector: string;
	nothingSelected: string;
	deleteNode: string;
	required: string;
	wired: string;
	addRow: string;
	removeRow: string;
	pickOutputFirst: string;
	incompatible: string;
	readOnly: string;
	settings: string;
	inputs: string;
	yes: string;
	no: string;
	close: string;
	/** "<node> added". */
	added: string;
};

export const ENGLISH: Messages = {
	move: 'Move',
	pan: 'Pan',
	link: 'Link',
	cut: 'Cut',
	fit: 'Fit',
	zoomIn: 'Zoom in',
	zoomOut: 'Zoom out',
	addNode: 'Add node',
	search: 'Search nodes…',
	noResults: 'No nodes match.',
	inspector: 'Properties',
	nothingSelected: 'Select a node to see its settings.',
	deleteNode: 'Delete node',
	required: 'required',
	wired: 'comes from a wire',
	addRow: 'Add row',
	removeRow: 'Remove',
	pickOutputFirst: 'Tap an output first, then the input to connect it to.',
	incompatible: 'These ports carry different types.',
	readOnly: 'Read only',
	settings: 'Settings',
	inputs: 'Inputs',
	yes: 'Yes',
	no: 'No',
	close: 'Close',
	added: 'added'
};

export type Tool = 'move' | 'pan' | 'link' | 'cut';
