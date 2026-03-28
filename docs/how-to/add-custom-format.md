# Adding a Custom Format

This guide walks through the complete workflow for adding a new format to RelationalText.
After following these steps, your format will support import, export, and automatic
cross-format conversion to and from HTML, Markdown, and any other registered format.

::: info Transliteration Principle
Feature names are the format's own native identifiers — no semantic translation in
importers. Lenses are the only place cross-format mappings live.
:::

For JSON-based formats (Quill Delta, ProseMirror, Notion, etc.), the feature name is the
exact value of the format's `type`, `nodeType`, `_type`, or equivalent field in the wire
JSON. For markup-based formats (DokuWiki, Textile, MediaWiki, etc.), the feature name is
the element identifier from the format's official spec. If the format calls something
`heading_1`, that is the feature name — no normalization to `heading-1` or `h1`.

This guide uses a hypothetical note-taking format called `com.example.notes` as a
running example.

---

## Step 1: Define the Lexicon

Create a JSON file following the `org.relationaltext.format-lexicon` schema. The file
declares every feature type your format uses, along with its class and expand behavior.

```json
{
  "$type": "org.relationaltext.format-lexicon",
  "id": "com.example.notes.facet",
  "version": "1.0",
  "specUrl": "https://example.com/notes/spec",
  "implicitBlockType": "paragraph",
  "features": [
    {
      "typeId": "com.example.notes.facet#paragraph",
      "featureClass": "block"
    },
    {
      "typeId": "com.example.notes.facet#heading",
      "featureClass": "block"
    },
    {
      "typeId": "com.example.notes.facet#callout",
      "featureClass": "block"
    },
    {
      "typeId": "com.example.notes.facet#bold",
      "featureClass": "inline",
      "expandStart": true,
      "expandEnd": true
    },
    {
      "typeId": "com.example.notes.facet#italic",
      "featureClass": "inline",
      "expandStart": true,
      "expandEnd": true
    },
    {
      "typeId": "com.example.notes.facet#highlight",
      "featureClass": "inline",
      "expandStart": true,
      "expandEnd": true
    },
    {
      "typeId": "com.example.notes.facet#wikilink",
      "featureClass": "entity"
    }
  ]
}
```

The three `featureClass` values:

- `block` — a block boundary marker (paragraph, heading, list item, etc.)
- `inline` — a spanning mark (bold, italic, strikethrough, etc.)
- `entity` — a zero-width or fixed-width inline node (link, image, mention, line break)

`expandStart` / `expandEnd` encode Peritext semantics: should the mark grow when text is
inserted at its boundary? Bold and italic expand on both sides. Inline code, links, and
entities do not.

Save the file next to your format's implementation, for example:
`formats/com.example.notes/notes.lexicon.json`.

---

## Step 2: Register the Lexicon

The WASM registry starts empty. You must register your lexicon before the WASM core can
classify your features as blocks, inlines, or entities.

```ts
import { initRelationalText } from 'relational-text/core'
import * as wasm from 'relational-text/wasm'
import { registerLens, type LensSpec } from 'relational-text/lens'

import notesLexiconData from './notes.lexicon.json' with { type: 'json' }
import notesToRtData from './notes-to-relationaltext.lens.json' with { type: 'json' }

let _notesRegistered = false

export function ensureNotesLexicon(): void {
  if (_notesRegistered) return
  _notesRegistered = true
  initRelationalText()
  wasm.register_lexicon(JSON.stringify(notesLexiconData))
  registerLens(notesToRtData as unknown as LensSpec, { autoApply: true })
}
```

`register_lexicon` accepts the full `org.relationaltext.format-lexicon` JSON as a string
and bulk-registers all feature entries in one call. It is idempotent — registering the
same `typeId` twice is a no-op.

For ad-hoc one-off types (useful in tests or quick prototypes), use `registerFeatureType`
instead:

```ts
import { registerFeatureType } from 'relational-text'

registerFeatureType({
  typeId: 'com.example.notes.facet#callout',
  featureClass: 'block',
})
```

---

## Step 3: Write the Importer

The importer reads your format's wire representation and builds a `DocumentJSON` with
facets in the `com.example.notes.facet` namespace.

**Block markers** — the block model uses a single marker character per block boundary:

- `\uFFFC` (U+FFFC, 3 UTF-8 bytes) for the **first block** in the document
- `\n` (1 byte) for **every subsequent block**

The facet covering each marker carries the block feature. Block content runs from the
marker's end to the start of the next marker (or end of string for the last block).

