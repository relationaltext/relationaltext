# WASM Exports Reference

These are the raw functions exported by the `relationaltext_wasm` WASM module, re-exported from `relational-text/wasm`. All inputs and outputs are strings containing JSON, except where noted.

```ts
import {
  parse_document,
  detect_facets,
  insert_text,
  delete_text,
  add_mark,
  add_block,
  remove_mark,
  to_hir,
  filter_facets_by_namespace,
  register_feature_type,
  register_lexicon,
  apply_lens,
  apply_lens_traced,
  validate_lens_sql,
  inverse_lens,
  compose_lenses,
  find_path_in_graph,
  execute_facet_sql,
} from 'relational-text/wasm'
```

In practice, you should use the higher-level TypeScript wrappers (`Document`, `applyLens`, etc.) rather than calling these directly. The WASM functions are documented here for completeness and for consumers building alternative TypeScript wrappers.

---

## Document Operations

### `parse_document(docJson: string): string`

Normalize a document JSON string: validate, sort facets in canonical order, and remove zero-width facets.

- Input: JSON string encoding a `DocumentJSON` (camelCase fields)
- Output: Normalized JSON string

```ts
const normalized = parse_document('{"text":"Hello","facets":[]}')
```

---

### `insert_text(docJson: string, bytePos: number, text: string): string`

Insert text at `bytePos` in the document, adjusting all facet byte ranges. Expands marks with `expandStart`/`expandEnd` set.

- Input: normalized doc JSON, byte position, text to insert
- Output: updated normalized doc JSON

---

### `delete_text(docJson: string, byteStart: number, byteEnd: number): string`

Delete the byte range `[byteStart, byteEnd)` from the document, adjusting all facet byte ranges.

- Input: normalized doc JSON, start and end byte positions
- Output: updated normalized doc JSON

---

### `add_mark(docJson: string, byteStart: number, byteEnd: number, markJson: string): string`

Add an inline mark over `[byteStart, byteEnd)`. The mark JSON is a `MarkInput` object (without `$type`).

---

### `add_block(docJson: string, byteStart: number, byteEnd: number, blockJson: string): string`

Add a block feature over `[byteStart, byteEnd)`. The block JSON is a `BlockInput` object (without `$type`).

---

### `remove_mark(docJson: string, byteStart: number, byteEnd: number, typeKey: string): string`

Remove the feature matching `typeKey` from the facet at `[byteStart, byteEnd)`. `typeKey` is the compound key `"$type#name"` or just `"$type"` for features without a name.

- Input: normalized doc JSON, byte range, type key string
- Output: updated normalized doc JSON

```ts
const updated = remove_mark(doc._raw(), 0, 5, 'org.automerge.richtext.facet#bold')
```

---

### `to_hir(docJson: string): string`

Build the Hierarchical Intermediate Representation from a normalized document.

- Output: JSON string encoding `HIRNode[]`

---

## Feature Detection

### `detect_facets(text: string, mentionTypeId: string, linkTypeId: string, tagTypeId: string): string`

Auto-detect `@mentions`, URLs, and `#tags` in a plain text string.

- `mentionTypeId` — `$type` to use for mention features
- `linkTypeId` — `$type` to use for link features
- `tagTypeId` — `$type` to use for tag features

Output is a JSON string encoding an array of raw facet objects. Mentions store `handle` (not `did`) — callers map `handle → did` in post-processing.

The TypeScript `detectFacets()` in `bluesky.ts` calls this with ATProto type IDs and maps `handle → at://handle`.

---

## Namespace Filtering

### `filter_facets_by_namespace(docJson: string, namespace: string): string`

Filter a document's facets to only those whose `$type` starts with `namespace`.

- Output: JSON string encoding `FacetJSON[]` (not a full doc)

Used by `toBluesky()` to strip extended features and return only `app.bsky.richtext.facet` features.

```ts
const filteredFacets = filter_facets_by_namespace(doc._raw(), 'app.bsky.richtext.facet')
```

---

## Lexicon Registration

The WASM lexicon registry is thread-local and starts empty. Register lexicons before parsing or rendering.

### `register_feature_type(descriptorJson: string): void`

Register a single feature type. The descriptor is a JSON string with fields:

```json
{
  "typeId": "com.example.highlight",
  "featureClass": "inline",
  "expandStart": true,
  "expandEnd": true
}
```

### `register_lexicon(lexiconJson: string): void`

Bulk-register feature types from a `community.lexicon.format-lexicon` JSON blob. This is the format used by the lexicon JSON files in `src/lexicons/`.

---

## Lens Operations

All lens functions accept and return JSON strings.

### `apply_lens(docJson: string, lensJson: string): string`

Apply a `LensSpec` to all features in a document.

- Input: normalized doc JSON, `LensSpec` JSON
- Output: transformed doc JSON

### `apply_lens_traced(docJson: string, lensJson: string): string`

Apply a `LensSpec` and return both the transformed document and a per-rule trace in a single JSON object.

- Input: normalized doc JSON, `LensSpec` JSON
- Output: JSON string encoding `{ document: string, trace: TraceEntry[] }`

```ts
const raw = apply_lens_traced(doc._raw(), JSON.stringify(myLens))
const { document, trace } = JSON.parse(raw)
// trace[0] → { ruleIndex: 0, matched: 2, action: "emphasis → em", isSql: false }
```

The `document` field is a normalized doc JSON string (same format as `apply_lens` output). The `trace` array has one entry per rule evaluated; see `TraceEntry` in the [TypeScript API](./typescript#applylensdebug-doc-documentjson-spec-lensspec-lensdebugresult).

### `validate_lens_sql(lensJson: string): string`

Parse every `sql` rule in the lens and report syntax errors. Does not execute anything.

- Input: `LensSpec` JSON
- Output: JSON string encoding `Array<{ ruleIndex: number, message: string }>`; empty array if all SQL is valid

```ts
const errorsJson = validate_lens_sql(JSON.stringify(myLens))
const errors = JSON.parse(errorsJson)
// errors[0] → { ruleIndex: 3, message: "near \"FORM\": syntax error" }
```

### `inverse_lens(lensJson: string): string`

Compute the inverse of a lens (swap source/target, invert rules).

- Throws if any rule has `replace: null` (lossy) or if it's a WASM lens

### `compose_lenses(firstJson: string, secondJson: string): string | null`

Compose two lenses A→B and B→C into A→C.

- Returns null (as a JavaScript null, not a JSON string) if targets/sources don't align

### `find_path_in_graph(specsJson: string, sourceNs: string, targetNs: string): string | null`

BFS shortest-path search through a list of `LensSpec` objects.

- `specsJson` — JSON array of `LensSpec` objects representing the graph edges
- Returns composed `LensSpec` JSON, or null if no path exists

---

## SQL Engine

### `execute_facet_sql(docJson: string, sql: string): string`

Execute one or more SQL statements against the document's virtual `features` table.

- Input: normalized doc JSON, SQL string (multiple statements separated by `;`)
- Output: transformed doc JSON

See [SQL Engine](../sql-engine/) for the virtual table schema and available custom functions.
