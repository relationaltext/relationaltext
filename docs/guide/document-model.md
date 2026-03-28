# Document Model

RelationalText's wire format is identical to the atproto richtext format: a UTF-8 `text` string paired with an array of byte-ranged `facets`. All extended features are new `$type` values layered on top — there is no structural difference.

<DocInspector />

## What is a Facet?

A **facet** is the fundamental unit of annotation in RelationalText. It pairs a byte range in the text string with one or more typed features. You can think of it as a highlighted region that carries semantic meaning.

<WireDisplay
  text="Hello, world!"
  rendered-html="<strong>Hello</strong>, world!"
  :facets='[{ index: { byteStart: 0, byteEnd: 5 }, features: [{ "$type": "org.relationaltext.facet", name: "bold" }] }]'
/>

The same byte range can carry multiple features in a single facet — for example, text that is both bold and a hyperlink:

<WireDisplay
  text="Hello, world!"
  rendered-html='Hello, <strong><a href="https://example.com">world</a></strong>!'
  :facets='[{ index: { byteStart: 7, byteEnd: 12 }, features: [
    { "$type": "org.relationaltext.facet", name: "bold" },
    { "$type": "app.bsky.richtext.facet#link", uri: "https://example.com" }
  ] }]'
/>

Facets **can** have overlapping byte ranges. For example, a bold mark covering `[5, 15)` and an italic mark covering `[8, 22)` are two separate facets whose ranges partially overlap — the region `[8, 15)` will receive both marks when rendered.

What is true is that all features for **the same byte range** are grouped into a single facet. If bold and italic happen to cover exactly the same range, they appear as two entries in one facet's `features` array rather than as two separate facets.

## Core Types

### `DocumentJSON`

```ts
interface DocumentJSON {
  text: string
  facets?: FacetJSON[]
}
```

A rich text document is just text and (optionally) facets. The `facets` array is always sorted in canonical order after any WASM normalization step.

### `FacetJSON`

```ts
interface FacetJSON {
  index: ByteSlice
  features: FeatureJSON[]
}
```

A facet associates a byte range with one or more typed features. Multiple features on the same range are allowed (e.g., a mention that is also bold).

### `ByteSlice`

Why bytes? Because JavaScript uses UTF-16 internally, but the wire format is byte-addressed UTF-8 — using bytes keeps the format language-agnostic and CRDT-safe.

```ts
interface ByteSlice {
  byteStart: number
  byteEnd: number
}
```

Byte ranges are **half-open**: `[byteStart, byteEnd)`. They index into the UTF-8 encoding of `text`, not into JavaScript's UTF-16 character array.

**Concrete example with byte offsets:**

```
text: "Hi 🌍"
       0  2 3
       H  i   (space=2, 🌍 occupies bytes 3–6 = 4 bytes in UTF-8)

Facet for emoji: { byteStart: 3, byteEnd: 7 }   // 4 bytes
```

If you write `byteStart: 3, byteEnd: 4` you would be splitting the multi-byte UTF-8 sequence mid-codepoint — the WASM normalizer rejects this.

::: warning UTF-8 vs UTF-16
JavaScript strings use UTF-16 internally. Multi-byte Unicode characters (emoji, non-BMP codepoints) occupy 1 character in JS but 3–4 bytes in UTF-8.

Always compute byte positions using `TextEncoder`:

```ts
function byteLen(s: string): number {
  return new TextEncoder().encode(s).length
}

const text = 'Hello 🌍'
// 'Hello ' = 6 bytes, '🌍' = 4 bytes → total 10 bytes
// Byte range for emoji: { byteStart: 6, byteEnd: 10 }
```
:::

## Feature Types

The `FeatureJSON` union covers all known and unknown feature shapes:

```ts
type FeatureJSON =
  | MarkFeature         // org.relationaltext.facet (with name field)
  | BlockFeature        // org.relationaltext.facet (with name + parents fields)
  | UnknownFeature      // any $type string
```

Bluesky-specific feature types (`MentionFeature`, `LinkFeature`, `TagFeature`) are defined in the Bluesky format module. See the [Bluesky format page](../formats/bluesky) for details.

### Mark Feature

Inline marks carry a `name` (e.g., `"bold"`) and optional `attrs`. The `expandStart` / `expandEnd` fields follow the Peritext model — see [Marks](./marks).

```ts
interface MarkFeature {
  $type: 'org.relationaltext.facet'
  name: MarkName
  attrs?: Record<string, unknown>
  expandStart?: boolean
  expandEnd?: boolean
}
```

