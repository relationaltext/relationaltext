/**
 * Generates docs.md for each format adapter directory.
 *
 * Usage:  npx tsx scripts/gen-format-docs.ts
 *
 * Skip rule: if docs.md already exists AND is > 2000 bytes, preserve it.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

/** Write file only if content changed; log the outcome. */
function writeIfChanged(file: string, content: string): void {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) {
    console.log(`  unchanged: ${path.relative(ROOT, file)}`)
    return
  }
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, content, 'utf8')
  console.log(`  wrote: ${path.relative(ROOT, file)}`)
}

// ── Lookups ──────────────────────────────────────────────────────────────────

const FORMAT_INFO: Record<string, [string, string]> = {
  'org.commonmark': ['Markdown (CommonMark)', 'The CommonMark specification for Markdown, the most widely-used lightweight markup language. RelationalText passes all 652 CommonMark spec tests.'],
  'org.w3c.html': ['HTML', 'The WHATWG HTML Living Standard — the native language of the web.'],
  'app.bsky.richtext': ['Bluesky', 'AT Protocol rich text facets used by Bluesky and other atproto applications.'],
  'org.quilljs.delta': ['Quill Delta', 'The Delta format used by the Quill rich text editor.'],
  'org.prosemirror': ['ProseMirror', 'The document model used by the ProseMirror editor toolkit.'],
  'dev.tiptap': ['TipTap', 'The document format for TipTap, a headless rich text editor built on ProseMirror.'],
  'io.lexical': ['Lexical', 'The document model for Lexical, Meta\'s extensible text editor framework.'],
  'rocks.slate': ['Slate', 'The document model for Slate, a customizable rich text editor framework.'],
  'com.contentful.richtext': ['Contentful Rich Text', 'The structured rich text format used by the Contentful CMS.'],
  'io.sanity.portabletext': ['Sanity Portable Text', 'Portable Text, the rich text format used by Sanity CMS.'],
  'com.notion': ['Notion', 'The block-based document model used by Notion.'],
  'com.slack.mrkdwn': ['Slack (mrkdwn)', 'Slack\'s mrkdwn markup format for messages and surfaces.'],
  'com.discord': ['Discord', 'Discord\'s Markdown-based message formatting.'],
  'org.telegram': ['Telegram', 'Telegram Bot API message entities and formatting.'],
  'com.whatsapp': ['WhatsApp', 'WhatsApp\'s text formatting syntax for messages.'],
  'org.joinmastodon': ['Mastodon', 'HTML-based status formatting used by Mastodon and the Fediverse.'],
  'com.linkedin': ['LinkedIn', 'LinkedIn\'s post and article formatting.'],
  'org.bbcode': ['BBCode', 'Bulletin Board Code, a lightweight markup language used in forum software.'],
  'com.threads': ['Threads', 'Meta Threads post formatting.'],
  'org.jupyter': ['Jupyter', 'Jupyter notebook cell formatting (Markdown cells with outputs).'],
  'md.obsidian': ['Obsidian', 'Extended Markdown used by the Obsidian knowledge management app.'],
  'com.logseq': ['Logseq', 'The outliner-based document format used by Logseq.'],
  'com.roamresearch': ['Roam Research', 'The block-based format used by Roam Research.'],
  'org.orgmode': ['Org-mode', 'Emacs Org-mode document format.'],
  'org.opml': ['OPML', 'Outline Processor Markup Language — the standard interchange format for outliners.'],
  'org.pandoc': ['Pandoc', 'Pandoc\'s extended Markdown with native divs, spans, and attributes.'],
  'com.gitlab': ['GitLab Flavored Markdown', 'GitLab\'s extended Markdown with inline diffs, math, and task lists.'],
  'dev.mdxjs': ['MDX', 'Markdown with JSX — embeds React components in Markdown documents.'],
  'org.mystmd': ['MyST', 'Markedly Structured Text — a Sphinx-compatible Markdown dialect for scientific publishing.'],
  'org.multimarkdown': ['MultiMarkdown', 'Fletcher Penney\'s extended Markdown with metadata, tables, and cross-references.'],
  'com.atlassian.wiki': ['Confluence / JIRA', 'Atlassian\'s wiki markup used in Confluence and JIRA.'],
  'org.dokuwiki': ['DokuWiki', 'The wiki syntax used by DokuWiki.'],
  'org.mediawiki': ['MediaWiki', 'The wikitext markup used by Wikipedia and MediaWiki installations.'],
  'org.textile': ['Textile', 'A lightweight markup language used in Redmine, Textpattern, and other CMS platforms.'],
  'com.fountain': ['Fountain', 'A plain-text markup language for writing screenplays.'],
  'com.markdoc': ['Markdoc', 'Stripe\'s Markdown-based document format with custom tags and functions.'],
  'com.apple.news': ['Apple News Format', 'Apple News Format (ANF) for publishing articles to Apple News.'],
  'org.relationaltext': ['RelationalText Hub', 'The canonical hub format. All other formats convert through this namespace.'],
}