```ts
import { Document } from 'relational-text/core'
import type { DocumentJSON, FacetJSON } from 'relational-text/types'

export function fromNotes(input: NotesDocument): Document {
  ensureNotesLexicon()

  const enc = new TextEncoder()
  let text = ''
  const facets: FacetJSON[] = []

  function byteLen(s: string): number {
    return enc.encode(s).length
  }

  function openBlock(name: string, attrs?: Record<string, unknown>): void {
    // First block uses U+FFFC (3 bytes); all others use \n (1 byte)
    const markerChar = text.length === 0 ? '\uFFFC' : '\n'
    const start = byteLen(text)
    text += markerChar
    const feature: Record<string, unknown> = {
      $type: 'com.example.notes.facet',
      name,
      parents: [],
    }
    if (attrs) feature.attrs = attrs
    facets.push({
      index: { byteStart: start, byteEnd: byteLen(text) },
      features: [feature] as FacetJSON['features'],
    })
  }

  for (const block of input.blocks) {
    if (block.type === 'paragraph') {
      openBlock('paragraph')
    } else if (block.type === 'heading') {
      openBlock('heading', { level: block.level })
    } else if (block.type === 'callout') {
      openBlock('callout', { kind: block.kind })
    }

    for (const span of block.content) {
      const spanStart = byteLen(text)
      text += span.text
      const spanEnd = byteLen(text)

      for (const mark of span.marks ?? []) {
        // mark.type is the format's own native name — do not translate it
        facets.push({
          index: { byteStart: spanStart, byteEnd: spanEnd },
          features: [{ $type: 'com.example.notes.facet', name: mark.type }],
        })
      }
    }
  }

  return Document.fromJSON({ text, facets } as DocumentJSON)
}
```

Do not translate feature names. If your format calls something `h1`, store it as `h1`.
The importer is a mechanical transcription of the format's AST into facets.

---

## Step 4: Write the Exporter

The exporter reads the document's HIR (Hierarchical Intermediate Representation) and
renders it into your format's output. Call `doc.toHIR()` after running
`lensGraph.autoTransform()` to convert any incoming cross-format document into your
format's namespace.

```ts
import { lensGraph } from 'relational-text/lens'
import type { HIRNode, HIRBlockNode, HIRMark } from 'relational-text/types'

export function toNotes(doc: Document): NotesDocument {
  ensureNotesLexicon()

  // autoTransform converts any incoming namespace to com.example.notes.facet
  // via the registered lens graph. Documents already in the notes namespace
  // pass through unchanged.
  const native = Document.parse(
    lensGraph.autoTransform(JSON.stringify(doc.toJSON()), 'com.example.notes.facet'),
  )

  const blocks: NotesBlock[] = []

  for (const node of native.toHIR()) {
    if (node.type === 'block') {
      blocks.push(renderBlock(node as HIRBlockNode))
    }
  }

  return { blocks }
}

function renderBlock(node: HIRBlockNode): NotesBlock {
  const content = node.children.map(renderInline)
  switch (node.name) {
    case 'heading': return { type: 'heading', level: node.attrs?.level ?? 1, content }
    case 'callout': return { type: 'callout', kind: node.attrs?.kind ?? 'info', content }
    default:        return { type: 'paragraph', content }
  }
}

function renderInline(node: HIRNode): NotesSpan {
  if (node.type !== 'text') return { text: '', marks: [] }
  const marks = node.marks.map((m: HIRMark) => ({ type: markName(m.kind) }))
  return { text: node.content, marks }
}

function markName(kind: string): string {
  // kind is the full compound key, e.g. "com.example.notes.facet#bold"
  return kind.split('#')[1] ?? kind
}
```

If the `autoTransform` lens is missing or has not been registered, `autoTransform` returns
the document unchanged. In that case the HIR nodes will still carry the source namespace
(e.g. `org.commonmark.facet#bold` instead of `com.example.notes.facet#bold`), and the
switch cases in your renderer must handle that namespace directly.

---

## Step 5: Create the Lens JSON

The lens file connects your format to the RelationalText hub (`org.relationaltext.facet`).
Once registered, the lens graph can automatically route conversions from your format to
HTML, Markdown, and any other registered format — and back.

Create `notes-to-relationaltext.lens.json`:

```json
{
  "$type": "org.relationaltext.lens",
  "id": "com.example.notes.to.relationaltext.v1",
  "description": "Transform com.example.notes facets to RelationalText facets",
  "source": "com.example.notes.facet",
  "target": "org.relationaltext.facet",
  "invertible": false,
  "passthrough": "keep",
  "rules": [
    { "match": { "name": "paragraph"  }, "replace": { "name": "paragraph" } },
    { "match": { "name": "heading"    }, "replace": { "name": "heading"   } },
    { "match": { "name": "callout"    }, "replace": { "name": "details"   } },
    { "match": { "name": "bold"       }, "replace": { "name": "bold"      } },
    { "match": { "name": "italic"     }, "replace": { "name": "italic"    } },
    { "match": { "name": "highlight"  }, "replace": { "name": "highlight" } },
    { "match": { "name": "wikilink"   }, "replace": { "name": "link", "renameAttrs": { "page": "url" } } }
  ]
}
```

