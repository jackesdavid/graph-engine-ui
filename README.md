# graph-engine-ui

A touch-first, themeable Svelte 5 editor for [graph-engine](https://github.com/jackesdavid/graph-engine) flows. Product-agnostic: it knows the engine's catalogue and graph document, nothing about any domain.

## Use

```svelte
<script lang="ts">
  import { FlowEditor, type Catalog, type GraphDoc } from 'graph-engine-ui';
  let { catalog, graph }: { catalog: Catalog; graph: GraphDoc } = $props();
</script>

<FlowEditor
  bind:graph
  {catalog}
  resolvePorts={(kind, config) => api.ports(kind, config)}
  live={{ running: [3] }}
  messages={{ move: 'Mover', ... }}
  onchange={(g) => saveDraft(g)}
  {toolbar}
  tabs={[{ id: 'runs', label: 'Runs', icon: 'history', content: runs }]}
/>

{#snippet toolbar()}<button onclick={publish}>Publish</button>{/snippet}
{#snippet runs()}…{/snippet}
```

**Layout** (the Olhar AI editor's): the canvas in a well with floating controls — *Add node* top left (a search menu; letting a wire go on the empty canvas opens it too, offering what the wire can feed and wiring the new node), the tools down the left edge, the product's `toolbar` top centre, zoom and *hide the panels* top right, and the wire hint or the selection's actions (duplicate, delete) bottom centre. Beside it, a resizable panel with tabs — *Properties* of the selected node, then the product's `tabs` — that folds to an icon rail. On a phone the panel is a drawer from the bottom and the toolbar moves to the bottom. `bind:tab` and `bind:focused` (panels hidden) are there for the product.

- **Catalogue**: what `NodeRegistry::catalog_json()` returns. Declared `fields` (text, long text, number, yes/no, choice, rows) drive the settings panel; kinds marked `dynamic` get their ports from `resolvePorts`.
- **Graph**: the engine's document (`nodes`, `edges`, `next_id`), plus `viewport` and `edge_vias` (up to two bends per wire), kept in the document.
- **Live**: node ids `running`, `done`, `failed` light the canvas while a run happens.
- **Extensions**: `fieldEditor(node, field)` returns a component for fields a product draws itself (an account picker, a camera picker); `titleOf`, `portLabel` and `messages` localise.
- **Families**: each node wears its category's colour and glyph (`CATEGORY_COLORS`, `CATEGORY_ICONS`, keyed by the engine's English names; events in red with a lightning bolt). A product that translates its catalogue passes `categoryColors` and `categoryIcons` under its own names. Icons are Lucide's, bundled as data (`ICONS`, `<Icon name=… />`).
- **Theme**: shadcn CSS variables (`--primary`, `--border`, `--card`, `--muted`, `--accent`, `--popover`, `--foreground`, `--destructive`…), plus `--geui-canvas`, `--geui-grid-strong`, `--geui-grid-weak`, `--geui-node-body`, `--geui-node-shadow`, `--geui-node-glow`, `--geui-port-empty`, `--geui-exec`, `--geui-hud`, `--geui-input-bg`, `--geui-active`, `--geui-font`.

## Gestures

Two fingers pinch and pan anywhere. One finger follows the tool: **Move** (drag nodes, marquee-select, drag a wire to bend it), **Pan**, **Link** (tap an output, then an input), **Cut** (tap a wire to remove it). Delete/Backspace removes the selection; ⌘D/Ctrl+D duplicates it; Escape cancels a wire; the backtick hides the panels.

## Develop

`pnpm dev` (playground), `pnpm test`, `pnpm check`, `pnpm run prepack` (builds `dist/`).

MIT licensed.
