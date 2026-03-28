import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'
beforeAll(() => {
  registerTestFormats('threads', 'html')
})

// ─── fromThreads — inline marks ───────────────────────────────────────────────

describe('fromThreads — inline marks', () => {
  it('parses **bold** as bold mark', async () => {
    const doc = await from('threads', '**bold**')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const boldSeg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.threads.facet#bold'),
      )
      expect(boldSeg).toBeDefined()
    }
  })

  it('parses _italic_ as italic mark', async () => {
    const doc = await from('threads', '_italic_')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const italicSeg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.threads.facet#italic'),
      )
      expect(italicSeg).toBeDefined()
    }
  })

  it('parses plain text as text node without marks', async () => {
    const doc = await from('threads', 'Hello world')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block?.type).toBe('block')
    if (block?.type === 'block') {
      const textSeg = block.children.find((c) => c.type === 'text' && c.content === 'Hello world')
      expect(textSeg).toBeDefined()
    }
  })
})

// ─── fromThreads — entities ───────────────────────────────────────────────────

describe('fromThreads — entities', () => {
  it('parses @username as mention entity with handle', async () => {
    const doc = await from('threads', '@username')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block?.type).toBe('block')
    if (block?.type === 'block') {
      const mentionSeg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.threads.facet#mention'),
      )
      expect(mentionSeg).toBeDefined()
      if (mentionSeg?.type === 'text') {
        const mark = mentionSeg.marks.find((m) => m.kind === 'com.threads.facet#mention')
        expect(mark?.attrs['handle']).toBe('username')
      }
    }
  })

  it('parses #opentowork as hashtag entity with tag', async () => {
    const doc = await from('threads', '#opentowork')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block?.type).toBe('block')
    if (block?.type === 'block') {
      const hashtagSeg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.threads.facet#hashtag'),
      )
      expect(hashtagSeg).toBeDefined()
      if (hashtagSeg?.type === 'text') {
        const mark = hashtagSeg.marks.find((m) => m.kind === 'com.threads.facet#hashtag')
        expect(mark?.attrs['tag']).toBe('opentowork')
      }
    }
  })

  it('parses https://example.com as link entity with href', async () => {
    const doc = await from('threads', 'https://example.com')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block?.type).toBe('block')
    if (block?.type === 'block') {
      const linkSeg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.threads.facet#link'),
      )
      expect(linkSeg).toBeDefined()
      if (linkSeg?.type === 'text') {
        const mark = linkSeg.marks.find((m) => m.kind === 'com.threads.facet#link')
        expect(mark?.attrs['href']).toBe('https://example.com')
      }
    }
  })
})

// ─── fromThreads — block structure ────────────────────────────────────────────

describe('fromThreads — block structure', () => {
  it('parses a plain paragraph into a paragraph block', async () => {
    const doc = await from('threads', 'Just some text')
    const hir = doc.toHIR()
    const paragraphs = hir.filter((n) => n.type === 'block' && n.name === 'paragraph')
    expect(paragraphs.length).toBe(1)
  })

  it('parses two paragraphs separated by \\n\\n into two paragraph blocks', async () => {
    const doc = await from('threads', 'First paragraph\n\nSecond paragraph')
    const hir = doc.toHIR()
    const paragraphs = hir.filter((n) => n.type === 'block' && n.name === 'paragraph')
    expect(paragraphs.length).toBe(2)
  })

  it('parses mixed inline content (bold + hashtag) in same paragraph', async () => {
    const doc = await from('threads', '**bold** text #tag')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block?.type).toBe('block')
    if (block?.type === 'block') {
      const hasBold = block.children.some(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.threads.facet#bold'),
      )
      const hasHashtag = block.children.some(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.threads.facet#hashtag'),
      )
      expect(hasBold).toBe(true)
      expect(hasHashtag).toBe(true)
    }
  })
})

// ─── Round-trip tests ─────────────────────────────────────────────────────────

describe('toThreads — round-trips', () => {
  it('round-trips **bold**', async () => {
    const doc = await from('threads', '**bold**')
    const output = (await to('threads', doc)).trim()
    expect(output).toBe('**bold**')
  })

  it('round-trips @user mention', async () => {
    const doc = await from('threads', '@user')
    const output = (await to('threads', doc)).trim()
    expect(output).toBe('@user')
  })

  it('round-trips #tag hashtag', async () => {
    const doc = await from('threads', '#tag')
    const output = (await to('threads', doc)).trim()
    expect(output).toBe('#tag')
  })

  it('round-trips two paragraphs separated by \\n\\n', async () => {
    const input = 'First paragraph\n\nSecond paragraph'
    const doc = await from('threads', input)
    const output = (await to('threads', doc)).trim()
    expect(output).toBe(input)
  })

  it('round-trips multiple paragraphs', async () => {
    const input = 'Para one\n\nPara two\n\nPara three'
    const doc = await from('threads', input)
    const output = (await to('threads', doc)).trim()
    expect(output).toBe(input)
  })
})

// ─── Cross-format tests (Threads → HTML) ──────────────────────────────────────

describe('cross-format: Threads → HTML', () => {
  it('converts **bold** to <strong>bold</strong>', async () => {
    const doc = await from('threads', '**bold**')
    const html = (await to('html', doc)).trim()
    expect(html).toBe('<p><strong>bold</strong></p>')
  })

  it('converts _italic_ to <em>italic</em>', async () => {
    const doc = await from('threads', '_italic_')
    const html = (await to('html', doc)).trim()
    expect(html).toBe('<p><em>italic</em></p>')
  })

  it('converts a paragraph to <p>...</p>', async () => {
    const doc = await from('threads', 'Hello Threads!')
    const html = (await to('html', doc)).trim()
    expect(html).toBe('<p>Hello Threads!</p>')
  })

  it('converts multiple paragraphs to multiple <p> tags', async () => {
    const doc = await from('threads', 'First paragraph\n\nSecond paragraph')
    const html = await to('html', doc)
    expect(html).toContain('<p>First paragraph</p>')
    expect(html).toContain('<p>Second paragraph</p>')
  })

  it('converts **bold** _italic_ mixed content to HTML', async () => {
    const doc = await from('threads', '**bold** and _italic_')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
  })

  it('converts @mention to text content (passthrough in HTML)', async () => {
    const doc = await from('threads', '@user')
    const html = (await to('html', doc)).trim()
    // Mentions are kept as-is (no HTML transformation); text content is @user
    expect(html).toContain('@user')
  })
})
