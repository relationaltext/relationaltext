'use client'

/**
 * Register format adapters for the multi-editor demo.
 *
 * Loads lexicon JSON + WASM binary (base64) + lenses and calls
 * registerFormat() so that from('mediawiki', ...) and
 * from('markdown', ...) work in the browser.
 *
 * IMPORTANT: Use the `from` export from THIS module, not from
 * 'relational-text/registry' directly -- webpack may create separate
 * module instances and the registry state won't be shared.
 */

import type { LensSpec } from 'relational-text/lens'
import type { Document } from 'relational-text/core'

let _initialized = false
let _initPromise: Promise<void> | null = null
let _from: ((name: string, input: string) => Promise<Document>) | null = null
let _autoTransform: ((jsonStr: string, targetNs: string) => string) | null = null
let _Document: (typeof Document) | null = null

/**
 * Parse input text in a registered format and transform to RT facets.
 *
 * Calls the format's WASM adapter to parse, then applies the lens graph
 * to convert format-specific facets (e.g. org.mediawiki.facet#heading)
 * to org.relationaltext.facet features. This means downstream code
 * downstream code works with a single unified format.
 */
export async function from(name: string, input: string): Promise<Document> {
  if (!_from || !_autoTransform) throw new Error('Call ensureFormats() before from()')
  const doc = await _from(name, input)
  // Transform all format-specific facets -> org.relationaltext.facet
  const transformed = _autoTransform(JSON.stringify(doc.toJSON()), 'org.relationaltext.facet')
  return _Document!.parse(transformed)
}

export async function ensureFormats(): Promise<void> {
  if (_initialized) return
  if (_initPromise) return _initPromise
  _initPromise = _init()
  return _initPromise
}

async function fetchText(path: string): Promise<string> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  return res.text()
}

async function fetchJson(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  return res.json()
}

// ---- Format definitions -------------------------------------------------------

interface FormatDef {
  name: string
  dir: string
  lexicon: string
  wasm?: string
  lenses: string[]
  aliases?: string[]
}

