# Lens Graph

The lens graph is a directed graph where nodes are lexicon namespaces and edges are lenses. It enables automatic multi-hop conversion and lazy `autoApply` transformations.

## `LensGraph` Class

```ts
class LensGraph {
  register(spec: LensSpec, opts?: { autoApply?: boolean }): void
  findPath(sourceNs: string, targetNs: string): LensSpec | null
  autoTransform(jsonStr: string, targetNs: string): string
}
```

A global singleton is exported:

```ts
import { lensGraph } from 'relational-text/lens'
```

### `register`

Add a lens edge to the graph. Clears the path cache.

```ts
lensGraph.register(myLens, { autoApply: true })
```

### `findPath`

BFS shortest-path search from `sourceNs` to `targetNs`. Returns a composed `LensSpec` covering all intermediate hops, or `null` if no path exists. Returns an identity lens when `sourceNs === targetNs`.

Results are cached (cache is cleared on `register`).

```ts
const lens = lensGraph.findPath('org.gfm.facet', 'org.w3c.html.facet')
// GFM → RT hub → HTML (two-hop composed lens)
```

### `autoTransform`

Apply all `autoApply: true` lenses that can reach `targetNs` to a raw document JSON string.

```ts
const transformedJson = lensGraph.autoTransform(rawJson, 'org.w3c.html.facet')
```

This is what `to('html', ...)` and `to('markdown', ...)` call internally. A document containing a mix of namespaces (e.g., `org.gfm.facet` features inside a `org.commonmark.facet` document) will have all convertible namespaces transformed to the target in a single pass.

**Namespace fast-path**: `autoTransform` inspects the document's actual feature namespaces before applying any lens. If a `passthrough: drop` lens targets a source namespace that is *not present* in the document, that lens is skipped entirely. This prevents cross-format features from being silently erased when a document produced by one format passes through an exporter for a different format.

```ts
import { from, to } from 'relational-text/registry'

// A Mastodon document converted to HTML — the HTML→RT lens is autoApply,
// but it uses passthrough:drop for unknown HTML elements. Without the fast-path,
// applying HTML→RT to a document that contains no org.w3c.html.facet features
// would do nothing, but a naive implementation could drop features.
// With the fast-path, the HTML→RT lens is never invoked at all.
const mastodonDoc = from('mastodon', 'Hello <strong>world</strong> @alice')
const html = to('html', mastodonDoc) // fast-path skips HTML→RT, applies Mastodon→RT→HTML
```

## Module-Level Functions

### `registerLens`

Register a lens with the global lens graph. Automatically registers the inverse lens if the lens is invertible (no `replace: null` rules). Both forward and inverse receive the same `autoApply` setting.

```ts
import { registerLens } from 'relational-text/lens'

registerLens(myLens, { autoApply: true })
```

### `findLens`

Find the shortest registered transformation path between two namespaces.

```ts
import { findLens } from 'relational-text/lens'

const lens = findLens('org.gfm.facet', 'org.w3c.html.facet')
if (lens) {
  const result = applyLens(doc.toJSON(), lens)
}
```

### `transformDocument`

Transform a document from one namespace to another using the shortest registered path. Returns `null` if no path is registered.

```ts
import { transformDocument } from 'relational-text/lens'

const htmlDoc = transformDocument(doc.toJSON(), 'org.commonmark.facet', 'org.w3c.html.facet')
if (!htmlDoc) {
  throw new Error('No lens path available')
}
```

## How Lenses Enter the Graph

Lenses are registered lazily. Every format module calls `ensureXxxLexicon()` internally when `from()` or `to()` is first called for that format. The first call registers the WASM lexicon and (where applicable) the format's lens into the global `lensGraph`. All subsequent calls are no-ops (guarded by a module-level flag).

This means: **importing a format module does not register its lens**. The lens is only registered when you first use `from()` or `to()` with that format.

For server applications processing many formats, pre-register all lenses at startup to avoid cold-start latency:

