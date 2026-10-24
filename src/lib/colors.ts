// Port and category colours, and the glyph each node family wears. Ports are coloured by type so a
// wire reads as what it carries; the palette is categorical and does not change with light/dark
// themes. The defaults are the Olhar AI editor's, keyed by the engine's (English) category names; a
// product that translates its catalogue passes the same maps under its own names.

import type { IconName } from './icons.js';

export const PORT_COLORS: Record<string, string> = {
	exec: 'var(--geui-exec, #6b6b6b)',
	text: '#60a5fa',
	texts: '#93c5fd',
	num: '#34d399',
	numbers: '#6ee7b7',
	bool: '#fbbf24',
	json: '#c084fc',
	list: '#fb923c',
	dictionary: '#2dd4bf',
	table: '#5eead4',
	table_rows: '#5eead4',
	table_row: '#99f6e4',
	table_column: '#5eead4',
	table_cell: '#99f6e4',
	schema: '#14b8a6',
	file: '#fb923c',
	file_ref: '#fdba74',
	image: '#f472b6',
	block: '#c4b5fd',
	scalar: '#94a3b8',
	any: '#94a3b8'
};

export function portColor(type: string): string {
	return PORT_COLORS[type] ?? PORT_COLORS.any;
}

/** Events, sent and listened to: they pop in red, with a stronger header. */
export const EVENT_COLOR = '#f43f5e';

export const CATEGORY_COLORS: Record<string, string> = {
	Triggers: EVENT_COLOR,
	Events: EVENT_COLOR,
	AI: '#818cf8',
	Approval: '#fbbf24',
	Control: '#94a3b8',
	Logic: '#94a3b8',
	Network: '#22d3ee',
	Text: '#34d399',
	Math: '#34d399',
	Money: '#fbbf24',
	Dates: '#38bdf8',
	Debug: '#a1a1aa',
	Output: '#fb923c',
	Report: '#c4b5fd',
	Data: '#5eead4',
	Tables: '#5eead4',
	Variables: '#94a3b8',
	Utility: '#94a3b8'
};

export const CATEGORY_ICONS: Record<string, IconName> = {
	Triggers: 'zap',
	Events: 'zap',
	AI: 'sparkles',
	Approval: 'shield-check',
	Control: 'waypoints',
	Logic: 'binary',
	Network: 'globe',
	Text: 'type',
	Math: 'calculator',
	Money: 'wallet',
	Dates: 'calendar',
	Debug: 'bug',
	Output: 'send',
	Report: 'file-text',
	Data: 'database',
	Tables: 'table-2',
	Variables: 'variable',
	Utility: 'waypoints'
};

/** Kinds that are events whatever their category says: the red, the glyph, the stronger header. */
export const EVENT_KINDS = new Set(['on_event', 'emit_event']);

const SLATE = '#64748b';

/** A category's colour: the product's map, then the defaults, then slate. */
export function categoryColor(category: string, overrides: Record<string, string> = {}): string {
	return overrides[category] ?? CATEGORY_COLORS[category] ?? SLATE;
}

/** A category's glyph: the product's map, then the defaults, then a box. */
export function categoryIcon(category: string, overrides: Record<string, IconName> = {}): IconName {
	return overrides[category] ?? CATEGORY_ICONS[category] ?? 'box';
}
