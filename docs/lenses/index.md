# Lenses

A **lens** is a declarative, bidirectional transformation between two feature namespaces. Lenses let you convert a document's features from one format's namespace to another without writing custom parsing or rendering code.

## What Problem Do Lenses Solve?

Every format stores its features under its own namespace:
- CommonMark uses `org.commonmark.facet#strong`
- HTML uses `org.w3c.html.facet#strong`
- Mastodon uses `org.joinmastodon.facet#strong`

When you call `to('html', from('markdown', ...))`, the HTML renderer must know that `org.commonmark.facet#emphasis` maps to `<em>`. Rather than hardcoding every possible pair, lenses express these mappings as data — JSON objects that can be stored, shared, inverted, and composed.

## LensSpec

```ts
interface LensSpec {
  readonly $type: 'org.relationaltext.lens'
  readonly id: string
  readonly version?: string
  readonly description?: string
  readonly source: string        // Source namespace NSID
  readonly target: string        // Target namespace NSID
  readonly rules?: LensRule[]
  readonly passthrough?: 'keep' | 'drop'  // Default: 'keep'
  readonly wasmModule?: WasmLensRef       // For complex transforms
}
```

A `LensSpec` is a complete transformation definition between two namespaces:

- **`$type`** — always `'org.relationaltext.lens'`. This matches the ATProto record schema, meaning lenses can be stored as records on the atproto network.
- **`id`** — a unique identifier, typically in reverse-domain notation (e.g., `org.commonmark.to.w3c.html.v1`)
- **`source`** / **`target`** — the namespace NSIDs this lens converts between. Features whose `$type` matches `source` are candidates for transformation.
- **`rules`** — an ordered list of match/replace pairs. Rules are checked in order; the first matching rule wins for each feature.
- **`passthrough`** — what happens to features that don't match any rule (see [Passthrough Behavior](#passthrough-behavior) below)
- **`wasmModule`** — optional reference to a WASM binary for transforms too complex for declarative rules (see [WASM Transforms](/wasm-transforms/))

## LensRule

```ts
interface LensRule {
  readonly match?: FeaturePattern
  readonly replace?: null | FeatureReplacement
  readonly sql?: string  // SQL escape hatch (mutually exclusive with match)
}
```

A rule is a single transformation instruction: "when you see a feature matching `match`, produce a feature described by `replace`."