Mark the lens `invertible: false` when the mapping is lossy in at least one direction.
Here, `callout` maps to the generic RT `details` type and the original `kind` attribute
is dropped, so round-tripping through the hub would lose that information.

Use `renameAttrs` to bridge attribute naming differences between formats. Use `addAttrs`
to inject constant values when collapsing format-specific variants into a single RT type
(for example, `{ "addAttrs": { "level": 1 } }` when a format has a dedicated `title`
block type that maps to RT `heading` with `level: 1`).

For the full lens DSL reference, see [Lenses](../lenses/).

---

## Step 6: Wire It Together

The complete `ensureNotesLexicon()` function is the single public registration surface
your format exposes. Call it at the top of every `fromNotes` and `toNotes` function:

```ts
import { initRelationalText } from 'relational-text/core'
import * as wasm from 'relational-text/wasm'
import { registerLens, type LensSpec } from 'relational-text/lens'

import notesLexiconData from './notes.lexicon.json' with { type: 'json' }
import notesToRtData from './notes-to-relationaltext.lens.json' with { type: 'json' }

let _registered = false

/**
 * Register the com.example.notes lexicon and its lens to the RT hub.
 * Safe to call multiple times — registration only happens once.
 */
export function ensureNotesLexicon(): void {
  if (_registered) return
  _registered = true
  initRelationalText()
  wasm.register_lexicon(JSON.stringify(notesLexiconData))
  registerLens(notesToRtData as unknown as LensSpec, { autoApply: true })
}

export function fromNotes(input: NotesDocument): Document {
  ensureNotesLexicon()
  // ... importer body
}

export function toNotes(doc: Document): NotesDocument {
  ensureNotesLexicon()
  // ... exporter body
}
```

The `{ autoApply: true }` flag tells the lens graph to run this lens automatically
whenever `lensGraph.autoTransform(doc, targetNs)` is called and the document contains
features in the notes namespace. This is what makes `to('html', fromNotes(x))` work without
additional configuration: the lens graph finds the path
`com.example.notes.facet → org.relationaltext.facet → org.w3c.html.facet` and applies
it automatically.

---

## Step 7: Tests

A minimal test suite covers three scenarios:

| Scenario | What to assert |
|----------|---------------|
| Native round-trip | `toNotes(fromNotes(input))` deep-equals `input` |
| Cross-format import | `toNotes(from('markdown', '## Hello\n\n**bold**'))` produces correct blocks and marks |
| Cross-format export | `to('html', fromNotes(sampleDoc()))` contains the expected HTML elements |

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { initRelationalText } from 'relational-text'
import { from, to } from 'relational-text/registry'
import { fromNotes, toNotes, ensureNotesLexicon } from './notes.js'

beforeAll(async () => {
  await initRelationalText()
  ensureNotesLexicon()
})

describe('notes format', () => {
  it('round-trips a document through the native format', () => {
    const input = sampleNotesDocument()
    expect(toNotes(fromNotes(input))).toEqual(input)
  })

  it('converts Markdown to notes via the lens graph', () => {
    const notes = toNotes(from('markdown', '## Hello\n\n**bold** and _italic_'))
    expect(notes.blocks[0].type).toBe('heading')
    expect(
      notes.blocks[1].content.some(s => s.marks?.some(m => m.type === 'bold'))
    ).toBe(true)
  })

  it('renders to HTML via the lens graph', () => {
    expect(to('html', fromNotes(sampleNotesDocument()))).toContain('<strong>')
  })
})
```

---

## Summary

| Step | File | What it does |
|------|------|--------------|
| 1. Lexicon JSON | `notes.lexicon.json` | Declares all feature types with classes and expand flags |
| 2. Registration | `ensureNotesLexicon()` in `notes.ts` | Registers the lexicon and lens with the WASM core |
| 3. Importer | `fromNotes()` | Transliterates the format's AST into `com.example.notes.facet#*` features using `\uFFFC` / `\n` block markers |
| 4. Exporter | `toNotes()` | Walks the HIR after `autoTransform` and produces the format's output |
| 5. Lens | `notes-to-relationaltext.lens.json` | Maps `com.example.notes.facet#*` to `org.relationaltext.facet#*` |
| 6. Wire-up | `ensureNotesLexicon()` called in every public function | Lazy once-guard for registration |
| 7. Tests | `notes.test.ts` | Native round-trip, cross-format import, cross-format export |

Once these pieces are in place, your format participates fully in the RelationalText
ecosystem: it can receive documents from any registered format and produce output readable
by any renderer, with no additional integration work.