const ALL_FORMATS: FormatDef[] = [
  // Rich-text editors
  {
    name: 'quill',
    dir: 'org.quilljs.delta',
    lexicon: 'quill-delta.lexicon.json',
    wasm: 'quill.wasm.b64',
    lenses: ['quill-to-relationaltext.lens.json'],
  },
  {
    name: 'prosemirror',
    dir: 'org.prosemirror',
    lexicon: 'prosemirror.lexicon.json',
    wasm: 'prosemirror.wasm.b64',
    lenses: ['prosemirror-to-relationaltext.lens.json'],
  },
  {
    name: 'tiptap',
    dir: 'dev.tiptap',
    lexicon: 'tiptap.lexicon.json',
    wasm: 'tiptap.wasm.b64',
    lenses: ['tiptap-to-relationaltext.lens.json'],
  },
  {
    name: 'lexical',
    dir: 'io.lexical',
    lexicon: 'lexical.lexicon.json',
    wasm: 'lexical.wasm.b64',
    lenses: ['lexical-to-relationaltext.lens.json'],
  },
  {
    name: 'slate',
    dir: 'rocks.slate',
    lexicon: 'slate.lexicon.json',
    wasm: 'slate.wasm.b64',
    lenses: ['slate-to-relationaltext.lens.json'],
  },

  // Markup languages
  {
    name: 'markdown',
    dir: 'org.commonmark',
    lexicon: 'commonmark.lexicon.json',
    wasm: 'markdown.wasm.b64',
    lenses: [
      'commonmark-to-relationaltext.lens.json',
      'relationaltext-to-commonmark.lens.json',
    ],
    aliases: ['commonmark'],
  },
  {
    name: 'gfm',
    dir: 'org.commonmark',
    lexicon: 'gfm.lexicon.json',
    wasm: 'markdown.wasm.b64',
    lenses: ['gfm-to-relationaltext.lens.json'],
  },
  {
    name: 'html',
    dir: 'org.w3c.html',
    lexicon: 'whatwg-html.lexicon.json',
    wasm: 'html.wasm.b64',
    lenses: [
      'html-to-relationaltext.lens.json',
      'relationaltext-to-html.lens.json',
    ],
  },
  {
    name: 'bbcode',
    dir: 'org.bbcode',
    lexicon: 'bbcode.lexicon.json',
    wasm: 'bbcode.wasm.b64',
    lenses: ['bbcode-to-relationaltext.lens.json'],
  },
  {
    name: 'textile',
    dir: 'org.textile',
    lexicon: 'textile.lexicon.json',
    wasm: 'textile.wasm.b64',
    lenses: ['textile-to-relationaltext.lens.json'],
  },

  // Markdown variants
  {
    name: 'gitlab',
    dir: 'com.gitlab',
    lexicon: 'gitlab.lexicon.json',
    wasm: 'markdown.wasm.b64',
    lenses: ['gitlab-to-relationaltext.lens.json'],
  },
  {
    name: 'obsidian',
    dir: 'md.obsidian',
    lexicon: 'obsidian.lexicon.json',
    wasm: 'markdown.wasm.b64',
    lenses: ['obsidian-to-relationaltext.lens.json'],
  },
  {
    name: 'myst',
    dir: 'org.mystmd',
    lexicon: 'myst.lexicon.json',
    wasm: 'markdown.wasm.b64',
    lenses: ['myst-to-relationaltext.lens.json'],
  },
  {
    name: 'multimarkdown',
    dir: 'org.multimarkdown',
    lexicon: 'multimarkdown.lexicon.json',
    wasm: 'markdown.wasm.b64',
    lenses: ['multimarkdown-to-relationaltext.lens.json'],
  },
  {
    name: 'mdx',
    dir: 'dev.mdxjs',
    lexicon: 'mdx.lexicon.json',
    wasm: 'mdx.wasm.b64',
    lenses: ['mdx-to-relationaltext.lens.json'],
  },
  {
    name: 'markdoc',
    dir: 'com.markdoc',
    lexicon: 'markdoc.lexicon.json',
    wasm: 'markdoc.wasm.b64',
    lenses: ['markdoc-to-relationaltext.lens.json'],
  },

  // Wiki formats
  {
    name: 'confluence',
    dir: 'com.atlassian.wiki',
    lexicon: 'confluence.lexicon.json',
    wasm: 'confluence.wasm.b64',
    lenses: ['confluence-to-relationaltext.lens.json'],
    aliases: ['jira'],
  },
  {
    name: 'dokuwiki',
    dir: 'org.dokuwiki',
    lexicon: 'dokuwiki.lexicon.json',
    wasm: 'dokuwiki.wasm.b64',
    lenses: ['dokuwiki-to-relationaltext.lens.json'],
  },
  {
    name: 'mediawiki',
    dir: 'org.mediawiki',
    lexicon: 'mediawiki.lexicon.json',
    wasm: 'mediawiki.wasm.b64',
    lenses: ['mediawiki-to-relationaltext.lens.json'],
    aliases: ['wikitext'],
  },

  // CMS formats
  {
    name: 'contentful',
    dir: 'com.contentful.richtext',
    lexicon: 'contentful.lexicon.json',
    wasm: 'contentful.wasm.b64',
    lenses: ['contentful-to-relationaltext.lens.json'],
  },
  {
    name: 'sanity',
    dir: 'io.sanity.portabletext',
    lexicon: 'sanity.lexicon.json',
    wasm: 'sanity.wasm.b64',
    lenses: ['sanity-to-relationaltext.lens.json'],
  },
  {
    name: 'notion',
    dir: 'com.notion',
    lexicon: 'notion.lexicon.json',
    wasm: 'notion.wasm.b64',
    lenses: ['notion-to-relationaltext.lens.json'],
  },

  // Social/messaging formats
  {
    name: 'slack',
    dir: 'com.slack.mrkdwn',
    lexicon: 'slack.lexicon.json',
    wasm: 'slack.wasm.b64',
    lenses: ['slack-to-relationaltext.lens.json'],
  },
  {
    name: 'discord',
    dir: 'com.discord',
    lexicon: 'discord.lexicon.json',
    wasm: 'discord.wasm.b64',
    lenses: ['discord-to-relationaltext.lens.json'],
  },
  {
    name: 'telegram',
    dir: 'org.telegram',
    lexicon: 'telegram.lexicon.json',
    wasm: 'telegram.wasm.b64',
    lenses: ['telegram-to-relationaltext.lens.json'],
  },
  {
    name: 'whatsapp',
    dir: 'com.whatsapp',
    lexicon: 'whatsapp.lexicon.json',
    wasm: 'whatsapp.wasm.b64',
    lenses: ['whatsapp-to-relationaltext.lens.json'],
  },
  {
    name: 'mastodon',
    dir: 'org.joinmastodon',
    lexicon: 'mastodon.lexicon.json',
    // No WASM -- lens-only format (HTML-based)
    lenses: [
      'mastodon-to-relationaltext.lens.json',
      'html-to-mastodon.lens.json',
    ],
  },
  {
    name: 'linkedin',
    dir: 'com.linkedin',
    lexicon: 'linkedin.lexicon.json',
    wasm: 'linkedin.wasm.b64',
    lenses: ['linkedin-to-relationaltext.lens.json'],
  },
  {
    name: 'threads',
    dir: 'com.threads',
    lexicon: 'threads.lexicon.json',
    wasm: 'threads.wasm.b64',
    lenses: ['threads-to-relationaltext.lens.json'],
  },

  // ATProto / Bluesky
  {
    name: 'bluesky',
    dir: 'app.bsky.richtext',
    lexicon: 'bluesky.lexicon.json',
    wasm: 'bluesky.wasm.b64',
    lenses: [],
  },

  // Other structured formats
  {
    name: 'applenews',
    dir: 'com.apple.news',
    lexicon: 'applenews.lexicon.json',
    wasm: 'applenews.wasm.b64',
    lenses: [
      'applenews-to-relationaltext.lens.json',
      'relationaltext-to-applenews.lens.json',
    ],
  },
  {
    name: 'pandoc',
    dir: 'org.pandoc',
    lexicon: 'pandoc.lexicon.json',
    wasm: 'pandoc.wasm.b64',
    lenses: ['pandoc-to-relationaltext.lens.json'],
  },
  {
    name: 'fountain',
    dir: 'com.fountain',
    lexicon: 'fountain.lexicon.json',
    wasm: 'fountain.wasm.b64',
    lenses: ['fountain-to-relationaltext.lens.json'],
  },
  {
    name: 'opml',
    dir: 'org.opml',
    lexicon: 'opml.lexicon.json',
    wasm: 'opml.wasm.b64',
    lenses: ['opml-to-relationaltext.lens.json'],
  },
  {
    name: 'org',
    dir: 'org.orgmode',
    lexicon: 'org.lexicon.json',
    wasm: 'org.wasm.b64',
    lenses: ['org-to-relationaltext.lens.json'],
  },
  {
    name: 'jupyter',
    dir: 'org.jupyter',
    lexicon: 'jupyter.lexicon.json',
    wasm: 'jupyter.wasm.b64',
    lenses: ['jupyter-to-relationaltext.lens.json'],
  },

  // Import-only formats
  {
    name: 'roam',
    dir: 'com.roamresearch',
    lexicon: 'roam.lexicon.json',
    wasm: 'roam.wasm.b64',
    lenses: ['roam-to-relationaltext.lens.json'],
  },
  {
    name: 'logseq',
    dir: 'com.logseq',
    lexicon: 'logseq.lexicon.json',
    wasm: 'logseq.wasm.b64',
    lenses: ['logseq-to-relationaltext.lens.json'],
  },
]

