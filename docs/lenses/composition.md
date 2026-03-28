# Lens Composition

## `inverseLens`

Compute the inverse of a lens by swapping source↔target and inverting each rule.

```ts
import { inverseLens } from 'relational-text/lens'

const htmlToMarkdown = inverseLens(markdownToHtml)
// source: 'org.w3c.html.facet'
// target: 'org.commonmark.facet'
// rules: [
//   { match: { name: 'em' },     replace: { name: 'emphasis' } },
//   { match: { name: 'strong' }, replace: { name: 'strong' } },
//   ...
// ]
```

### Invertible lenses

A lens is invertible when:
- No rule has `replace: null` (dropping features is lossy)
- No rule uses `rule.sql` (SQL is opaque to the inversion algorithm)
- No rule uses `rule.join` (joins cannot be statically reversed)
- No rule's `replace.name` is a template (e.g. `{ "template": "h{level}" }`)
- It is not a WASM lens

Attempting to invert a non-invertible lens throws `LensInversionError`:

```ts
import { inverseLens, LensInversionError } from 'relational-text/lens'

try {
  const inv = inverseLens(lossyLens)
} catch (e) {
  if (e instanceof LensInversionError) {
    console.error('Lens is not invertible:', e.message)
  }
}
```

## Intentionally One-Way Lenses

Some lenses are one-way by design — they use `dropAttrs`, `rule.sql`, `rule.join`, or template names and can never be inverted. Mark them with `"invertible": false` in the JSON so callers get a clear error rather than relying on runtime introspection.

::: details Example: JOIN rule for mention extraction

```json
{
  "$type": "org.relationaltext.lens",
  "id": "org.joinmastodon.to.relationaltext.v1",
  "source": "org.joinmastodon.facet",
  "target": "org.relationaltext.facet",
  "invertible": false,
  "rules": [
    {
      "join": {
        "primary": { "name": "span", "matchAttrs": { "class": "h-card" } },
        "joined":  [{ "name": "a", "alias": "link_feat", "required": false }],
        "produce": {
          "typeId": "org.joinmastodon.facet",
          "name":   { "from": "literal", "value": "mention" },
          "attrs":  {
            "href":   { "from": "joinedAttr", "alias": "link_feat", "attr": "href" },
            "handle": { "from": "text", "transform": { "ops": [{ "op": "ltrim", "chars": "@" }] } }
          }
        },
        "deleteMatched": ["span", "a"]
      }
    }
  ]
}
```

:::

When `"invertible": false` is present, `inverseLens` throws `LensInversionError` immediately without inspecting the individual rules. This makes the intent explicit in the lens definition itself and lets tools skip attempting inversion without having to analyze the rule set.

::: info When to set `invertible: false`
You do not need to set this flag — `inverseLens` would throw regardless if any non-invertible rule is present. Setting it is a documentation convention that communicates intent. Register tools and `registerLens` will also display a clearer warning when they encounter an explicitly one-way lens.
:::

### Attribute inversion

Attribute operations compose correctly across inversion:

| Forward | Inverse | Why |
|---------|---------|-----|
| `renameAttrs: { uri: href }` | `renameAttrs: { href: uri }` | reversible — just swap keys |
| `addAttrs: { list: 'ul' }` | `dropAttrs: ['list']` | the inverse drops the added attr |
| `dropAttrs: ['handle']` | Cannot invert (lossy) | cannot invert — original value is lost |

### Auto-registration

`registerLens` automatically registers both the lens and its inverse (if invertible):

```ts
import { registerLens } from 'relational-text/lens'

registerLens(markdownToHtml, { autoApply: true })
// Registers: org.commonmark.facet → org.w3c.html.facet
// Also registers: org.w3c.html.facet → org.commonmark.facet (inverse)
```

## `composeLenses`

Compose two lenses A→B and B→C into a single A→C lens.

```ts
import { composeLenses } from 'relational-text/lens'

// GFM → CommonMark → HTML  becomes  GFM → HTML
const gfmToHtml = composeLenses(gfmToCommonmark, commonmarkToHtml)
```

Returns `null` if `first.target !== second.source` (incompatible lenses).

### Attribute composition

Attribute operations compose transitively:

- `renameAttrs: { a: b }` ∘ `renameAttrs: { b: c }` = `renameAttrs: { a: c }`
- `addAttrs: { k: v }` in first combined with `dropAttrs: [k]` in second = no-op

### `matchAttrs` fan-out

When multiple rules in the second lens match the same feature name but differ by `matchAttrs`, `composeLenses` generates one composed rule per match. See [Lens Graph](/lenses/graph) for how this interacts with multi-hop path resolution.

## Example: Multi-hop path

Build a three-step conversion without intermediate documents:

```ts
import { from } from 'relational-text'
import { findLens, applyLens } from 'relational-text/lens'
import { ensureHtmlLexicon } from 'relational-text/html'

// Register the HTML lexicon so the lens graph has a path to HTML.
// The markdown lexicon is registered automatically by from('markdown', ...).
ensureHtmlLexicon()

// The graph finds the path: GFM → RT hub → CommonMark → HTML
const gfmToHtml = findLens('org.gfm.facet', 'org.w3c.html.facet')!

const doc = from('markdown', '~~strikethrough~~ and **bold**')
const transformed = applyLens(doc.toJSON(), gfmToHtml)
// All features in org.w3c.html.facet namespace
```

## `applyLensAsync`

For lenses with a `wasmModule`, use the async variant:

```ts
import { applyLensAsync } from 'relational-text/lens'

const result = await applyLensAsync(doc.toJSON(), lensWithWasmModule)
```

`applyLensAsync` delegates to the synchronous `applyLens` for declarative lenses and only invokes the WASM module when `spec.wasmModule` is present.

For how lenses are registered into the graph, how multi-hop paths are resolved, and how `autoTransform` works, see [Lens Graph](/lenses/graph).
