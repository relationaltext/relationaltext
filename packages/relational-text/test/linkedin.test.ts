import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'
beforeAll(() => {
  registerTestFormats('linkedin', 'html')
})

// ─── fromLinkedIn — inline marks ──────────────────────────────────────────────

describe('fromLinkedIn — inline marks', () => {
  it('parses **bold** as bold mark', async () => {
    const doc = await from('linkedin', '**bold**')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const boldSeg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.linkedin.facet#bold'),
      )
      expect(boldSeg).toBeDefined()
    }
  })

  it('parses *italic* as italic mark', async () => {
    const doc = await from('linkedin', '*italic*')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.linkedin.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses _italic_ as italic mark', async () => {
    const doc = await from('linkedin', '_italic_')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.linkedin.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses plain text as text node without marks', async () => {
    const doc = await from('linkedin', 'Hello world')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block?.type).toBe('block')
    if (block?.type === 'block') {
      const textSeg = block.children.find((c) => c.type === 'text' && c.content === 'Hello world')
      expect(textSeg).toBeDefined()
    }
  })
})

// ─── fromLinkedIn — entities ──────────────────────────────────────────────────

describe('fromLinkedIn — entities', () => {
  it('parses @[Name](urn:li:person:123) as mention entity', async () => {
    const doc = await from('linkedin', '@[John Doe](urn:li:person:123)')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block?.type).toBe('block')
    if (block?.type === 'block') {
      const mentionSeg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.linkedin.facet#mention'),
      )
      expect(mentionSeg).toBeDefined()
      if (mentionSeg?.type === 'text') {
        const mark = mentionSeg.marks.find((m) => m.kind === 'com.linkedin.facet#mention')
        expect(mark?.attrs['personName']).toBe('John Doe')
        expect(mark?.attrs['urn']).toBe('urn:li:person:123')
      }
    }
  })

  it('parses #opentowork as hashtag entity', async () => {
    const doc = await from('linkedin', '#opentowork')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block?.type).toBe('block')
    if (block?.type === 'block') {
      const hashtagSeg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.linkedin.facet#hashtag'),
      )
      expect(hashtagSeg).toBeDefined()
      if (hashtagSeg?.type === 'text') {
        const mark = hashtagSeg.marks.find((m) => m.kind === 'com.linkedin.facet#hashtag')
        expect(mark?.attrs['tag']).toBe('opentowork')
      }
    }
  })
})

// ─── fromLinkedIn — block structure ───────────────────────────────────────────

describe('fromLinkedIn — block structure', () => {
  it('parses • item as bullet list structure', async () => {
    const doc = await from('linkedin', '• item one')
    const hir = doc.toHIR()
    const ulContainer = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainer).toBeDefined()
    if (ulContainer?.type === 'container') {
      const hasListItemText = (nodes: typeof ulContainer.children): boolean =>
        nodes.some(
          (n) =>
            (n.type === 'block' && n.name === 'list-item-text') ||
            (n.type === 'container' && hasListItemText(n.children)),
        )
      expect(hasListItemText(ulContainer.children)).toBe(true)
    }
  })

  it('parses - item as bullet list structure', async () => {
    const doc = await from('linkedin', '- item one')
    const hir = doc.toHIR()
    const ulContainer = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainer).toBeDefined()
  })

  it('parses 1. item as ordered list structure', async () => {
    const doc = await from('linkedin', '1. first item')
    const hir = doc.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(olContainer).toBeDefined()
  })

  it('parses multiple paragraphs separated by blank lines', async () => {
    const doc = await from('linkedin', 'First paragraph\n\nSecond paragraph')
    const hir = doc.toHIR()
    const paragraphs = hir.filter((n) => n.type === 'block' && n.name === 'paragraph')
    expect(paragraphs.length).toBe(2)
  })
})

// ─── Round-trip tests ─────────────────────────────────────────────────────────

describe('toLinkedIn — round-trips', () => {
  it('round-trips **bold**', async () => {
    const doc = await from('linkedin', '**bold**')
    const output = (await to('linkedin', doc)).trim()
    expect(output).toBe('**bold**')
  })

  it('round-trips _italic_', async () => {
    const doc = await from('linkedin', '_italic_')
    const output = (await to('linkedin', doc)).trim()
    expect(output).toBe('_italic_')
  })

  it('round-trips a bullet list', async () => {
    const doc = await from('linkedin', '• item one\n• item two')
    const output = await to('linkedin', doc)
    expect(output).toContain('• item one')
    expect(output).toContain('• item two')
  })

  it('round-trips plain paragraph text', async () => {
    const doc = await from('linkedin', 'Hello, LinkedIn!')
    const output = (await to('linkedin', doc)).trim()
    expect(output).toBe('Hello, LinkedIn!')
  })
})

// ─── Cross-format tests (LinkedIn → HTML) ─────────────────────────────────────

describe('cross-format: LinkedIn → HTML', () => {
  it('converts **bold** to <strong>bold</strong>', async () => {
    const doc = await from('linkedin', '**bold**')
    const html = (await to('html', doc)).trim()
    expect(html).toBe('<p><strong>bold</strong></p>')
  })

  it('converts _italic_ to <em>italic</em>', async () => {
    const doc = await from('linkedin', '_italic_')
    const html = (await to('html', doc)).trim()
    expect(html).toBe('<p><em>italic</em></p>')
  })

  it('converts *italic* to <em>italic</em>', async () => {
    const doc = await from('linkedin', '*italic*')
    const html = (await to('html', doc)).trim()
    expect(html).toBe('<p><em>italic</em></p>')
  })

  it('converts bullet list to <ul><li>...</li></ul>', async () => {
    const doc = await from('linkedin', '• item one\n• item two')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>item one</li>')
    expect(html).toContain('<li>item two</li>')
    expect(html).toContain('</ul>')
  })

  it('converts ordered list to <ol><li>...</li></ol>', async () => {
    const doc = await from('linkedin', '1. first\n2. second')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>first</li>')
    expect(html).toContain('</ol>')
  })

  it('converts multiple paragraphs to multiple <p> tags', async () => {
    const doc = await from('linkedin', 'First paragraph\n\nSecond paragraph')
    const html = await to('html', doc)
    expect(html).toContain('<p>First paragraph</p>')
    expect(html).toContain('<p>Second paragraph</p>')
  })
})