// ---- Initialization -----------------------------------------------------------

async function _init(): Promise<void> {
  const { initRelationalText } = await import('relational-text/wasm')
  const registry = await import('relational-text/registry')
  const { lensGraph } = await import('relational-text/lens')
  const { Document: Doc } = await import('relational-text/core')

  await initRelationalText()
  await registry.init()

  // Capture from the SAME module instances
  _from = registry.from
  _autoTransform = lensGraph.autoTransform.bind(lensGraph)
  _Document = Doc

  // Register all formats in parallel
  await Promise.all(ALL_FORMATS.map(async (def) => {
    const base = `/formats/${def.dir}`

    // Fetch lexicon, WASM (if present), and all lenses in parallel
    const fetches: Promise<unknown>[] = [
      fetchJson(`${base}/${def.lexicon}`),
    ]
    if (def.wasm) {
      fetches.push(fetchText(`${base}/${def.wasm}`))
    }
    for (const lens of def.lenses) {
      fetches.push(fetchJson(`${base}/${lens}`))
    }

    const results = await Promise.all(fetches)

    let idx = 0
    const lexicon = results[idx++] as Record<string, unknown>
    const wasmData = def.wasm ? (results[idx++] as string).trim() : undefined
    const lenses = def.lenses.map(() => results[idx++] as unknown as LensSpec)

    registry.registerFormat(def.name, lexicon, {
      wasmData,
      lenses,
      aliases: def.aliases,
    })
  }))

  _initialized = true
}
