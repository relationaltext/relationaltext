# Lexicon API

## `ensureRelationalTextLexicon()`

```ts
function ensureRelationalTextLexicon(): void
```

Registers the `org.relationaltext.facet` namespace with the WASM runtime. Called automatically by `registerFeatureType()` — explicit calls are only needed when working directly with the WASM layer.

---

## `registerFeatureType(descriptor)`

```ts
function registerFeatureType(descriptor: FeatureTypeDescriptor): void
```

Register a single custom feature type with the WASM runtime. The registry maps each `$type` (and optional `name`) to its class and expand semantics.

```ts
interface FeatureTypeDescriptor {
  $type: string
  name?: string
  featureClass: 'block' | 'inline' | 'entity' | 'meta'
  expandStart?: boolean
  expandEnd?: boolean
}
```

`featureClass` controls HIR placement: `block` creates a block node, `inline` creates a mark on text, `entity` creates an atomic inline node (never split), `meta` is ignored by the renderer. `expandStart`/`expandEnd` follow Peritext semantics — text inserted at the boundary is included inside the mark when `true`.

```ts
import { registerFeatureType } from 'relational-text'

registerFeatureType({
  $type: 'com.myapp.facet',
  name: 'highlight',
  featureClass: 'inline',
  expandStart: true,
  expandEnd: true,
})
```

---

## `register_lexicon(json)` (WASM)

```ts
function register_lexicon(json: string): void
```

Bulk-register feature types from a JSON blob conforming to the `community.lexicon.format-lexicon` schema. Called internally by all `ensureXxxLexicon()` functions — direct use is only needed when loading a custom lexicon from outside the package.

```ts
import { register_lexicon } from 'relational-text/wasm'

const lexiconJson = await fetch('/my-format.lexicon.json').then(r => r.text())
register_lexicon(lexiconJson)
```

---

## `applyFacetSQL(doc, sql)`

```ts
function applyFacetSQL(doc: DocumentJSON, sql: string): DocumentJSON
```

Apply a raw SQL transformation to a document's facets using the built-in facet SQL engine. The SQL dialect operates on a virtual `facets` table with columns `byte_start`, `byte_end`, `type_id`, `name`, and `data`. See [SQL Engine](/sql-engine/) for the full dialect reference.

```ts
import { applyFacetSQL } from 'relational-text'

// Remove all features of a given type
const cleaned = applyFacetSQL(doc.toJSON(), `
  DELETE FROM facets WHERE type_id = 'com.myapp.facet'
`)
```

---

## `ensureXxxLexicon()` functions

Each function registers its namespace lazily (once per process). Calling the corresponding `from`/`to` functions triggers registration automatically — explicit calls are only needed when constructing documents manually or using the WASM layer directly.

| Function | Namespace | Notes |
|---|---|---|
| `ensureRelationalTextLexicon()` | `org.relationaltext.facet` | Hub format |
| `ensureMarkdownLexicon()` | `org.commonmark.facet` | Also registers GFM |
| `ensureHtmlLexicon()` | `org.w3c.html.facet` | WHATWG HTML spec |
| `ensureBlueskyLexicon()` | `app.bsky.richtext.facet` | |
| `ensureMastodonLexicon()` | `org.joinmastodon.facet` | |
| `ensureSlackLexicon()` | `com.slack.mrkdwn.facet` | |
| `ensureDiscordLexicon()` | `com.discord.facet` | |
| `ensureTelegramLexicon()` | `org.telegram.facet` | |
| `ensureWhatsAppLexicon()` | `com.whatsapp.facet` | |
| `ensureLinkedInLexicon()` | `com.linkedin.facet` | |
| `ensureThreadsLexicon()` | `com.threads.facet` | |
| `ensureQuillLexicon()` | `org.quilljs.delta.facet` | |
| `ensureProseMirrorLexicon()` | `org.prosemirror.facet` | |
| `ensureTipTapLexicon()` | `dev.tiptap.facet` | |
| `ensureLexicalLexicon()` | `io.lexical.facet` | |
| `ensureSlateLexicon()` | `rocks.slate.facet` | |
| `ensureNotionLexicon()` | `com.notion.facet` | |
| `ensureContentfulLexicon()` | `com.contentful.richtext.facet` | |
| `ensureSanityLexicon()` | `io.sanity.portabletext.facet` | |
| `ensureBBCodeLexicon()` | `org.bbcode.facet` | |
| `ensureTextileLexicon()` | `org.textile.facet` | |
| `ensureConfluenceLexicon()` | `com.atlassian.wiki.facet` | |
