#!/usr/bin/env tsx
/**
 * Build script for RelationalText in-lexicon WASM format adapters.
 *
 * For each format adapter:
 * 1. Compiles the Rust example to wasm32-unknown-unknown (release).
 * 2. Base64-encodes the resulting .wasm file.
 * 3. Writes a <format>.wasm.b64 file beside the lexicon JSON (for test use).
 * 4. Injects the base64 data into the lexicon JSON's `wasmLens.wasmModule.data` field.
 *
 * Usage:
 *   tsx scripts/build-format-wasm.ts                    # all adapters
 *   tsx scripts/build-format-wasm.ts --format quill
 *   tsx scripts/build-format-wasm.ts --format tiptap
 *   tsx scripts/build-format-wasm.ts --format applenews
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const WASM_OUT = join(ROOT, 'target/wasm32-unknown-unknown/release/examples')
const CARGO_PKG = 'relationaltext-format-adapters'

interface FormatSpec {
  /** Rust example name (used as the wasm.b64 file stem; also the cargo example unless buildExample overrides) */
  exampleName: string
  /** NSID stem directory under formats/ */
  formatDir: string
  /** Base name for the lexicon JSON and wasm.b64 files */
  baseName: string
  /** Source namespace */
  namespace: string
  /**
   * Override the Rust example to build. When set, multiple FormatSpecs can share
   * the same compiled binary (e.g. all markdown-variant formats use "markdown").
   * The shared binary is built once and the base64 is cached for all specs that
   * reference it.
   */
  buildExample?: string
}

