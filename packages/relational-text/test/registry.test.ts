/**
 * Tests for the async format registry.
 *
 * Each test registers formats on-demand using lexicon JSON + WASM .b64 data
 * loaded from the formats/ directory.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  init,
  registerFormat,
  from,
  to,
  hasFormat,
  listFormats,
  Document,
} from '../src/registry.js'
import type { LensSpec } from '../src/lens.js'

// ─── Helpers ────────────────────────────────────────────────────────────────────

const FORMATS_ROOT = join(__dirname, '..', '..', '..', 'formats')

function loadLexicon(formatDir: string, filename: string): Record<string, unknown> {
  const raw = readFileSync(join(FORMATS_ROOT, formatDir, filename), 'utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

function loadWasmData(formatDir: string, filename: string): string {
  return readFileSync(join(FORMATS_ROOT, formatDir, filename), 'utf8').trim()
}

function loadLens(formatDir: string, filename: string): LensSpec {
  const raw = readFileSync(join(FORMATS_ROOT, formatDir, filename), 'utf8')
  return JSON.parse(raw) as LensSpec
}

// ─── Lazy format registration helpers ───────────────────────────────────────────

let slackRegistered = false
function ensureSlack(): void {
  if (slackRegistered) return
  slackRegistered = true
  const lexicon = loadLexicon('com.slack.mrkdwn', 'slack.lexicon.json')
  const wasmData = loadWasmData('com.slack.mrkdwn', 'slack.wasm.b64')
  const slackToRt = loadLens('com.slack.mrkdwn', 'slack-to-relationaltext.lens.json')
  registerFormat('slack', lexicon, { wasmData, lenses: [slackToRt] })
}

let markdownRegistered = false
function ensureMarkdown(): void {
  if (markdownRegistered) return
  markdownRegistered = true
  // CommonMark lexicon + shared markdown WASM
  const cmLexicon = loadLexicon('org.commonmark', 'commonmark.lexicon.json')
  const wasmData = loadWasmData('org.commonmark', 'markdown.wasm.b64')
  const cmToRt = loadLens('org.commonmark', 'commonmark-to-relationaltext.lens.json')
  const rtToCm = loadLens('org.commonmark', 'relationaltext-to-commonmark.lens.json')
  registerFormat('markdown', cmLexicon, {
    wasmData,
    lenses: [cmToRt, rtToCm],
    aliases: ['gfm'],
  })
}

let htmlRegistered = false
function ensureHtml(): void {
  if (htmlRegistered) return
  htmlRegistered = true
  const lexicon = loadLexicon('org.w3c.html', 'whatwg-html.lexicon.json')
  const wasmData = loadWasmData('org.w3c.html', 'html.wasm.b64')
  const htmlToRt = loadLens('org.w3c.html', 'html-to-relationaltext.lens.json')
  const rtToHtml = loadLens('org.w3c.html', 'relationaltext-to-html.lens.json')
  registerFormat('html', lexicon, {
    wasmData,
    lenses: [htmlToRt, rtToHtml],
  })
}

// ─── Setup ──────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await init()
})

// ─── hasFormat / listFormats ────────────────────────────────────────────────────

describe('hasFormat / listFormats', () => {
  it('returns false for unregistered format', () => {
    expect(hasFormat('nonexistent')).toBe(false)
  })

  it('returns true after registration', () => {
    ensureSlack()
    expect(hasFormat('slack')).toBe(true)
  })

  it('listFormats includes registered names', () => {
    ensureSlack()
    const names = listFormats()
    expect(names).toContain('slack')
  })

  it('listFormats includes aliases', () => {
    ensureMarkdown()
    const names = listFormats()
    expect(names).toContain('markdown')
    expect(names).toContain('gfm')
  })
})

// ─── from() ─────────────────────────────────────────────────────────────────────

describe('from()', () => {
  it('parses slack bold markup', async () => {
    ensureSlack()
    const doc = await from('slack', '*bold*')
    expect(doc).toBeInstanceOf(Document)
    expect(doc.text).toContain('bold')
    // Should have a bold feature
    const hasBold = doc.features.some(
      (f) => f.$type === 'com.slack.mrkdwn.facet' && (f as Record<string, unknown>).name === 'bold',
    )
    expect(hasBold).toBe(true)
  })

  it('parses markdown bold', async () => {
    ensureMarkdown()
    const doc = await from('markdown', '**bold**')
    expect(doc).toBeInstanceOf(Document)
    expect(doc.text).toContain('bold')
  })

  it('parses HTML', async () => {
    ensureHtml()
    const doc = await from('html', '<p>hello</p>')
    expect(doc).toBeInstanceOf(Document)
    expect(doc.text).toContain('hello')
  })

  it('throws for unregistered format', async () => {
    await expect(from('nonexistent', 'test')).rejects.toThrow(/Unknown format.*nonexistent/)
  })
})

// ─── to() ───────────────────────────────────────────────────────────────────────

describe('to()', () => {
  it('round-trips slack bold', async () => {
    ensureSlack()
    const doc = await from('slack', '*bold*')
    const result = await to('slack', doc)
    expect(result).toContain('*bold*')
  })

  it('round-trips markdown', async () => {
    ensureMarkdown()
    const doc = await from('markdown', '**bold**')
    const result = await to('markdown', doc)
    expect(result).toContain('**bold**')
  })

  it('throws for unregistered format', async () => {
    const doc = Document.fromText('test')
    await expect(to('nonexistent', doc)).rejects.toThrow(/Unknown format.*nonexistent/)
  })

  it('accepts a DocumentJSON object', async () => {
    ensureSlack()
    const doc = await from('slack', 'hello')
    const result = await to('slack', doc.toJSON())
    expect(result).toContain('hello')
  })
})

// ─── Cross-format ───────────────────────────────────────────────────────────────

describe('cross-format conversion', () => {
  it('converts markdown bold to HTML <strong>', async () => {
    ensureMarkdown()
    ensureHtml()
    const doc = await from('markdown', '**bold**')
    const html = await to('html', doc)
    expect(html).toContain('<strong>')
    expect(html).toContain('bold')
    expect(html).toContain('</strong>')
  })

  it('converts HTML to markdown', async () => {
    ensureMarkdown()
    ensureHtml()
    const doc = await from('html', '<p><em>italic</em></p>')
    const md = await to('markdown', doc)
    expect(md).toContain('*italic*')
  })
})

// ─── Aliases ────────────────────────────────────────────────────────────────────

describe('aliases', () => {
  it('gfm alias works for from()', async () => {
    ensureMarkdown()
    const doc = await from('gfm', '**bold**')
    expect(doc).toBeInstanceOf(Document)
    expect(doc.text).toContain('bold')
  })

  it('gfm alias works for to()', async () => {
    ensureMarkdown()
    const doc = await from('gfm', '**bold**')
    const result = await to('gfm', doc)
    expect(result).toContain('**bold**')
  })

  it('hasFormat returns true for alias', () => {
    ensureMarkdown()
    expect(hasFormat('gfm')).toBe(true)
  })
})

// ─── Error cases ────────────────────────────────────────────────────────────────

describe('error handling', () => {
  it('from() error lists registered formats', async () => {
    ensureSlack()
    try {
      await from('nonexistent', 'test')
      expect.unreachable('should have thrown')
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).toContain('slack')
    }
  })

  it('registerFormat throws if lexicon has no id', () => {
    expect(() => registerFormat('bad', {})).toThrow(/id/)
  })
})