```ts
// server startup — register all lenses eagerly
import { ensureMastodonLexicon } from 'relational-text/mastodon'
import { ensureQuillLexicon }    from 'relational-text/quill'
import { ensureSlackLexicon }    from 'relational-text/slack'

ensureMastodonLexicon()
ensureQuillLexicon()
ensureSlackLexicon()

// Now lensGraph has all paths registered — no cold-start on first request
```

### `autoTransform` concrete example

`autoTransform` applies all `autoApply: true` lenses that can reach a target namespace. It is used internally by `to('html', ...)` and `to('markdown', ...)`.

Before:
```json
{
  "text": "\uFFFCHello world",
  "facets": [{
    "index": { "byteStart": 0, "byteEnd": 3 },
    "features": [{ "$type": "org.joinmastodon.facet", "name": "p", "parents": [], "attrs": {} }]
  }, {
    "index": { "byteStart": 3, "byteEnd": 8 },
    "features": [{ "$type": "org.joinmastodon.facet", "name": "strong" }]
  }]
}
```

```ts
import { ensureMastodonLexicon } from 'relational-text/mastodon'
ensureMastodonLexicon()  // registers mastodon → relationaltext lens with autoApply: true

const result = lensGraph.autoTransform(JSON.stringify(doc), 'org.commonmark.facet')
```

After (Mastodon features converted to CommonMark):
```json
{
  "text": "\uFFFCHello world",
  "facets": [{
    "index": { "byteStart": 0, "byteEnd": 3 },
    "features": [{ "$type": "org.commonmark.facet", "name": "paragraph", "parents": [], "attrs": {} }]
  }, {
    "index": { "byteStart": 3, "byteEnd": 8 },
    "features": [{ "$type": "org.commonmark.facet", "name": "strong" }]
  }]
}
```

## The `ensureXxxLexicon()` Pattern

Every format module exports an `ensureXxxLexicon()` function. This pattern:

1. Registers the WASM lexicon (feature classes and expand semantics)
2. Registers the format's lens with `autoApply: true`
3. Is idempotent — subsequent calls are no-ops

```ts
// From mastodon.ts:
let _mastodonRegistered = false

export function ensureMastodonLexicon(): void {
  if (_mastodonRegistered) return
  _mastodonRegistered = true
  register_lexicon(JSON.stringify(mastodonLexiconData))
  registerLens(mastodonToRelationaltextData, { autoApply: true })
}
```

The internal format functions both call `ensureMastodonLexicon()` at the top of their bodies, so lexicon and lens registration is transparent to callers of `from('mastodon', ...)` and `to('mastodon', doc)`.

## Graph Traversal Example

Given these registered lenses:

```
org.gfm.facet → org.relationaltext.facet          (GFM → RT hub)
org.relationaltext.facet → org.commonmark.facet    (RT hub → CommonMark)
org.commonmark.facet → org.relationaltext.facet    (CommonMark → RT hub)
org.relationaltext.facet → org.w3c.html.facet      (RT hub → HTML)
org.prosemirror.facet → org.relationaltext.facet   (ProseMirror → RT hub)
org.joinmastodon.facet → org.relationaltext.facet  (Mastodon → RT hub)
org.quilljs.delta.facet → org.relationaltext.facet (Quill → RT hub)
```

`findLens('org.gfm.facet', 'org.w3c.html.facet')` does a BFS:
1. `org.gfm.facet` → `org.relationaltext.facet` (1 hop)
2. `org.relationaltext.facet` → `org.w3c.html.facet` (2 hops)

All paths go through the `org.relationaltext.facet` hub. Returns a composed lens covering both steps, transparent to the caller.

```ts
// Quill → HTML in one step (graph finds the path automatically)
import { from, to } from 'relational-text/registry'

const doc = from('quill', quillJson)
const html = to('html', doc)  // Quill → RT hub → HTML, fully automatic
```

## Path Cache

`findPath` caches results. The cache is invalidated whenever `register` is called. In long-running server applications, register all lenses at startup to avoid cache invalidation in the hot path.