const ALL_FORMATS: FormatSpec[] = [
  // Phase 1
  {
    exampleName: 'quill',
    formatDir: 'org.quilljs.delta',
    baseName: 'quill-delta',
    namespace: 'org.quilljs.delta.facet',
  },
  {
    exampleName: 'prosemirror',
    formatDir: 'org.prosemirror',
    baseName: 'prosemirror',
    namespace: 'org.prosemirror.facet',
  },
  {
    exampleName: 'slate',
    formatDir: 'rocks.slate',
    baseName: 'slate',
    namespace: 'rocks.slate.facet',
  },
  // Phase 2
  {
    exampleName: 'tiptap',
    formatDir: 'dev.tiptap',
    baseName: 'tiptap',
    namespace: 'dev.tiptap.facet',
  },
  {
    exampleName: 'lexical',
    formatDir: 'io.lexical',
    baseName: 'lexical',
    namespace: 'io.lexical.facet',
  },
  {
    exampleName: 'contentful',
    formatDir: 'com.contentful.richtext',
    baseName: 'contentful',
    namespace: 'com.contentful.richtext.facet',
  },
  {
    exampleName: 'sanity',
    formatDir: 'io.sanity.portabletext',
    baseName: 'sanity',
    namespace: 'io.sanity.portabletext.facet',
  },
  {
    exampleName: 'notion',
    formatDir: 'com.notion',
    baseName: 'notion',
    namespace: 'com.notion.facet',
  },
  {
    exampleName: 'bluesky',
    formatDir: 'app.bsky.richtext',
    baseName: 'bluesky',
    namespace: 'app.bsky.richtext.facet',
  },
  {
    exampleName: 'applenews',
    formatDir: 'com.apple.news',
    baseName: 'applenews',
    namespace: 'com.apple.news.facet',
  },
  // Phase 3: Social / chat formats
  {
    exampleName: 'slack',
    formatDir: 'com.slack.mrkdwn',
    baseName: 'slack',
    namespace: 'com.slack.mrkdwn.facet',
  },
  {
    exampleName: 'discord',
    formatDir: 'com.discord',
    baseName: 'discord',
    namespace: 'com.discord.facet',
  },
  {
    exampleName: 'telegram',
    formatDir: 'org.telegram',
    baseName: 'telegram',
    namespace: 'org.telegram.facet',
  },
  {
    exampleName: 'whatsapp',
    formatDir: 'com.whatsapp',
    baseName: 'whatsapp',
    namespace: 'com.whatsapp.facet',
  },
  {
    exampleName: 'linkedin',
    formatDir: 'com.linkedin',
    baseName: 'linkedin',
    namespace: 'com.linkedin.facet',
  },
  {
    exampleName: 'threads',
    formatDir: 'com.threads',
    baseName: 'threads',
    namespace: 'com.threads.facet',
  },
  // Phase 5: Shared markdown binary (CommonMark, GitLab, Obsidian, MyST, MultiMarkdown)
  {
    exampleName: 'commonmark',
    formatDir: 'org.commonmark',
    baseName: 'commonmark',
    namespace: 'org.commonmark.facet',
    buildExample: 'markdown',
  },
  {
    exampleName: 'gitlab',
    formatDir: 'com.gitlab',
    baseName: 'gitlab',
    namespace: 'com.gitlab.facet',
    buildExample: 'markdown',
  },
  {
    exampleName: 'obsidian',
    formatDir: 'md.obsidian',
    baseName: 'obsidian',
    namespace: 'md.obsidian.facet',
    buildExample: 'markdown',
  },
  {
    exampleName: 'myst',
    formatDir: 'org.mystmd',
    baseName: 'myst',
    namespace: 'org.mystmd.facet',
    buildExample: 'markdown',
  },
  {
    exampleName: 'multimarkdown',
    formatDir: 'org.multimarkdown',
    baseName: 'multimarkdown',
    namespace: 'org.multimarkdown.facet',
    buildExample: 'markdown',
  },
  // Phase 4: JSON formats
  {
    exampleName: 'pandoc',
    formatDir: 'org.pandoc',
    baseName: 'pandoc',
    namespace: 'org.pandoc.facet',
  },
  {
    exampleName: 'jupyter',
    formatDir: 'org.jupyter',
    baseName: 'jupyter',
    namespace: 'org.jupyter.facet',
  },
  {
    exampleName: 'roam',
    formatDir: 'com.roamresearch',
    baseName: 'roam',
    namespace: 'com.roamresearch.facet',
  },
  // Phase 4: Markup formats (standalone text parsers)
  {
    exampleName: 'logseq',
    formatDir: 'com.logseq',
    baseName: 'logseq',
    namespace: 'com.logseq.facet',
  },
  {
    exampleName: 'opml',
    formatDir: 'org.opml',
    baseName: 'opml',
    namespace: 'org.opml.facet',
  },
  {
    exampleName: 'org',
    formatDir: 'org.orgmode',
    baseName: 'org',
    namespace: 'org.orgmode.facet',
  },
  {
    exampleName: 'bbcode',
    formatDir: 'org.bbcode',
    baseName: 'bbcode',
    namespace: 'org.bbcode.facet',
  },
  {
    exampleName: 'fountain',
    formatDir: 'com.fountain',
    baseName: 'fountain',
    namespace: 'com.fountain.facet',
  },
  {
    exampleName: 'textile',
    formatDir: 'org.textile',
    baseName: 'textile',
    namespace: 'org.textile.facet',
  },
  {
    exampleName: 'dokuwiki',
    formatDir: 'org.dokuwiki',
    baseName: 'dokuwiki',
    namespace: 'org.dokuwiki.facet',
  },
  {
    exampleName: 'mediawiki',
    formatDir: 'org.mediawiki',
    baseName: 'mediawiki',
    namespace: 'org.mediawiki.facet',
  },
  {
    exampleName: 'confluence',
    formatDir: 'com.atlassian.wiki',
    baseName: 'confluence',
    namespace: 'com.atlassian.wiki.facet',
  },
  // MDX and Markdoc: CommonMark-based but with line-level extensions (JSX, Markdoc tags).
  // Standalone binaries — line-based parsers, not pure comrak variants.
  {
    exampleName: 'mdx',
    formatDir: 'dev.mdxjs',
    baseName: 'mdx',
    namespace: 'dev.mdxjs.facet',
  },
  {
    exampleName: 'markdoc',
    formatDir: 'com.markdoc',
    baseName: 'markdoc',
    namespace: 'com.markdoc.facet',
  },
  // Phase 6: HTML (WHATWG-compliant html5ever parser)
  {
    exampleName: 'html',
    formatDir: 'org.w3c.html',
    baseName: 'html',
    namespace: 'org.w3c.html.facet',
  },
]