const SLUG_MAP: Record<string, string> = {
  'org.commonmark': 'markdown',
  'org.w3c.html': 'html',
  'app.bsky.richtext': 'bluesky',
  'org.quilljs.delta': 'quill',
  'org.prosemirror': 'prosemirror',
  'dev.tiptap': 'tiptap',
  'io.lexical': 'lexical',
  'rocks.slate': 'slate',
  'com.contentful.richtext': 'contentful',
  'io.sanity.portabletext': 'sanity',
  'com.notion': 'notion',
  'com.slack.mrkdwn': 'slack',
  'com.discord': 'discord',
  'org.telegram': 'telegram',
  'com.whatsapp': 'whatsapp',
  'org.joinmastodon': 'mastodon',
  'com.linkedin': 'linkedin',
  'org.bbcode': 'bbcode',
  'com.threads': 'threads',
  'org.jupyter': 'jupyter',
  'md.obsidian': 'obsidian',
  'com.logseq': 'logseq',
  'com.roamresearch': 'roam',
  'org.orgmode': 'org',
  'org.opml': 'opml',
  'org.pandoc': 'pandoc',
  'com.gitlab': 'gitlab',
  'dev.mdxjs': 'mdx',
  'org.mystmd': 'myst',
  'org.multimarkdown': 'multimarkdown',
  'com.atlassian.wiki': 'confluence',
  'org.dokuwiki': 'dokuwiki',
  'org.mediawiki': 'mediawiki',
  'org.textile': 'textile',
  'com.fountain': 'fountain',
  'com.markdoc': 'markdoc',
  'com.apple.news': 'applenews',
  'org.relationaltext': 'core',
}

// ── Types ────────────────────────────────────────────────────────────────────

interface LexiconFeature {
  typeId: string
  featureClass: 'inline' | 'block' | 'entity'
  expandStart?: boolean
  expandEnd?: boolean
}

interface Lexicon {
  id: string
  version?: string
  specUrl?: string
  features: LexiconFeature[]
}

interface LensRule {
  match: { name: string; matchAttrs?: Record<string, unknown> }
  replace: { name: string; addAttrs?: Record<string, unknown>; renameAttrs?: Record<string, string>; dropAttrs?: string[] } | null
}

