# relational-text

Rich text as a relation. A document is a UTF-8 string and a flat table of typed
annotations over byte ranges — nothing more. Every format is a view. Conversions
are morphisms derived by [panproto](https://github.com/panproto/panproto). The
core is Rust compiled to WASM; this package is the TypeScript SDK with support
for 38 rich text formats and the Layers annotation model.

## Installation

```
pnpm add relational-text
```

> **Note:** ESM-only. Requires Node.js 18+ or a WASM-capable bundler (Vite, webpack 5, Next.js 13+).

## Quick start

```typescript
import { from, to } from 'relational-text/registry'

const doc = await from('markdown', '# Hello\n\nThis is **bold** text.')
const html = await to('html', doc)
// → <h1>Hello</h1><p>This is <strong>bold</strong> text.</p>
```

## Sub-path exports

```typescript
import { Document } from 'relational-text/core'
import { applyLens, LensGraph } from 'relational-text/lens'
import { from, to } from 'relational-text/registry'
import { LayeredDocument } from 'relational-text/layered-document'
import { KnowledgeResolver, createDefaultResolver } from 'relational-text/knowledge'
import { computeAnnotationRanges } from 'relational-text/annotation-overlay'
import { ConceptIndex } from 'relational-text/concept-index'
import { toLayers, fromLayers, convertViaPanproto } from 'relational-text/layers'
```

## Layers annotations

Semantic annotations use the [Layers](https://layers.pub) model (`pub.layers.annotation`):

```typescript
import { LayeredDocument } from 'relational-text/layered-document'

const layered = LayeredDocument.fromDocument(doc)
const annotated = layered.addLayer({
  expression: 'doc',
  kind: 'span',
  subkind: 'entity-mention',
  annotations: [{
    uuid: { value: crypto.randomUUID() },
    anchor: { textSpan: { byteStart: 0, byteEnd: 5 } },
    label: 'ingredient',
    knowledgeRefs: [{ source: 'wikidata', identifier: 'Q14806', label: 'flour' }],
  }],
  createdAt: new Date().toISOString(),
})

// Query annotations
const atPos = annotated.annotationsAt(3)
const inRange = annotated.annotationsInRange(0, 10)
const byKind = annotated.query({ kind: 'span', subkind: 'entity-mention' })
```

## Cross-format conversion

Any two formats with a lens path convert automatically. The panproto protolens
pipeline handles structural alignment; value-dependent rules (matchAttrs,
template names) are applied post-restrict.

```typescript
const doc = await from('tiptap', tiptapJson)
const slack = await to('slack', doc)
const bbcode = await to('bbcode', doc)
```

## Supported formats

| Category | Formats |
|----------|---------|
| Markup | CommonMark, GFM, HTML |
| JSON editors | Quill Delta, ProseMirror, TipTap, Lexical, Slate, Contentful, Sanity, Notion |
| Social | Bluesky, Mastodon, Slack, Discord, Telegram, WhatsApp, LinkedIn, Threads |
| Documents | BBCode, Org-mode, OPML, Apple News |
| Notebooks | Jupyter, Obsidian, Roam, Logseq |
| Markdown variants | MultiMarkdown, Pandoc, GitLab, MDX, MyST, Markdoc |
| Wiki / CMS | Confluence, JIRA, DokuWiki, MediaWiki, Textile |
| Specialized | Fountain |

## License

MIT OR Apache-2.0

Copyright 2026 Blaine Cook