- **`match`** — a [`FeaturePattern`](#featurepattern) describing which features this rule applies to. If omitted, the rule matches all features from the source namespace.
- **`replace`** — a [`FeatureReplacement`](#featurereplacement) describing how to transform the matched feature. Set to `null` to drop the feature entirely (this makes the lens lossy and non-invertible).
- **`sql`** — a raw SQL statement for complex transforms that can't be expressed declaratively; see [Per-rule SQL](./sql-rules). Mutually exclusive with `match`.

::: info Rule types are mutually exclusive
Use `match` + `replace` to transform a feature, `replace: null` to drop it, or `sql` for a custom SQL expression. A single rule cannot combine `match` and `sql`.
:::

## Simple Rename Example

Here is the CommonMark → HTML lens for inline emphasis:

```json
{
  "$type": "org.relationaltext.lens",
  "id": "org.commonmark.to.w3c.html.v1",
  "source": "org.commonmark.facet",
  "target": "org.w3c.html.facet",
  "passthrough": "keep",
  "rules": [
    { "match": { "name": "emphasis" }, "replace": { "name": "em" } },
    { "match": { "name": "strong"   }, "replace": { "name": "strong" } },
    { "match": { "name": "code-span"}, "replace": { "name": "code" } },
    { "match": { "name": "link"     }, "replace": { "name": "a", "renameAttrs": { "uri": "href" } } },
    { "match": { "name": "line-break"}, "replace": { "name": "br" } }
  ]
}
```

## FeaturePattern

```ts
interface FeaturePattern {
  readonly typeId?: string               // Full $type or $type#name compound key
  readonly name?: string                 // Match feature's `name` field
  readonly matchAttrs?: Record<string, unknown>  // Match specific attr key/value pairs
}
```

A `FeaturePattern` describes which features a rule applies to:

- **`typeId`** — match a specific `$type` value. When omitted, defaults to the lens's `source` namespace.
- **`name`** — match the feature's `name` field. When combined with `typeId` (or the default source), the compound key `$type#name` is checked.
- **`matchAttrs`** — require specific attribute key/value pairs to match. This is how you distinguish between features with the same name but different attributes.

Rules are checked in order — the first rule whose pattern matches a feature wins.

`matchAttrs` lets multiple rules share the same name but differ by attribute. Example — heading level mapping:

```json
{ "match": { "name": "heading", "matchAttrs": { "level": 1 } },
  "replace": { "name": "h1", "dropAttrs": ["level"] } },
{ "match": { "name": "heading", "matchAttrs": { "level": 2 } },
  "replace": { "name": "h2", "dropAttrs": ["level"] } }
```

## FeatureReplacement

```ts
interface FeatureReplacement {
  readonly typeId?: string                          // New $type (default: lens target NSID)
  readonly name?: string                            // New name
  readonly renameAttrs?: Record<string, string>     // { oldKey: newKey }
  readonly addAttrs?: Record<string, unknown>       // Inject constant attributes
  readonly dropAttrs?: string[]                     // Remove attribute keys
  readonly keepAttrs?: string[]                     // Keep only these keys
  readonly mapAttrValue?: Record<string, AttrValueOp>  // Transform attribute values
}
```

A `FeatureReplacement` describes how to produce the output feature:

- **`typeId`** — the `$type` for the output feature. Defaults to the lens's `target` namespace.
- **`name`** — the output feature name. If omitted, the original name is kept.
- **`renameAttrs`** — rename attribute keys: `{ "uri": "href" }` converts CommonMark's `uri` to HTML's `href`.
- **`addAttrs`** — inject constant attributes: `{ "list": "ul" }` adds a fixed attribute to the output.
- **`dropAttrs`** — remove these attribute keys from the output (blacklist approach).
- **`keepAttrs`** — if present, *only* these keys survive in the output (whitelist approach). `keepAttrs` and `dropAttrs` are complementary — use whichever is shorter for your case.
- **`mapAttrValue`** — apply arithmetic or string operations to attribute values (see below).

### `mapAttrValue` Operations

```ts
type AttrValueOp =
  | { op: 'add';        value: number }
  | { op: 'subtract';   value: number }
  | { op: 'multiply';   value: number }
  | { op: 'prefix';     value: string }
  | { op: 'suffix';     value: string }
  | { op: 'negate' }
  | { op: 'to-string' }
  | { op: 'to-number' }
  | { op: 'to-boolean' }
```

Example — shift a heading level up by one when converting between formats:

```json
{ "match": { "name": "heading" },
  "replace": { "name": "heading", "mapAttrValue": { "level": { "op": "add", "value": 1 } } } }
```

## Passthrough Behavior

The `passthrough` field controls what happens to features that don't match any rule in the lens.

### `passthrough: 'keep'` (default)

Unmatched features pass through unchanged — their `$type`, `name`, and all attributes are preserved in the output. Use this when:
- You're mapping a subset of features and want the rest to survive untouched
- You want to preserve features from other namespaces that happen to be in the document
- You're writing an additive lens that only transforms specific features

### `passthrough: 'drop'`

Unmatched features are removed from the output. Use this when:
- You're building a strict allow-list lens — only features with explicit rules survive
- You're converting from a feature-rich format to a minimal one (e.g., stripping all formatting except bold and italic)
- You want to guarantee the output contains only features from the target namespace

**Interaction with `autoTransform`**: When a `passthrough: 'drop'` lens is registered with `autoApply: true`, the [lens graph's](/lenses/graph) `autoTransform` method includes a namespace fast-path check. If the document contains no features from the lens's source namespace, the lens is skipped entirely — preventing it from accidentally erasing features from unrelated formats.

## Applying a Lens

```ts
import { applyLens } from 'relational-text/lens'

const transformed = applyLens(doc.toJSON(), myLens)
```

`applyLens` is synchronous and delegates entirely to the Rust/WASM core. For lenses with a `wasmModule`, use `applyLensAsync` instead.

**Try it interactively** — edit the lens spec and input document below and see the result update live:

<LensTrace />

For the complete type definitions, see [Lens System API](/api/lenses).

For debugging techniques, see [Debug Transformations](/how-to/debug-transformations).
