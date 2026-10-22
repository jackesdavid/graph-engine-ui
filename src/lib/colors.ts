// Port and category colours. Ports are coloured by type so a wire reads as what it carries; the
// palette is categorical and does not change with light/dark themes.

export const PORT_COLORS: Record<string, string> = {
	exec: 'var(--geui-exec, #a1a1aa)',
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
	file: '#f97316',
	file_ref: '#fdba74',
	image: '#f472b6',
	block: '#c4b5fd',
	scalar: '#94a3b8',
	any: '#94a3b8'
};

export function portColor(type: string): string {
	return PORT_COLORS[type] ?? PORT_COLORS.any;
}

const CATEGORY_PALETTE = ['#f43f5e', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f97316'];

/** A stable colour per category: from the product's map, otherwise picked by the name's hash. */
export function categoryColor(category: string, overrides: Record<string, string> = {}): string {
	if (overrides[category]) return overrides[category];
	let h = 0;
	for (const c of category) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length];
}