### Block Feature

Block features use 1-character markers in the text string. See [Blocks](./blocks) for the full model.

```ts
interface BlockFeature {
  $type: 'org.relationaltext.facet'
  name: BlockName
  parents: string[]
  attrs?: Record<string, unknown>
}
```

### Unknown Feature

Any `$type` not listed above is preserved verbatim:

```ts
interface UnknownFeature {
  $type: string
  [key: string]: unknown
}
```

This forward-compatibility guarantee means RelationalText never drops data for `$type` values it has not seen before. Round-tripping an unknown feature through `parse_document` preserves all fields exactly.

## Compound Keys

Features have a `$type` (namespace) and optionally a `name` field. When rendering, the HIR combines these into a single compound key string `"$type#name"` used as the `kind` on HIR mark nodes and in lens rule matching. See the [HIR page](./hir) for details.

## Feature Namespaces Explained

RelationalText uses three distinct namespace categories. It is important to understand which one applies in a given context.

::: info Three namespace categories

The summary below is a quick orientation to the three categories.

**`org.relationaltext.facet`** — programmatic API and hub namespace.
Used when you call `Document.addMark()` or `Document.addBlock()`. These are the types stored on the wire when constructing documents from code, and this is also the "hub" that all 33 format lenses target.
- `org.relationaltext.facet` with `name: "bold"` → kind `"org.relationaltext.facet#bold"`
- `org.relationaltext.facet` with `name: "paragraph"` → kind `"org.relationaltext.facet#paragraph"`

When you call `autoTransform(doc, 'org.relationaltext.facet')`, all known format namespaces are converted into this one.

**Format-specific namespaces** — one per format.
When you call `from('markdown', input)`, features are stored under `org.commonmark.facet`. When you call `from('html', input)`, they go under `org.w3c.html.facet`. These preserve the original format's identity and allow loss-free round-tripping.
:::

## Format-Specific Feature Namespaces

When you parse a format like Markdown or HTML, features are stored under that format's own namespace rather than `org.relationaltext.facet`. For example:

| Format | Namespace | Example type |
|--------|-----------|--------------|
| CommonMark | `org.commonmark.facet` | `org.commonmark.facet#strong` |
| GFM | `org.gfm.facet` | `org.gfm.facet#strikethrough` |
| HTML | `org.w3c.html.facet` | `org.w3c.html.facet#a` |
| Bluesky | `app.bsky.richtext.facet` | `app.bsky.richtext.facet#mention` |
| Mastodon | `org.joinmastodon.facet` | `org.joinmastodon.facet#p` |

Lenses transform features between namespaces. See [Lenses](../lenses/) for how this works.

## Why facets group features by range

The wire format groups features that share a byte range into a single `facet` rather than storing each feature as its own top-level entry. Two reasons drive this:

**Rendering needs co-location.** When a link and a bold mark cover exactly the same range, the HTML renderer must decide which wraps which (`<a><strong>` vs `<strong><a>`). That decision requires seeing both features at the same range simultaneously. The facet structure makes co-located features available without a grouping pass inside every renderer.

**Verbosity.** In dense rich text it is common for several marks to share a range (bold + italic + link, or a block marker with multiple style features). The grouped format stores the `{ byteStart, byteEnd }` index once per range; a fully flat format would repeat it for every feature.

`Document.features` gives you the flat iteration ergonomics; the grouped structure stays in the wire format where it earns its keep.

## Iterating Features

For most work — filtering by `$type`, collecting all annotations of a kind, passing features to a renderer — you want a flat list of features with their byte ranges, not nested `facets[i].features[j]` loops. `Document.features` provides this:

```ts
// All links in the document
const links = doc.features.filter(f => f.$type === 'app.bsky.richtext.facet#link')

// All unique feature types in use
const types = new Set(doc.features.map(f => f.$type))

// Every feature covering a given byte position
const atPos = doc.features.filter(f => f.index.byteStart <= pos && pos < f.index.byteEnd)
```

Each entry is a `FlatFeatureJSON` — the feature's own fields plus its `index`:

```ts
type FlatFeatureJSON = FeatureJSON & { readonly index: ByteSlice }
```

## Canonical Sort Order

After any WASM normalization step (`parse_document`, `insert_text`, etc.), facets are sorted in canonical order:

1. By `byteStart` ascending
2. By `byteEnd` descending (wider facets first)
3. Stable sort preserves insertion order for same-range facets

This deterministic ordering ensures that two equivalent documents produce identical JSON regardless of insertion order.