function parseArgs(): FormatSpec[] {
  const args = process.argv.slice(2)
  const fmtIdx = args.indexOf('--format')
  if (fmtIdx !== -1) {
    const name = args[fmtIdx + 1]
    const spec = ALL_FORMATS.find((f) => f.exampleName === name)
    if (!spec) {
      console.error(`Unknown format: ${name}. Available: ${ALL_FORMATS.map((f) => f.exampleName).join(', ')}`)
      process.exit(1)
    }
    return [spec]
  }
  return ALL_FORMATS
}

function buildWasm(spec: FormatSpec, builtExamples: Set<string>): void {
  const binaryName = spec.buildExample ?? spec.exampleName
  if (builtExamples.has(binaryName)) {
    console.log(`\nSkipping build for ${binaryName} (already built, reusing for ${spec.exampleName})`)
    return
  }
  console.log(`\nBuilding WASM for ${binaryName}...`)
  const cmd = [
    'cargo build',
    '--target wasm32-unknown-unknown',
    '--release',
    `--example ${binaryName}`,
    `-p ${CARGO_PKG}`,
  ].join(' ')
  console.log(`  $ ${cmd}`)
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' })
  builtExamples.add(binaryName)
}

function embedWasm(spec: FormatSpec, b64Cache: Map<string, string>): void {
  const binaryName = spec.buildExample ?? spec.exampleName

  let b64: string
  if (b64Cache.has(binaryName)) {
    b64 = b64Cache.get(binaryName)!
    console.log(`  Reusing cached base64 for ${binaryName}`)
  } else {
    const wasmPath = join(WASM_OUT, `${binaryName}.wasm`)
    const wasmBytes = readFileSync(wasmPath)
    b64 = wasmBytes.toString('base64')
    b64Cache.set(binaryName, b64)
  }

  const formatDir = join(ROOT, 'formats', spec.formatDir)
  const b64Path = join(formatDir, `${binaryName}.wasm.b64`)
  const lexiconPath = join(formatDir, `${spec.baseName}.lexicon.json`)

  // Write the .wasm.b64 file (for test references)
  writeFileSync(b64Path, b64, 'utf8')
  console.log(`  Wrote ${b64Path} (${Math.round(b64.length / 1024)}KB base64)`)

  // Never inject WASM data back into source lexicon JSONs.
  //
  // Reason: adapters use include_bytes! on their lexicon JSON for registry
  // initialization. If the build script injects the WASM base64 into that same
  // file, the next cargo build embeds the large data string in the binary,
  // making it larger, which makes the next injection even larger, causing
  // unbounded circular growth (quill/prosemirror/slate grew to 7MB this way).
  //
  // Tests load WASM from the .wasm.b64 file directly — no data injection needed.
  // Distribution artifacts (with data embedded) are generated separately.
  console.log(`  Skipping lexicon injection (tests use ${binaryName}.wasm.b64; source lexicons keep data="")`)
}

const formats = parseArgs()
const builtExamples = new Set<string>()
const b64Cache = new Map<string, string>()
for (const spec of formats) {
  try {
    buildWasm(spec, builtExamples)
    embedWasm(spec, b64Cache)
    console.log(`✓ ${spec.exampleName} done`)
  } catch (err) {
    console.error(`✗ ${spec.exampleName} failed:`, err)
    process.exit(1)
  }
}
console.log('\nAll adapters built successfully.')