interface LensSpec {
  passthrough?: string
  invertible?: boolean
  rules: LensRule[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findFileByGlob(dir: string, pattern: RegExp): string | undefined {
  const entries = fs.readdirSync(dir)
  return entries.find(e => pattern.test(e))
}

function featureName(typeId: string): string {
  const idx = typeId.indexOf('#')
  return idx >= 0 ? typeId.slice(idx + 1) : typeId
}

function expandLabel(f: LexiconFeature): string {
  if (f.expandStart === undefined && f.expandEnd === undefined) return '-'
  if (f.expandStart && f.expandEnd) return 'both'
  if (!f.expandStart && !f.expandEnd) return 'neither'
  if (f.expandStart) return 'start'
  return 'end'
}

function extractExportedFunctions(tsSource: string): string[] {
  const fns: string[] = []
  const fnRegex = /export\s+(?:async\s+)?function\s+(\w+)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = fnRegex.exec(tsSource)) !== null) {
    fns.push(m[1])
  }
  // Also catch: export const foo = ...
  const constRegex = /export\s+const\s+(\w+)\s*=/g
  while ((m = constRegex.exec(tsSource)) !== null) {
    fns.push(m[1])
  }
  return fns
}

function formatAttrs(attrs: Record<string, unknown> | undefined): string {
  if (!attrs || Object.keys(attrs).length === 0) return ''
  return JSON.stringify(attrs).replace(/"/g, '')
}

// ── Main ─────────────────────────────────────────────────────────────────────

const formatsDir = path.join(ROOT, 'formats')
const formatDirs = fs.readdirSync(formatsDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== 'org.pannacotta')
  .map(d => d.name)
  .sort()

let generated = 0
let skipped = 0

for (const dirName of formatDirs) {
  const formatDir = path.join(formatsDir, dirName)
  const docsPath = path.join(formatDir, 'docs.md')

  // Skip rule: preserve hand-written docs
  if (fs.existsSync(docsPath)) {
    const stat = fs.statSync(docsPath)
    if (stat.size > 2000) {
      console.log(`  skip (existing ${stat.size}b): ${dirName}/docs.md`)
      skipped++
      continue
    }
  }

  const info = FORMAT_INFO[dirName]
  if (!info) {
    console.log(`  skip (no format info): ${dirName}`)
    skipped++
    continue
  }
  const [displayName, description] = info
  const slug = SLUG_MAP[dirName]

  // 1. Read lexicon
  const lexiconFile = findFileByGlob(formatDir, /\.lexicon\.json$/)
  if (!lexiconFile) {
    console.log(`  skip (no lexicon): ${dirName}`)
    skipped++
    continue
  }
  const lexicon: Lexicon = JSON.parse(
    fs.readFileSync(path.join(formatDir, lexiconFile), 'utf8')
  )
  const namespace = lexicon.id

  // 2. Read lens (optional)
  const lensFile = findFileByGlob(formatDir, /-to-relationaltext\.lens\.json$/)
  let lens: LensSpec | undefined
  if (lensFile) {
    lens = JSON.parse(fs.readFileSync(path.join(formatDir, lensFile), 'utf8'))
  }

  // 3. Read TS file for exports (optional)
  const tsDir = path.join(formatDir, 'ts')
  let exportedFns: string[] = []
  if (fs.existsSync(tsDir)) {
    const tsFiles = fs.readdirSync(tsDir).filter(f => f.endsWith('.ts'))
    for (const tf of tsFiles) {
      const src = fs.readFileSync(path.join(tsDir, tf), 'utf8')
      exportedFns.push(...extractExportedFunctions(src))
    }
  }

  const fromFn = exportedFns.find(f => /^from[A-Z]/.test(f))
  const toFn = exportedFns.find(f => /^to[A-Z]/.test(f))
  const ensureFn = exportedFns.find(f => /^ensure.*Lexicon/.test(f))

  // 4. Build markdown
  const lines: string[] = []

  // Header
  lines.push(`# ${displayName}`)
  lines.push('')
  lines.push(description)
  lines.push('')
  lines.push(`**Namespace:** \`${namespace}\``)
  if (lexicon.specUrl) {
    lines.push(`**Spec:** <${lexicon.specUrl}>`)
  }
  if (lexicon.version) {
    lines.push(`**Version:** ${lexicon.version}`)
  }

  // Quick Start (only if we have TS exports)
  if (slug && (fromFn || toFn)) {
    lines.push('')
    lines.push('## Quick Start')
    lines.push('')

    const imports = [fromFn ? 'from' : '', toFn ? 'to' : ''].filter(Boolean).join(', ')
    lines.push('```ts')
    lines.push(`import { ${imports} } from 'relational-text/registry'`)
    lines.push('```')
    lines.push('')

    if (fromFn) {
      lines.push('```ts')
      lines.push(`// Import from ${displayName}`)
      lines.push(`const doc = from('${slug}', input)`)
      if (toFn) {
        lines.push('')
        lines.push(`// Export to ${displayName}`)
        lines.push(`const output = to('${slug}', doc)`)
      }
      lines.push('```')
    }
  }

  // Features
  const inlines = lexicon.features.filter(f => f.featureClass === 'inline')
  const blocks = lexicon.features.filter(f => f.featureClass === 'block')
  const entities = lexicon.features.filter(f => f.featureClass === 'entity')

  if (inlines.length || blocks.length || entities.length) {
    lines.push('')
    lines.push('## Features')
  }

  if (inlines.length) {
    lines.push('')
    lines.push('### Inline')
    lines.push('')
    lines.push('| Feature | Type ID | Expand |')
    lines.push('|---------|---------|--------|')
    for (const f of inlines) {
      lines.push(`| ${featureName(f.typeId)} | \`${f.typeId}\` | ${expandLabel(f)} |`)
    }
  }

  if (blocks.length) {
    lines.push('')
    lines.push('### Block')
    lines.push('')
    lines.push('| Feature | Type ID |')
    lines.push('|---------|---------|')
    for (const f of blocks) {
      lines.push(`| ${featureName(f.typeId)} | \`${f.typeId}\` |`)
    }
  }

  if (entities.length) {
    lines.push('')
    lines.push('### Entity')
    lines.push('')
    lines.push('| Feature | Type ID |')
    lines.push('|---------|---------|')
    for (const f of entities) {
      lines.push(`| ${featureName(f.typeId)} | \`${f.typeId}\` |`)
    }
  }

  // Lens Mapping
  if (lens && lens.rules.length) {
    lines.push('')
    lines.push('## Lens Mapping')
    lines.push('')
    lines.push('Converts to the RelationalText hub (`org.relationaltext.facet`) via declarative lens rules.')
    lines.push('')

    if (lens.passthrough === 'drop') {
      lines.push('> Unmapped features are dropped during conversion.')
      lines.push('')
    }

    lines.push('| Source | Target | Attrs |')
    lines.push('|--------|--------|-------|')
    for (const rule of lens.rules) {
      const source = `\`${rule.match.name}\``
      const matchAttrsStr = rule.match.matchAttrs
        ? ` (${formatAttrs(rule.match.matchAttrs)})`
        : ''

      if (rule.replace === null) {
        lines.push(`| ${source}${matchAttrsStr} | *(dropped)* | — |`)
        continue
      }

      const target = `\`${rule.replace.name}\``
      const attrParts: string[] = []
      if (rule.replace.addAttrs && Object.keys(rule.replace.addAttrs).length) {
        attrParts.push(`addAttrs: ${formatAttrs(rule.replace.addAttrs)}`)
      }
      if (rule.replace.renameAttrs && Object.keys(rule.replace.renameAttrs).length) {
        attrParts.push(`renameAttrs: ${formatAttrs(rule.replace.renameAttrs)}`)
      }
      if (rule.replace.dropAttrs && rule.replace.dropAttrs.length) {
        attrParts.push(`dropAttrs: [${rule.replace.dropAttrs.join(', ')}]`)
      }
      const attrsCell = attrParts.length ? attrParts.join('; ') : '—'
      lines.push(`| ${source}${matchAttrsStr} | ${target} | ${attrsCell} |`)
    }
  }

  lines.push('')

  const content = lines.join('\n')
  writeIfChanged(docsPath, content)
  generated++
}

console.log(`\nDone: ${generated} generated, ${skipped} skipped.`)
