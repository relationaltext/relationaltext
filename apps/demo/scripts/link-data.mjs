#!/usr/bin/env node
/**
 * Symlinks data files from the repo root data/ directory into apps/demo/public/
 * so Next.js can serve them as static assets.
 *
 * Files linked:
 *   data/usda-fdc.sqlite       → public/usda-fdc.sqlite
 *   data/usda-overrides.json   → public/usda-overrides.json
 *   data/recipes.sqlite        → public/recipes.sqlite
 *
 * Also copies sql-wasm.wasm from sql.js dist into public/ for the browser loader.
 *
 * Usage: node apps/demo/scripts/link-data.mjs
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEMO_DIR = path.resolve(__dirname, '..')
const ROOT = path.resolve(DEMO_DIR, '../..')
const PUBLIC_DIR = path.join(DEMO_DIR, 'public')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function linkFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`  WARNING: source not found, skipping: ${src}`)
    return
  }
  // Remove existing symlink or file (lstat to avoid throwing on dangling symlinks)
  try {
    fs.lstatSync(dest)
    fs.unlinkSync(dest)
  } catch {
    // dest doesn't exist — nothing to remove
  }
  fs.symlinkSync(src, dest)
  console.log(`  linked: ${path.relative(ROOT, dest)} → ${path.relative(ROOT, src)}`)
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`  WARNING: source not found, skipping copy of: ${src}`)
    return
  }
  fs.copyFileSync(src, dest)
  const sizeMB = (fs.statSync(dest).size / 1024 / 1024).toFixed(1)
  console.log(`  copied: ${path.relative(ROOT, dest)} (${sizeMB} MB)`)
}

ensureDir(PUBLIC_DIR)

console.log('Linking data files into public/...')

// Link SQLite database and overrides
const dataFiles = ['usda-fdc.sqlite', 'usda-overrides.json', 'recipes.sqlite']
for (const file of dataFiles) {
  const src = path.join(ROOT, 'data', file)
  const dest = path.join(PUBLIC_DIR, file)
  try {
    linkFile(src, dest)
  } catch {
    // Fallback: if symlink fails (e.g. Windows), copy instead
    try {
      copyFile(src, dest)
    } catch (e) {
      console.warn(`  WARNING: could not link or copy ${file}:`, e.message)
    }
  }
}

// Copy sql-wasm.wasm from sql.js into public/ so the browser loader can find it
// sql.js locateFile returns `/sql-wasm.wasm` — Next.js serves public/ at root
const wasmCandidates = [
  path.join(DEMO_DIR, 'node_modules/sql.js/dist/sql-wasm.wasm'),
  path.join(ROOT, 'node_modules/.pnpm/sql.js@1.14.1/node_modules/sql.js/dist/sql-wasm.wasm'),
]
// Also search pnpm store with any version
const pnpmDir = path.join(ROOT, 'node_modules/.pnpm')
if (fs.existsSync(pnpmDir)) {
  for (const entry of fs.readdirSync(pnpmDir)) {
    if (entry.startsWith('sql.js@')) {
      wasmCandidates.push(
        path.join(pnpmDir, entry, 'node_modules/sql.js/dist/sql-wasm.wasm'),
      )
    }
  }
}

const wasmSrc = wasmCandidates.find((p) => fs.existsSync(p))
if (wasmSrc) {
  copyFile(wasmSrc, path.join(PUBLIC_DIR, 'sql-wasm.wasm'))
} else {
  console.warn('  WARNING: sql-wasm.wasm not found — browser sql.js will fail to load WASM')
  console.warn('  Tried:', wasmCandidates)
}

// Link format adapter files (lexicons, lenses, WASM binaries) into public/formats/
// so the browser can fetch them at runtime for format registration.
const formatDirs = [
  // Rich-text editors
  { dir: 'org.quilljs.delta', files: ['quill-delta.lexicon.json', 'quill.wasm.b64', 'quill-to-relationaltext.lens.json'] },
  { dir: 'org.prosemirror', files: ['prosemirror.lexicon.json', 'prosemirror.wasm.b64', 'prosemirror-to-relationaltext.lens.json'] },
  { dir: 'dev.tiptap', files: ['tiptap.lexicon.json', 'tiptap.wasm.b64', 'tiptap-to-relationaltext.lens.json'] },
  { dir: 'io.lexical', files: ['lexical.lexicon.json', 'lexical.wasm.b64', 'lexical-to-relationaltext.lens.json'] },
  { dir: 'rocks.slate', files: ['slate.lexicon.json', 'slate.wasm.b64', 'slate-to-relationaltext.lens.json'] },

  // Markup languages
  { dir: 'org.commonmark', files: ['commonmark.lexicon.json', 'gfm.lexicon.json', 'markdown.wasm.b64', 'commonmark-to-relationaltext.lens.json', 'relationaltext-to-commonmark.lens.json', 'gfm-to-relationaltext.lens.json'] },
  { dir: 'org.w3c.html', files: ['whatwg-html.lexicon.json', 'html.wasm.b64', 'html-to-relationaltext.lens.json', 'relationaltext-to-html.lens.json'] },
  { dir: 'org.bbcode', files: ['bbcode.lexicon.json', 'bbcode.wasm.b64', 'bbcode-to-relationaltext.lens.json'] },
  { dir: 'org.textile', files: ['textile.lexicon.json', 'textile.wasm.b64', 'textile-to-relationaltext.lens.json'] },

  // Markdown variants
  { dir: 'com.gitlab', files: ['gitlab.lexicon.json', 'markdown.wasm.b64', 'gitlab-to-relationaltext.lens.json'] },
  { dir: 'md.obsidian', files: ['obsidian.lexicon.json', 'markdown.wasm.b64', 'obsidian-to-relationaltext.lens.json'] },
  { dir: 'org.mystmd', files: ['myst.lexicon.json', 'markdown.wasm.b64', 'myst-to-relationaltext.lens.json'] },
  { dir: 'org.multimarkdown', files: ['multimarkdown.lexicon.json', 'markdown.wasm.b64', 'multimarkdown-to-relationaltext.lens.json'] },
  { dir: 'dev.mdxjs', files: ['mdx.lexicon.json', 'mdx.wasm.b64', 'mdx-to-relationaltext.lens.json'] },
  { dir: 'com.markdoc', files: ['markdoc.lexicon.json', 'markdoc.wasm.b64', 'markdoc-to-relationaltext.lens.json'] },

  // Wiki formats
  { dir: 'com.atlassian.wiki', files: ['confluence.lexicon.json', 'confluence.wasm.b64', 'confluence-to-relationaltext.lens.json'] },
  { dir: 'org.dokuwiki', files: ['dokuwiki.lexicon.json', 'dokuwiki.wasm.b64', 'dokuwiki-to-relationaltext.lens.json'] },
  { dir: 'org.mediawiki', files: ['mediawiki.lexicon.json', 'mediawiki.wasm.b64', 'mediawiki-to-relationaltext.lens.json'] },

  // CMS formats
  { dir: 'com.contentful.richtext', files: ['contentful.lexicon.json', 'contentful.wasm.b64', 'contentful-to-relationaltext.lens.json'] },
  { dir: 'io.sanity.portabletext', files: ['sanity.lexicon.json', 'sanity.wasm.b64', 'sanity-to-relationaltext.lens.json'] },
  { dir: 'com.notion', files: ['notion.lexicon.json', 'notion.wasm.b64', 'notion-to-relationaltext.lens.json'] },

  // Social/messaging formats
  { dir: 'com.slack.mrkdwn', files: ['slack.lexicon.json', 'slack.wasm.b64', 'slack-to-relationaltext.lens.json'] },
  { dir: 'com.discord', files: ['discord.lexicon.json', 'discord.wasm.b64', 'discord-to-relationaltext.lens.json'] },
  { dir: 'org.telegram', files: ['telegram.lexicon.json', 'telegram.wasm.b64', 'telegram-to-relationaltext.lens.json'] },
  { dir: 'com.whatsapp', files: ['whatsapp.lexicon.json', 'whatsapp.wasm.b64', 'whatsapp-to-relationaltext.lens.json'] },
  { dir: 'org.joinmastodon', files: ['mastodon.lexicon.json', 'mastodon-to-relationaltext.lens.json', 'html-to-mastodon.lens.json'] },
  { dir: 'com.linkedin', files: ['linkedin.lexicon.json', 'linkedin.wasm.b64', 'linkedin-to-relationaltext.lens.json'] },
  { dir: 'com.threads', files: ['threads.lexicon.json', 'threads.wasm.b64', 'threads-to-relationaltext.lens.json'] },

  // ATProto / Bluesky
  { dir: 'app.bsky.richtext', files: ['bluesky.lexicon.json', 'bluesky.wasm.b64'] },

  // Other structured formats
  { dir: 'com.apple.news', files: ['applenews.lexicon.json', 'applenews.wasm.b64', 'applenews-to-relationaltext.lens.json', 'relationaltext-to-applenews.lens.json'] },
  { dir: 'org.pandoc', files: ['pandoc.lexicon.json', 'pandoc.wasm.b64', 'pandoc-to-relationaltext.lens.json'] },
  { dir: 'com.fountain', files: ['fountain.lexicon.json', 'fountain.wasm.b64', 'fountain-to-relationaltext.lens.json'] },
  { dir: 'org.opml', files: ['opml.lexicon.json', 'opml.wasm.b64', 'opml-to-relationaltext.lens.json'] },
  { dir: 'org.orgmode', files: ['org.lexicon.json', 'org.wasm.b64', 'org-to-relationaltext.lens.json'] },
  { dir: 'org.jupyter', files: ['jupyter.lexicon.json', 'jupyter.wasm.b64', 'jupyter-to-relationaltext.lens.json'] },

  // Import-only formats
  { dir: 'com.roamresearch', files: ['roam.lexicon.json', 'roam.wasm.b64', 'roam-to-relationaltext.lens.json'] },
  { dir: 'com.logseq', files: ['logseq.lexicon.json', 'logseq.wasm.b64', 'logseq-to-relationaltext.lens.json'] },
]

for (const { dir, files } of formatDirs) {
  const destDir = path.join(PUBLIC_DIR, 'formats', dir)
  ensureDir(destDir)
  for (const file of files) {
    const src = path.join(ROOT, 'formats', dir, file)
    const dest = path.join(destDir, file)
    try {
      linkFile(src, dest)
    } catch {
      try { copyFile(src, dest) } catch (e) {
        console.warn(`  WARNING: could not link or copy formats/${dir}/${file}:`, e.message)
      }
    }
  }
}

console.log('Done.')
