import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRichText(
  content: string,
  opts: {
    bold?: boolean
    italic?: boolean
    strikethrough?: boolean
    underline?: boolean
    code?: boolean
    href?: string | null
  } = {},
) {
  return {
    type: 'text',
    text: {
      content,
      link: opts.href ? { url: opts.href } : null,
    },
    annotations: {
      bold: opts.bold ?? false,
      italic: opts.italic ?? false,
      strikethrough: opts.strikethrough ?? false,
      underline: opts.underline ?? false,
      code: opts.code ?? false,
      color: 'default',
    },
    plain_text: content,
    href: opts.href ?? null,
  }
}

function paragraph(richText: any[]): any {
  return { type: 'paragraph', paragraph: { rich_text: richText } }
}

// ─── fromNotion — inline marks ────────────────────────────────────────────────

beforeAll(() => {
  registerTestFormats('notion', 'html')
})

describe('fromNotion — inline marks', () => {
  it('parses bold annotation', async () => {
    const blocks = [paragraph([makeRichText('hello', { bold: true })])]
    const doc = await from('notion', JSON.stringify(blocks))
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const boldSeg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.notion.facet#bold'),
      )
      expect(boldSeg).toBeDefined()
    }
  })

  it('parses italic annotation', async () => {
    const blocks = [paragraph([makeRichText('hello', { italic: true })])]
    const doc = await from('notion', JSON.stringify(blocks))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.notion.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses link via href field', async () => {
    const rt = {
      type: 'text',
      text: { content: 'click', link: null },
      annotations: {
        bold: false, italic: false, strikethrough: false, underline: false, code: false,
      },
      plain_text: 'click',
      href: 'https://example.com',
    }
    const blocks = [paragraph([rt])]
    const doc = await from('notion', JSON.stringify(blocks))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.notion.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'com.notion.facet#link')
        expect(mark?.attrs['url']).toBe('https://example.com')
      }
    }
  })
})

// ─── fromNotion — block types ─────────────────────────────────────────────────

describe('fromNotion — block types', () => {
  it('parses heading_1 block', async () => {
    const blocks = [
      { type: 'heading_1', heading_1: { rich_text: [makeRichText('Title')] } },
    ]
    const doc = await from('notion', JSON.stringify(blocks))
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading_1')
    }
  })

  it('parses heading_2 block', async () => {
    const blocks = [
      { type: 'heading_2', heading_2: { rich_text: [makeRichText('Section')] } },
    ]
    const doc = await from('notion', JSON.stringify(blocks))
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading_2')
    }
  })

  it('parses bulleted_list_item with 2 items detecting boundary', async () => {
    const blocks = [
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [makeRichText('item one')] } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [makeRichText('item two')] } },
    ]
    const doc = await from('notion', JSON.stringify(blocks))
    const hir = doc.toHIR()
    // Should produce a single ul container (one bullet-list-marker)
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
    // Ensure only 1 ul container was created (both items share the same list)
    const ulContainers = hir.filter((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainers.length).toBe(1)
  })

  it('parses numbered_list_item as ol container', async () => {
    const blocks = [
      { type: 'numbered_list_item', numbered_list_item: { rich_text: [makeRichText('first')] } },
      { type: 'numbered_list_item', numbered_list_item: { rich_text: [makeRichText('second')] } },
    ]
    const doc = await from('notion', JSON.stringify(blocks))
    const hir = doc.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(olContainer).toBeDefined()
  })

  it('parses quote block as blockquote container', async () => {
    const blocks = [
      { type: 'quote', quote: { rich_text: [makeRichText('quoted text')] } },
    ]
    const doc = await from('notion', JSON.stringify(blocks))
    const hir = doc.toHIR()
    const blockquote = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(blockquote).toBeDefined()
  })

  it('parses code block with language', async () => {
    const blocks = [
      {
        type: 'code',
        code: {
          rich_text: [makeRichText('const x = 1')],
          language: 'javascript',
        },
      },
    ]
    const doc = await from('notion', JSON.stringify(blocks))
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      expect(codeBlock.attrs['language']).toBe('javascript')
    }
  })

  it('parses divider block', async () => {
    const blocks = [{ type: 'divider', divider: {} }]
    const doc = await from('notion', JSON.stringify(blocks))
    const hir = doc.toHIR()
    const hr = hir.find((n) => n.type === 'block' && n.name === 'divider')
    expect(hr).toBeDefined()
  })
})

// ─── toNotion — round-trip ────────────────────────────────────────────────────

describe('toNotion — round-trip', () => {
  it('bold text round-trips', async () => {
    const input = [paragraph([makeRichText('hello', { bold: true })])]
    const doc = await from('notion', JSON.stringify(input))
    const output = JSON.parse(await to('notion', doc))
    const para = output.find((b) => b.type === 'paragraph')
    expect(para).toBeDefined()
    const rt = (para?.['paragraph'] as { rich_text: any[] })?.rich_text ?? []
    const boldItem = rt.find((r) => r.annotations?.bold === true)
    expect(boldItem).toBeDefined()
    expect(boldItem?.text?.content).toBe('hello')
  })

  it('heading round-trips', async () => {
    const input = [
      { type: 'heading_2', heading_2: { rich_text: [makeRichText('Section')] } },
    ]
    const doc = await from('notion', JSON.stringify(input))
    const output = JSON.parse(await to('notion', doc))
    const heading = output.find((b) => b.type === 'heading_2')
    expect(heading).toBeDefined()
    const rt = (heading?.['heading_2'] as { rich_text: any[] })?.rich_text ?? []
    expect(rt[0]?.text?.content).toBe('Section')
  })

  it('bulleted list round-trips with 2 items', async () => {
    const input = [
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [makeRichText('item one')] } },
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [makeRichText('item two')] } },
    ]
    const doc = await from('notion', JSON.stringify(input))
    const output = JSON.parse(await to('notion', doc))
    const listItems = output.filter((b) => b.type === 'bulleted_list_item')
    expect(listItems.length).toBe(2)
    const texts = listItems.map((b) => {
      const rt = (b['bulleted_list_item'] as { rich_text: any[] })?.rich_text ?? []
      return rt[0]?.text?.content ?? ''
    })
    expect(texts).toContain('item one')
    expect(texts).toContain('item two')
  })
})

// ─── Cross-format via lens ────────────────────────────────────────────────────

describe('fromNotion → toHTML (cross-format via lens)', () => {
  it('bold → <strong>', async () => {
    const blocks = [paragraph([makeRichText('hello', { bold: true })])]
    const html = (await to('html', await from('notion', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<strong>hello</strong>')
  })

  it('heading_1 → <h1>', async () => {
    const blocks = [
      { type: 'heading_1', heading_1: { rich_text: [makeRichText('My Title')] } },
    ]
    const html = (await to('html', await from('notion', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<h1>My Title</h1>')
  })

  it('bulleted list → contains <ul> and <li>', async () => {
    const blocks = [
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [makeRichText('item')] } },
    ]
    const html = (await to('html', await from('notion', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })
})

// ─── fromNotion — JSON string input ───────────────────────────────────────────

describe('fromNotion — JSON string input', () => {
  it('accepts a JSON string', async () => {
    const blocksStr = JSON.stringify([
      { type: 'paragraph', paragraph: { rich_text: [makeRichText('hello')] } },
    ])
    const doc = await from('notion', JSON.stringify(blocksStr))
    expect(doc.text).toContain('hello')
  })
})
