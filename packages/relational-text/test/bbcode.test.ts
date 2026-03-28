import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

// ─── fromBBCode — inline marks ────────────────────────────────────────────────

beforeAll(() => {
  registerTestFormats('bbcode', 'html')
})

describe('fromBBCode — inline marks', () => {
  it('parses [b]bold[/b]', async () => {
    const doc = await from('bbcode', '[b]bold[/b]')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const boldSeg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.bbcode.facet#b'),
      )
      expect(boldSeg).toBeDefined()
    }
  })

  it('parses [i]italic[/i]', async () => {
    const doc = await from('bbcode', '[i]italic[/i]')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.bbcode.facet#i'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses [u]underline[/u]', async () => {
    const doc = await from('bbcode', '[u]underline[/u]')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.bbcode.facet#u'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses [s]strikethrough[/s]', async () => {
    const doc = await from('bbcode', '[s]strike[/s]')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.bbcode.facet#s'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses [code]inline code[/code]', async () => {
    const doc = await from('bbcode', '[code]code[/code]')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.bbcode.facet#code'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses [url=http://example.com]link[/url] with href attr', async () => {
    const doc = await from('bbcode', '[url=http://example.com]link[/url]')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.bbcode.facet#url'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'org.bbcode.facet#url')
        expect(mark?.attrs['href']).toBe('http://example.com')
      }
    }
  })

  it('parses [url]http://example.com[/url] using inner text as href', async () => {
    const doc = await from('bbcode', '[url]http://example.com[/url]')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.bbcode.facet#url'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'org.bbcode.facet#url')
        expect(mark?.attrs['href']).toBe('http://example.com')
      }
    }
  })
})

// ─── fromBBCode — block types ─────────────────────────────────────────────────

describe('fromBBCode — block types', () => {
  it('parses [quote]quoted text[/quote] as blockquote structure', async () => {
    const doc = await from('bbcode', '[quote]quoted text[/quote]')
    const hir = doc.toHIR()
    // Should produce a blockquote container or blockquote-marker + paragraph in blockquote
    const hasBlockquote =
      hir.some((n) => n.type === 'container' && n.name === 'blockquote') ||
      hir.some((n) => n.type === 'block' && n.name === 'blockquote-marker')
    expect(hasBlockquote).toBe(true)
    // The quoted text should appear somewhere in the document
    expect(doc.text).toContain('quoted text')
  })

  it('parses bullet list [list]\\n[*]item\\n[/list]', async () => {
    const doc = await from('bbcode', '[list]\n[*]item\n[/list]')
    const hir = doc.toHIR()
    const ulContainer = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainer).toBeDefined()
    expect(doc.text).toContain('item')
  })

  it('parses ordered list [list=1]\\n[*]item\\n[/list]', async () => {
    const doc = await from('bbcode', '[list=1]\n[*]item\n[/list]')
    const hir = doc.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(olContainer).toBeDefined()
    expect(doc.text).toContain('item')
  })

  it('parses nested marks [b][i]bold italic[/i][/b]', async () => {
    const doc = await from('bbcode', '[b][i]bold italic[/i][/b]')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const seg = block.children.find((c) => c.type === 'text')
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const hasB = seg.marks.some((m) => m.kind === 'org.bbcode.facet#b')
        const hasI = seg.marks.some((m) => m.kind === 'org.bbcode.facet#i')
        expect(hasB).toBe(true)
        expect(hasI).toBe(true)
      }
    }
  })
})

// ─── Round-trip tests ─────────────────────────────────────────────────────────

describe('toBBCode — round-trip', () => {
  it('round-trips [b]bold[/b]', async () => {
    const doc = await from('bbcode', '[b]bold[/b]')
    const out = await to('bbcode', doc)
    expect(out).toContain('[b]bold[/b]')
  })

  it('round-trips [i]italic[/i]', async () => {
    const doc = await from('bbcode', '[i]italic[/i]')
    const out = await to('bbcode', doc)
    expect(out).toContain('[i]italic[/i]')
  })

  it('round-trips [url=http://example.com]link[/url]', async () => {
    const doc = await from('bbcode', '[url=http://example.com]link[/url]')
    const out = await to('bbcode', doc)
    expect(out).toContain('[url=http://example.com]link[/url]')
  })

  it('round-trips plain text paragraph', async () => {
    const doc = await from('bbcode', 'hello world')
    const out = await to('bbcode', doc)
    expect(out).toContain('hello world')
  })

  it('round-trips [s]strike[/s]', async () => {
    const doc = await from('bbcode', '[s]strike[/s]')
    const out = await to('bbcode', doc)
    expect(out).toContain('[s]strike[/s]')
  })

  it('round-trips [u]underline[/u]', async () => {
    const doc = await from('bbcode', '[u]underline[/u]')
    const out = await to('bbcode', doc)
    expect(out).toContain('[u]underline[/u]')
  })
})

// ─── Cross-format via lens ────────────────────────────────────────────────────

describe('fromBBCode → toHTML (cross-format via lens)', () => {
  it('[b]bold[/b] → <strong>bold</strong>', async () => {
    const doc = await from('bbcode', '[b]bold[/b]')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('[i]italic[/i] → <em>italic</em>', async () => {
    const doc = await from('bbcode', '[i]italic[/i]')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('[u]underline[/u] → contains underline', async () => {
    const doc = await from('bbcode', '[u]underline[/u]')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<u>underline</u>')
  })

  it('[s]strike[/s] → <s>strike</s>', async () => {
    const doc = await from('bbcode', '[s]strike[/s]')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<s>strike</s>')
  })

  it('[quote]text[/quote] → contains <blockquote>', async () => {
    const doc = await from('bbcode', '[quote]quoted text[/quote]')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<blockquote>')
  })

  it('[url=http://example.com]link[/url] → <a href="...">', async () => {
    const doc = await from('bbcode', '[url=http://example.com]link[/url]')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<a href="http://example.com">')
    expect(html).toContain('link')
  })

  it('bullet list → <ul><li>', async () => {
    const doc = await from('bbcode', '[list]\n[*]item one\n[*]item two\n[/list]')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item one')
  })

  it('ordered list → <ol><li>', async () => {
    const doc = await from('bbcode', '[list=1]\n[*]first\n[*]second\n[/list]')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
  })
})
