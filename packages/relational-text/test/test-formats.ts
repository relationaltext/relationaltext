/**
 * Shared test helper — registers all known formats with the async registry.
 *
 * Usage:
 *   import { registerTestFormats } from './test-formats.js'
 *
 *   // Register everything:
 *   registerTestFormats()
 *
 *   // Register only what you need:
 *   registerTestFormats('markdown', 'html', 'slack')
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { registerFormat, hasFormat } from '../src/registry.js'
import type { LensSpec } from '../src/lens.js'

// ─── Helpers ────────────────────────────────────────────────────────────────────

const FORMATS_ROOT = join(__dirname, '..', '..', '..', 'formats')

function loadJSON(formatDir: string, filename: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FORMATS_ROOT, formatDir, filename), 'utf8')) as Record<string, unknown>
}

function loadText(formatDir: string, filename: string): string {
  return readFileSync(join(FORMATS_ROOT, formatDir, filename), 'utf8').trim()
}

function loadLens(formatDir: string, filename: string): LensSpec {
  return JSON.parse(readFileSync(join(FORMATS_ROOT, formatDir, filename), 'utf8')) as LensSpec
}

function tryLoadText(formatDir: string, filename: string): string | undefined {
  try {
    return loadText(formatDir, filename)
  } catch {
    return undefined
  }
}

// ─── Format definitions ─────────────────────────────────────────────────────────

interface FormatDef {
  name: string
  dir: string
  lexicon: string
  wasm?: string
  lenses: string[]
  aliases?: string[]
}

const FORMAT_DEFS: FormatDef[] = [
  // ── Rich-text editors ──────────────────────────────────────────────────────
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

  // ── Markup languages ───────────────────────────────────────────────────────
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

  // ── Markdown variants ──────────────────────────────────────────────────────
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

  // ── Wiki formats ───────────────────────────────────────────────────────────
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
  },
  {
    name: 'cooklang',
    dir: 'org.cooklang',
    lexicon: 'cooklang.lexicon.json',
    wasm: 'cooklang.wasm.b64',
    lenses: ['cooklang-to-relationaltext.lens.json'],
  },
  {
    name: 'mealmaster',
    dir: 'org.mealmaster',
    lexicon: 'mealmaster.lexicon.json',
    wasm: 'mealmaster.wasm.b64',
    lenses: ['mealmaster-to-relationaltext.lens.json'],
  },

  // ── CMS formats ────────────────────────────────────────────────────────────
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

  // ── Social/messaging formats ───────────────────────────────────────────────
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
    // No WASM — lens-only format (HTML-based)
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

  // ── ATProto / Bluesky ──────────────────────────────────────────────────────
  {
    name: 'bluesky',
    dir: 'app.bsky.richtext',
    lexicon: 'bluesky.lexicon.json',
    wasm: 'bluesky.wasm.b64',
    lenses: [],
  },

  // ── Other structured formats ───────────────────────────────────────────────
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

  // ── Import-only formats ────────────────────────────────────────────────────
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

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Register test formats with the async registry.
 *
 * Call with no arguments to register ALL formats, or pass specific names
 * to register only what your test needs.
 *
 * Skips formats already registered (idempotent).
 */
export function registerTestFormats(...names: string[]): void {
  const defs = names.length > 0
    ? FORMAT_DEFS.filter((d) => names.includes(d.name) || d.aliases?.some((a) => names.includes(a)))
    : FORMAT_DEFS

  for (const def of defs) {
    if (hasFormat(def.name)) continue

    const lexicon = loadJSON(def.dir, def.lexicon)
    const wasmData = def.wasm ? tryLoadText(def.dir, def.wasm) : undefined
    const lenses = def.lenses.map((f) => loadLens(def.dir, f))

    registerFormat(def.name, lexicon, {
      wasmData,
      lenses,
      aliases: def.aliases,
    })
  }
}

/** All known format names (not including aliases). */
export const ALL_FORMAT_NAMES = FORMAT_DEFS.map((d) => d.name)

/** All format definitions (for programmatic access). */
export { FORMAT_DEFS }
