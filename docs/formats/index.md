# Formats Overview

RelationalText supports 40+ input/output formats. All formats are accessible through the generic `from` / `to` dispatcher or via their dedicated module functions.

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '**Hello** world')
const html = to('html', doc)
```

## Rich Text Editors

Editor formats use a JSON wire format representing the editor's internal document state. Each editor has its own node/mark type system; RelationalText uses the editor's native type strings as feature names (transliteration principle). All editor adapters register both their lexicon and a lens to CommonMark via `ensureXxxLexicon()`.

| Format key | `from` | `to` | Wire type | Notes |
|------------|--------|------|-----------|-------|
| [`prosemirror`](/formats/prosemirror) | ✓ | ✓ | JSON string | ProseMirror doc JSON, `org.prosemirror.facet` namespace |
| [`tiptap`](/formats/tiptap) | ✓ | ✓ | JSON string | TipTap doc JSON, `dev.tiptap.facet` namespace |
| [`quill`](/formats/quill) | ✓ | ✓ | JSON string | Quill Delta JSON, `org.quilljs.delta.facet` namespace |
| [`lexical`](/formats/lexical) | ✓ | ✓ | JSON string | Lexical editor JSON, `io.lexical.facet` namespace |
| [`slate`](/formats/slate) | ✓ | ✓ | JSON string | Slate editor JSON, `rocks.slate.facet` namespace |

## Markup Languages

Markup language adapters work with string wire formats. All formats use `ensureXxxLexicon()` for registration. Extended markup formats (MDX, MyST, GitLab, etc.) additionally register a lens to CommonMark.

| Format key | `from` | `to` | Wire type | Notes |
|------------|--------|------|-----------|-------|
| [`markdown`](/formats/markdown) | ✓ | ✓ | string | CommonMark 0.31, `org.commonmark.facet` namespace |
| [`gfm`](/formats/markdown) | ✓ | ✓ | string | Alias for `markdown`; GFM extensions auto-registered |
| [`html`](/formats/html) | ✓ | ✓ | string | WHATWG HTML, `org.w3c.html.facet` namespace |
| [`mdx`](/formats/mdx) | ✓ | ✓ | string | MDX (Markdown + JSX), `org.mdx.facet` namespace |
| [`myst`](/formats/myst) | ✓ | ✓ | string | MyST Markdown, `org.myst.facet` namespace |
| [`pandoc`](/formats/pandoc) | ✓ | ✓ | string | Pandoc markdown, `org.pandoc.facet` namespace |
| [`multimarkdown`](/formats/multimarkdown) | ✓ | ✓ | string | MultiMarkdown |
| [`gitlab`](/formats/gitlab) | ✓ | ✓ | string | GitLab Flavored Markdown, `org.gitlab.facet` namespace |
| [`markdoc`](/formats/markdoc) | ✓ | ✓ | string | Markdoc, `com.markdoc.facet` namespace |

## Social Platforms

Social platform adapters handle platform-specific wire formats (constrained HTML, custom markdown dialects, or structured JSON). Each registers its lexicon and a lens to CommonMark, enabling seamless cross-platform conversion.

| Format key | `from` | `to` | Wire type | Notes |
|------------|--------|------|-----------|-------|
| [`bluesky`](/formats/bluesky) | ✓ | ✓ | JSON string | atproto `{ text, facets }` wire format |
| [`mastodon`](/formats/mastodon) | ✓ | ✓ | string | ActivityPub constrained HTML, `org.joinmastodon.facet` |
| [`slack`](/formats/slack) | ✓ | ✓ | string | Slack mrkdwn, `com.slack.mrkdwn.facet` |
| [`discord`](/formats/discord) | ✓ | ✓ | string | Discord markdown, `com.discord.facet` |
| [`telegram`](/formats/telegram) | ✓ | ✓ | string | Telegram Bot API entities, `org.telegram.facet` |
| [`whatsapp`](/formats/whatsapp) | ✓ | ✓ | string | WhatsApp formatting, `com.whatsapp.facet` |
| [`linkedin`](/formats/linkedin) | ✓ | ✓ | string | LinkedIn markdown, `com.linkedin.facet` |
| [`threads`](/formats/threads) | ✓ | ✓ | string | Threads / Instagram, `com.threads.facet` |

## Note-Taking & Wikis

Note-taking and wiki adapters support a wide range of formats — from proprietary app exports (Notion, Roam) to open wiki syntaxes (DokuWiki, MediaWiki). Import-only formats (`roam`, `logseq`) do not support export; use a lens to convert to a supported output format.

| Format key | `from` | `to` | Wire type | Notes |
|------------|--------|------|-----------|-------|
| [`notion`](/formats/notion) | ✓ | ✓ | JSON string | Notion blocks, `com.notion.facet` |
| [`confluence`](/formats/confluence) | ✓ | ✓ | string | Confluence wiki markup |
| [`jira`](/formats/confluence) | ✓ | ✓ | string | JIRA wiki markup (alias for `confluence`) |
| [`obsidian`](/formats/obsidian) | ✓ | ✓ | string | Obsidian markdown, `md.obsidian.facet` |
| [`roam`](/formats/roam) | ✓ | — | JSON string | Roam Research export. Import only. |
| [`logseq`](/formats/logseq) | ✓ | — | string | Logseq Markdown export. Import only. |
| [`org`](/formats/org) | ✓ | ✓ | string | Org-mode, `org.orgmode.facet` |
| [`dokuwiki`](/formats/dokuwiki) | ✓ | ✓ | string | DokuWiki markup, `org.dokuwiki.facet` |
| [`mediawiki`](/formats/mediawiki) | ✓ | ✓ | string | MediaWiki markup, `org.mediawiki.facet` |
| [`jupyter`](/formats/jupyter) | ✓ | ✓ | JSON string | Jupyter notebook, `org.jupyter.facet` |

## Publishing & CMS

CMS and publishing adapters cover headless CMS platforms (Contentful, Sanity), structured document formats (OPML), and specialized markup languages (BBCode, Textile, Fountain/screenplay).

| Format key | `from` | `to` | Wire type | Notes |
|------------|--------|------|-----------|-------|
| [`contentful`](/formats/contentful) | ✓ | ✓ | JSON string | Contentful Rich Text, `com.contentful.richtext.facet` |
| [`sanity`](/formats/sanity) | ✓ | ✓ | JSON string | Sanity Portable Text, `io.sanity.portabletext.facet` |
| [`bbcode`](/formats/bbcode) | ✓ | ✓ | string | BBCode markup, `org.bbcode.facet` |
| [`textile`](/formats/textile) | ✓ | ✓ | string | Textile markup, `org.textile.facet` |
| [`fountain`](/formats/fountain) | ✓ | ✓ | string | Fountain screenplay, `com.fountain.facet` |
| [`opml`](/formats/opml) | ✓ | ✓ | string | OPML outline, `org.opml.facet` |

## Collaboration

Collaboration formats are designed for real-time or asynchronous multi-user editing. The Automerge adapter works with CRDT document snapshots and change streams, making it suitable for peer-to-peer and local-first applications.

| Format key | `from` | `to` | Wire type | Notes |
|------------|--------|------|-----------|-------|
| [`automerge`](/formats/automerge) | ✓ | ✓ | Automerge CRDT | Snapshot + change-stream; peer dependency |

## Import-Only Formats

`roam` and `logseq` are import-only. Calling `to('roam', doc)` throws:

```
Format 'roam' does not support export (import only).
Use a lens to convert to a supported output format first.
```

## JSON-Format Inputs and Outputs

Formats that use JSON as their wire format (quill, prosemirror, tiptap, lexical, slate, contentful, sanity, notion, jupyter, bluesky) accept and return JSON strings when used through the `from` / `to` dispatcher.

```ts
// ProseMirror round-trip
const pmJson = '{"type":"doc","content":[...]}'
const doc = from('prosemirror', pmJson)
const out = to('prosemirror', doc)  // JSON string
```

## Lexicon Namespaces

Every format module registers its features under a stable NSID (namespace identifier). The namespace is used to:

1. Match features in lens rules (`source` / `target` fields)
2. Identify which renderer to use when calling `to('markdown', ...)` / `to('html', ...)`
3. Filter features by namespace (e.g., `filter_facets_by_namespace` for Bluesky export)

Lenses provide automatic conversion between namespaces — see [Lenses](../lenses/).

## Lexicon Registration

All format modules use the `ensureXxxLexicon()` pattern for registration. This function:

- Registers the WASM lexicon (feature classes and Peritext expand semantics)
- Registers the format's conversion lens with `autoApply: true` (where applicable)
- Is idempotent — subsequent calls are no-ops

```ts
import { ensureMarkdownLexicon } from 'relational-text/markdown'
import { ensureHtmlLexicon }     from 'relational-text/html'
import { ensureMastodonLexicon } from 'relational-text/mastodon'
import { ensureQuillLexicon }    from 'relational-text/quill'

ensureMarkdownLexicon()  // registers org.commonmark.facet + org.gfm.facet feature classes
ensureHtmlLexicon()      // registers org.w3c.html.facet feature classes
ensureMastodonLexicon()  // registers org.joinmastodon.facet + lens → org.commonmark.facet
ensureQuillLexicon()     // registers org.quilljs.delta.facet + lens → org.commonmark.facet
```

**These are called automatically** by `from()` and `to()` on first use. You do not need to call them manually unless you want to pre-register at startup (e.g., to avoid cold-start latency on a server).

### When lenses enter the graph

Lenses enter the global `lensGraph` when `ensureXxxLexicon()` is first called. Because `from()` / `to()` call `ensureXxxLexicon()` automatically, lenses are registered lazily on first use of a format function.

If you call `lensGraph.findPath()` or `autoTransform()` before using any format function, no lenses will be registered yet. In server environments, pre-register all formats at startup:

```ts
import { ensureMastodonLexicon }  from 'relational-text/mastodon'
import { ensureQuillLexicon }     from 'relational-text/quill'
import { ensureProseMirrorLexicon } from 'relational-text/prosemirror'

ensureMastodonLexicon()
ensureQuillLexicon()
ensureProseMirrorLexicon()
```
