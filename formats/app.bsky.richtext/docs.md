# Bluesky / atproto Format

The Bluesky format is the atproto richtext wire format itself: `{ text: string, facets: Facet[] }`. RelationalText's `DocumentJSON` is a superset of this format — all ATProto richtext is valid RelationalText.

## Functions

```ts
import { from, to } from 'relational-text/registry'
import { detectFacets } from 'relational-text/bluesky'
```

### `from('bluesky', json: string | DocumentJSON): Document`

Parse a Bluesky / atproto richtext JSON into a Document.

```ts
const doc = from('bluesky', wireDoc)
```

Accepts either a JSON string or a `{ text, facets }` object. Normalizes facet order via the WASM core.

Here is the input wire document — a post with a mention, a link, and a hashtag:

<WireDisplay
  :text="'Hello @alice.bsky.social, check out https://example.com #cool'"
  :facets='[
    { "index": { "byteStart": 6,  "byteEnd": 24 }, "features": [{ "$type": "app.bsky.richtext.facet#mention", "did": "did:plc:abc123" }] },
    { "index": { "byteStart": 35, "byteEnd": 54 }, "features": [{ "$type": "app.bsky.richtext.facet#link",    "uri": "https://example.com" }] },
    { "index": { "byteStart": 55, "byteEnd": 60 }, "features": [{ "$type": "app.bsky.richtext.facet#tag",     "tag": "cool" }] }
  ]'
/>

### `to('bluesky', doc: Document | DocumentJSON): { text: string; facets: FacetJSON[] }`

Render a Document to Bluesky / atproto wire format.

```ts
const { text, facets } = to('bluesky', doc)
// Post to Bluesky AppView — extended features are stripped
```

Only features in the `app.bsky.richtext.facet` namespace are kept. All extended features (marks, blocks from other namespaces) are stripped, making the result safe to post directly to the Bluesky AppView.

The stripping is done by `filter_facets_by_namespace(doc, 'app.bsky.richtext.facet')` — a generic WASM export.

### `detectFacets(text: string): FacetJSON[]`

Auto-detect `@mentions`, URLs, and `#tags` in a plain text string.

::: warning DID Resolution required before posting
`detectFacets` stores `did` as `at://` + handle — a placeholder, **not** a real DID. The Bluesky AppView rejects mentions without a resolved DID. You **must** resolve handles to DIDs before posting.

```ts
import { detectFacets } from 'relational-text/bluesky'

// 1. Detect facets (did fields are placeholders: "at://alice.bsky.social")
const facets = detectFacets(text)

// 2. Resolve all mention DIDs before posting
const resolvedFacets = await Promise.all(
  facets.map(async (facet) => ({
    ...facet,
    features: await Promise.all(
      facet.features.map(async (feat) => {
        if (feat.$type === 'app.bsky.richtext.facet#mention') {
          const handle = (feat.did as string).replace('at://', '')
          const did = await resolveHandle(handle)  // call your ATProto client
          return { ...feat, did }
        }
        return feat
      }),
    ),
  })),
)

// 3. Now safe to post
await agent.post({ text, facets: resolvedFacets })
```
:::

```ts
const text = 'Hello @alice.bsky.social check out https://example.com #news'
const facets = detectFacets(text)
```

The returned facets annotate the mention, link, and hashtag spans:

<WireDisplay
  :text="'Hello @alice.bsky.social check out https://example.com #news'"
  :facets='[
    { "index": { "byteStart": 6,  "byteEnd": 24 }, "features": [{ "$type": "app.bsky.richtext.facet#mention", "did": "at://alice.bsky.social" }] },
    { "index": { "byteStart": 35, "byteEnd": 54 }, "features": [{ "$type": "app.bsky.richtext.facet#link",    "uri": "https://example.com" }] },
    { "index": { "byteStart": 55, "byteEnd": 60 }, "features": [{ "$type": "app.bsky.richtext.facet#tag",     "tag": "news" }] }
  ]'
/>

### `ensureBlueskyLexicon(): void`

Explicitly register the Bluesky lexicon. Called automatically by `from('bluesky', ...)` / `to('bluesky', ...)` / `detectFacets()` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Feature Types

The Bluesky namespace defines three feature types, all wire-compatible with the AppView:

```ts
// @mention
{ $type: 'app.bsky.richtext.facet#mention', did: string }

// Hyperlink
{ $type: 'app.bsky.richtext.facet#link', uri: string }

// Hashtag
{ $type: 'app.bsky.richtext.facet#tag', tag: string }
```

## Examples

### Create a post with auto-detected facets

```ts
import { detectFacets } from 'relational-text/bluesky'

const text = 'Hello @alice.bsky.social! Check #this out: https://example.com'
const facets = detectFacets(text)

// Post to Bluesky via AT Protocol
await agent.post({ text, facets })
```

### Round-trip: Markdown to Bluesky

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', 'Hello **world** — see https://example.com')
const { text, facets } = to('bluesky', doc)
// text: 'Hello world — see https://example.com'  (markdown stripped)
// facets: [link facet for the URL]
```

Note: Markdown bold/italic are not preserved in the Bluesky wire format since the AppView only understands mention/link/tag features. Use the full `DocumentJSON` to preserve extended marks.

### Preserve extended marks

```ts
import { from, to } from 'relational-text/registry'

// A document with both ATProto facets and custom extended marks
const doc = from('bluesky', { text: 'Hello world', facets: [] })
  .addMark(0, 5, { name: 'bold' })

// Extended marks are preserved when rendering to HTML
const html = to('html', doc)
// '<p><strong>Hello</strong> world</p>\n'

// But stripped when exporting back to Bluesky
const { text, facets } = to('bluesky', doc)
// facets: []  ← bold mark stripped (not in app.bsky.richtext.facet namespace)
```

## Bluesky Features in the HIR

The three Bluesky feature types appear as mark-like nodes in the HIR, alongside any other marks in the document. Their `kind` is the full compound key:

| `$type` | HIR `kind` | `attrs` |
|---------|------------|---------|
| `app.bsky.richtext.facet#mention` | `"app.bsky.richtext.facet#mention"` | `{ did: string }` |
| `app.bsky.richtext.facet#link` | `"app.bsky.richtext.facet#link"` | `{ uri: string }` |
| `app.bsky.richtext.facet#tag` | `"app.bsky.richtext.facet#tag"` | `{ tag: string }` |

These do not expand — inserting text adjacent to a mention does not extend the mention range. When writing a renderer that handles Bluesky documents, switch on these compound key strings to render mentions, links, and hashtags appropriately.
