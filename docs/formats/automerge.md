# Automerge Format

Automerge is a CRDT library that uses the Peritext mark model and Kleppmann block markers for collaborative rich text — the same theoretical foundation as RelationalText. Because the two systems share the same underlying model, the feature mapping is 1:1 and no semantic translation is required.

RelationalText supports two integration modes:

- **Snapshot** — import or export an Automerge document at a point in time
- **Change-stream** — live bidirectional sync between an Automerge document and a RelationalText document

## Functions

```ts
import {
  fromAutomerge,
  toAutomerge,
  ensureAutomergeLexicon,
  createBridgeFromRT,
  applyRTMutationToAutomerge,
  automergePathToRTMutations,
  applyRTMutations,
} from 'relational-text/automerge'
```

::: tip
The Automerge adapter uses dedicated `fromAutomerge` / `toAutomerge` functions rather than the generic `from()` / `to()` registry, because Automerge documents are not strings — they are CRDT objects that require a property path argument.
:::

## Snapshot Integration

Use snapshot mode when you want to import an existing Automerge document into RelationalText for rendering or conversion, or export a RelationalText document back into an Automerge document.

### `fromAutomerge(doc, path): Document`

Import an Automerge document into RelationalText.

- `doc` — an Automerge document object
- `path` — array of property keys leading to the rich text field (e.g. `['text']` for `doc.text`)

```ts
import * as A from '@automerge/automerge'
import { fromAutomerge, ensureAutomergeLexicon } from 'relational-text/automerge'

ensureAutomergeLexicon()

const amDoc = A.from({ text: new A.RawString('Hello **world**') })
const rtDoc = fromAutomerge(amDoc, ['text'])
```

### `toAutomerge(rtDoc, doc, path): void`

Export a RelationalText document into an Automerge document in-place. Must be called inside an `A.change` callback.

- `rtDoc` — the RelationalText `Document` to export
- `doc` — the mutable Automerge document (inside a change callback)
- `path` — property path to the rich text field

```ts
import * as A from '@automerge/automerge'
import { toAutomerge } from 'relational-text/automerge'

const updated = A.change(amDoc, d => toAutomerge(rtDoc, d, ['text']))
```

### `ensureAutomergeLexicon(): void`

Register the Automerge lexicon (`org.automerge.richtext.facet` types). Called automatically by `fromAutomerge()` and `toAutomerge()` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Change-Stream Integration

Use change-stream mode for live collaborative editing where changes from one system must be continuously reflected in the other.

### Setup

```ts
import * as A from '@automerge/automerge'
import {
  createBridgeFromRT,
  applyRTMutationToAutomerge,
  automergePathToRTMutations,
  applyRTMutations,
} from 'relational-text/automerge'

// Create a bridge that tracks both sides
const bridge = createBridgeFromRT(rtDoc)
```

### Applying a local RelationalText edit

When the user edits the RelationalText document, convert the mutation to Automerge change bytes for replication to peers:

```ts
const { bridge: newBridge, changes } = applyRTMutationToAutomerge(bridge, {
  op: 'insert', bytePos: 5, text: ' world'
})
// `changes` is Uint8Array[] — send these bytes to connected peers
```

### Applying incoming Automerge changes

When remote Automerge changes arrive, convert the Automerge patches to RelationalText mutations and apply them:

```ts
// Apply remote changes to the Automerge side
const [newAmDoc] = A.applyChanges(bridge.amDoc, incomingChanges)

// Diff the old and new heads to get the list of patches
const patches = A.diff(
  newAmDoc,
  A.getHeads(bridge.amDoc),
  A.getHeads(newAmDoc)
)

// Convert Automerge patches to RelationalText mutations
const mutations = automergePathToRTMutations(patches, bridge.rtDoc, ['text'])

// Apply mutations to the RelationalText document
const updatedRtDoc = applyRTMutations(bridge.rtDoc, mutations)
```

### API summary

| Function | Description |
|---|---|
| `createBridgeFromRT(rtDoc)` | Create a `Bridge` object from an existing RT document |
| `applyRTMutationToAutomerge(bridge, mutation)` | Apply one RT mutation; returns `{ bridge, changes: Uint8Array[] }` |
| `automergePathToRTMutations(patches, rtDoc, path)` | Convert Automerge patches at `path` to RT mutations |
| `applyRTMutations(rtDoc, mutations)` | Apply an array of RT mutations to a document |

## Feature Mapping

| Automerge | RelationalText feature |
|---|---|
| mark `bold: true` | `org.automerge.richtext.facet#bold` |
| mark `italic: true` | `org.automerge.richtext.facet#italic` |
| mark `strikethrough: true` | `org.automerge.richtext.facet#strikethrough` |
| mark `code: true` | `org.automerge.richtext.facet#code` |
| mark `link: "https://..."` | `org.automerge.richtext.facet#link` with `attrs.href` |
| block marker `Map` object | `\uFFFC` / `\n` block facet |

Block markers use the Kleppmann model: the first block in a document is represented by `\uFFFC` (U+FFFC, 3 bytes) and subsequent blocks by `\n` (1 byte). Block content is the text between consecutive markers. This matches RelationalText's native block model exactly.

## Position Encoding

::: warning UTF-16 vs UTF-8 byte offsets
Automerge WASM internally uses UTF-16 code unit indices; RelationalText uses UTF-8 byte offsets. The change-stream adapter (`applyRTMutationToAutomerge`, `automergePathToRTMutations`) handles this conversion automatically using `utf16IndexToByteOffset` and `byteOffsetToUtf16Index`.

If you are accessing `bridge.amDoc` directly and computing positions manually, you must perform this conversion yourself.
:::

## Examples

### Snapshot round-trip

```ts
import * as A from '@automerge/automerge'
import { to } from 'relational-text/registry'
import { fromAutomerge, toAutomerge, ensureAutomergeLexicon } from 'relational-text/automerge'

ensureAutomergeLexicon()

// Import and render
const amDoc = A.from({ text: new A.RawString('Hello world') })
const rtDoc = fromAutomerge(amDoc, ['text'])
const html = to('html', rtDoc)

// Edit in RelationalText and write back
const edited = rtDoc.addMark(6, 11, { name: 'bold' })
const saved = A.change(amDoc, d => toAutomerge(edited, d, ['text']))
```

### Live sync between two peers

```ts
import * as A from '@automerge/automerge'
import {
  createBridgeFromRT,
  applyRTMutationToAutomerge,
  automergePathToRTMutations,
  applyRTMutations,
} from 'relational-text/automerge'
import { Document } from 'relational-text'

let bridge = createBridgeFromRT(Document.fromText('Hello'))

// Local insert: user types " world" at position 5
const { bridge: b2, changes } = applyRTMutationToAutomerge(bridge, {
  op: 'insert', bytePos: 5, text: ' world'
})
bridge = b2
sendToNetwork(changes) // send Uint8Array[] to peers

// Remote changes arrive from a peer
onNetworkChanges(incomingChanges => {
  const [newAmDoc] = A.applyChanges(bridge.amDoc, incomingChanges)
  const patches = A.diff(newAmDoc, A.getHeads(bridge.amDoc), A.getHeads(newAmDoc))
  const mutations = automergePathToRTMutations(patches, bridge.rtDoc, ['text'])
  bridge = { ...bridge, amDoc: newAmDoc, rtDoc: applyRTMutations(bridge.rtDoc, mutations) }
  rerenderEditor(bridge.rtDoc)
})
```
