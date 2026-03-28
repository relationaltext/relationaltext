# Document API

## `initRelationalText()`

```ts
function initRelationalText(): Promise<void>
```

Must be called once before any document operations. Safe to call multiple times — subsequent calls return immediately.

```ts
import { initRelationalText, Document } from 'relational-text'

await initRelationalText()
const doc = Document.fromText('Hello, world!')
```

---

## `Document` class

### Factory methods

```ts
Document.fromText(text: string): Document
Document.fromJSON(json: DocumentJSON): Document
Document.parse(text: string): Document
```

`fromText` creates a document with no facets. `fromJSON` deserializes from the wire format. `parse` detects mentions (`@handle`), URLs, and hashtags in plain text and stores them as facets.

```ts
const doc = Document.parse('Check out https://bsky.app and say hi to @alice.bsky.social!')
console.log(doc.features)
// [
//   { $type: 'app.bsky.richtext.facet', name: 'link', byteStart: 10, byteEnd: 28, ... },
//   { $type: 'app.bsky.richtext.facet', name: 'mention', byteStart: 37, byteEnd: 56, ... }
// ]
```

### Accessors

```ts
doc.features: FlatFeatureJSON[]
```

Flat array of all features across all facets, with `byteStart` and `byteEnd` added to each entry.

### Mutation methods

Each returns a new `Document`; the original is unchanged.

```ts
doc.insertText(byteOffset: number, text: string): Document
doc.deleteRange(byteStart: number, byteEnd: number): Document
doc.addMark(byteStart: number, byteEnd: number, feature: FeatureJSON): Document
doc.addBlock(byteOffset: number, feature: FeatureJSON): Document
doc.removeMark(byteStart: number, byteEnd: number, typeName: string): Document
doc.addLink(byteStart: number, byteEnd: number, url: string): Document
doc.addMention(byteStart: number, byteEnd: number, handle: string): Document
doc.addTag(byteStart: number, byteEnd: number, tag: string): Document
```

All byte offsets are UTF-8 byte positions, inclusive start / exclusive end.

```ts
let doc = Document.fromText('Hello world')
doc = doc.addMark(0, 5, {
  $type: 'org.relationaltext.facet',
  name: 'bold',
})
doc = doc.addLink(6, 11, 'https://example.com')
console.log(doc.toJSON())
```

### Output methods

```ts
doc.toHIR(): HIRNode[]
doc.toJSON(): DocumentJSON
doc.toString(): string
```

`toHIR()` computes a render tree from the flat facet list; it is not stored in the wire format. `toJSON()` serializes to the wire format. `toString()` returns the plain text content.

---

## Type Definitions

```ts
interface DocumentJSON {
  text: string
  facets: FacetJSON[]
}

interface FacetJSON {
  index: ByteSlice
  features: FeatureJSON[]
}

interface ByteSlice {
  byteStart: number  // inclusive, UTF-8 byte offset
  byteEnd: number    // exclusive, UTF-8 byte offset
}

type FeatureJSON = MarkFeatureJSON | BlockFeatureJSON | UnknownFeatureJSON

interface MarkFeatureJSON {
  $type: string
  name: string
  attrs?: Record<string, unknown>
  expandStart?: boolean
  expandEnd?: boolean
}

interface BlockFeatureJSON {
  $type: string
  name: string
  parents: string[]
  attrs: Record<string, unknown>
}

interface UnknownFeatureJSON {
  $type: string
  [key: string]: unknown
}

interface FlatFeatureJSON extends MarkFeatureJSON {
  byteStart: number
  byteEnd: number
}
```

---

## HIR Types

`toHIR()` returns a tree of `HIRNode` values. Block nodes contain their children; container nodes group consecutive blocks sharing a `parents[]` prefix. Text nodes carry the inline content with associated marks.

```ts
type HIRNode = HIRBlockNode | HIRContainerNode | HIRTextNode

interface HIRBlockNode {
  type: 'block'
  name: string
  attrs: Record<string, unknown>
  children: HIRNode[]
}

interface HIRContainerNode {
  type: 'container'
  name: string
  children: HIRNode[]
}

interface HIRTextNode {
  type: 'text'
  content: string
  marks: HIRMark[]
}

interface HIRMark {
  kind: string   // full compound key, e.g. "org.commonmark.facet#strong"
  attrs: Record<string, unknown>
}
```

```ts
const doc = Document.fromJSON({
  text: '\uFFFCHello',
  facets: [
    { index: { byteStart: 0, byteEnd: 3 }, features: [{ $type: 'org.commonmark.facet', name: 'paragraph', parents: [], attrs: {} }] },
    { index: { byteStart: 3, byteEnd: 8 }, features: [{ $type: 'org.commonmark.facet', name: 'strong' }] },
  ],
})

const hir = doc.toHIR()
// [{ type: 'block', name: 'paragraph', attrs: {}, children: [
//   { type: 'text', content: 'Hello', marks: [{ kind: 'org.commonmark.facet#strong', attrs: {} }] }
// ]}]
```
