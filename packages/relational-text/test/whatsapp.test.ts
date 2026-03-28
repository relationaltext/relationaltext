import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

// ─── fromWhatsApp — inline marks ──────────────────────────────────────────────

beforeAll(() => {
  registerTestFormats('whatsapp', 'html')
})

describe('fromWhatsApp — inline marks', () => {
  it('parses *bold* as bold mark', async () => {
    const doc = await from('whatsapp', '*bold*')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.whatsapp.facet#bold'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('bold')
      }
    }
  })

  it('parses _italic_ as italic mark', async () => {
    const doc = await from('whatsapp', '_italic_')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.whatsapp.facet#italic'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('italic')
      }
    }
  })

  it('parses ~strike~ as strike mark', async () => {
    const doc = await from('whatsapp', '~strike~')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.whatsapp.facet#strikethrough'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('strike')
      }
    }
  })

  it('parses `code` as code mark', async () => {
    const doc = await from('whatsapp', '`code`')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.whatsapp.facet#code'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('code')
      }
    }
  })
})

// ─── fromWhatsApp — block types ────────────────────────────────────────────────

describe('fromWhatsApp — block types', () => {
  it('parses > quote as blockquote structure', async () => {
    const doc = await from('whatsapp', '> quote')
    const hir = doc.toHIR()
    // Should have blockquote-marker block + blockquote container
    const hasBlockquoteMarker = hir.some(
      (n) => n.type === 'block' && n.name === 'blockquote-marker',
    )
    const hasBlockquoteContainer = hir.some(
      (n) => n.type === 'container' && n.name === 'blockquote',
    )
    expect(hasBlockquoteMarker).toBe(true)
    expect(hasBlockquoteContainer).toBe(true)
  })

  it('parses - item as bullet list', async () => {
    const doc = await from('whatsapp', '- item')
    const hir = doc.toHIR()
    const hasUlContainer = hir.some(
      (n) => n.type === 'container' && n.name === 'ul',
    )
    expect(hasUlContainer).toBe(true)
    // Find list-item-text with "item" content
    const ulNode = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulNode).toBeDefined()
  })

  it('parses 1. item as ordered list', async () => {
    const doc = await from('whatsapp', '1. item')
    const hir = doc.toHIR()
    const hasOlContainer = hir.some(
      (n) => n.type === 'container' && n.name === 'ol',
    )
    expect(hasOlContainer).toBe(true)
  })

  it('parses triple-backtick code block', async () => {
    const doc = await from('whatsapp', '```\nconsole.log("hi")\n```')
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      const text = codeBlock.children.find((c) => c.type === 'text')
      if (text?.type === 'text') {
        expect(text.content).toContain('console.log("hi")')
      }
    }
  })

  it('parses multiple inline marks in same paragraph', async () => {
    const doc = await from('whatsapp', '*bold* and _italic_')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const boldSeg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.whatsapp.facet#bold'),
      )
      const italicSeg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.whatsapp.facet#italic'),
      )
      expect(boldSeg).toBeDefined()
      expect(italicSeg).toBeDefined()
    }
  })
})

// ─── Round-trip tests ──────────────────────────────────────────────────────────

describe('WhatsApp round-trip', () => {
  it('round-trips *bold*', async () => {
    const input = '*bold*\n'
    const doc = await from('whatsapp', input.trim())
    const output = await to('whatsapp', doc)
    expect(output).toBe(input)
  })

  it('round-trips _italic_', async () => {
    const input = '_italic_\n'
    const doc = await from('whatsapp', input.trim())
    const output = await to('whatsapp', doc)
    expect(output).toBe(input)
  })

  it('round-trips code block', async () => {
    const input = '```\ncode here\n```\n'
    const doc = await from('whatsapp', '```\ncode here\n```')
    const output = await to('whatsapp', doc)
    expect(output).toBe(input)
  })

  it('round-trips bullet list', async () => {
    const input = '- first\n- second\n'
    const doc = await from('whatsapp', '- first\n- second')
    const output = await to('whatsapp', doc)
    expect(output).toBe(input)
  })
})

// ─── Cross-format: WhatsApp → HTML ────────────────────────────────────────────

describe('WhatsApp → HTML cross-format', () => {
  it('renders *bold* as <strong>bold</strong>', async () => {
    const doc = await from('whatsapp', '*bold*')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('renders _italic_ as <em>italic</em>', async () => {
    const doc = await from('whatsapp', '_italic_')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('renders ~strike~ as <s>strike</s>', async () => {
    const doc = await from('whatsapp', '~strike~')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<s>strike</s>')
  })

  it('renders > quote as <blockquote>...</blockquote>', async () => {
    const doc = await from('whatsapp', '> hello')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<blockquote>')
    expect(html).toContain('hello')
    expect(html).toContain('</blockquote>')
  })

  it('renders bullet list as <ul><li>...</li></ul>', async () => {
    const doc = await from('whatsapp', '- item')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
    expect(html).toContain('</li>')
    expect(html).toContain('</ul>')
  })
})
