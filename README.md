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
/>
```

- **Catalogue**: what `NodeRegistry::catalog_json()` returns. Declared `fields` (text, long text, number, yes/no, choice, rows) drive the settings panel; kinds marked `dynamic` get their ports from `resolvePorts`.
- **Graph**: the engine's document (`nodes`, `edges`, `next_id`), plus `viewport` and `edge_vias` (up to two bends per wire), kept in the document.
- **Live**: node ids `running`, `done`, `failed` light the canvas while a run happens.
- **Extensions**: `fieldEditor(node, field)` returns a component for fields a product draws itself (an account picker, a camera picker); `titleOf`, `portLabel` and `messages` localise.
- **Theme**: shadcn CSS variables (`--primary`, `--border`, `--card`, `--muted`, `--foreground`, `--destructive`, `--radius`…), plus `--geui-exec`, `--geui-canvas`, `--geui-grid`.

## Gestures

Two fingers pinch and pan anywhere. One finger follows the tool: **Move** (drag nodes, marquee-select, drag a wire to bend it), **Pan**, **Link** (tap an output, then an input), **Cut** (tap a wire to remove it). Delete/Backspace removes the selection; Escape cancels a wire.

## Develop

`pnpm dev` (playground), `pnpm test`, `pnpm check`, `pnpm run prepack` (builds `dist/`).

MIT licensed.
