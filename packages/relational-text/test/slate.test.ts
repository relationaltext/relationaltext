import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

// ─── fromSlate — inline marks ─────────────────────────────────────────────────

beforeAll(() => {
  registerTestFormats('slate', 'html')
})

describe('fromSlate — inline marks', () => {
  it('parses bold text', async () => {
    const doc = [
      { type: 'paragraph', children: [
        { text: 'hello', bold: true },
      ]},
    ]
    const result = await from('slate', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'rocks.slate.facet#bold'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses italic text', async () => {
    const doc = [
      { type: 'paragraph', children: [
        { text: 'world', italic: true },
      ]},
    ]
    const result = await from('slate', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'rocks.slate.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses link with url', async () => {
    const doc = [
      { type: 'paragraph', children: [
        { type: 'link', url: 'https://example.com', children: [{ text: 'click' }] },
      ]},
    ]
    const result = await from('slate', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'rocks.slate.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg && seg.type === 'text') {
        const linkMark = seg.marks.find((m) => m.kind === 'rocks.slate.facet#link')
        expect(linkMark?.attrs['url']).toBe('https://example.com')
      }
    }
  })

  it('parses heading-one', async () => {
    const doc = [
      { type: 'heading-one', children: [{ text: 'Title' }] },
    ]
    const result = await from('slate', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(1)
    }
  })

  it('parses code block', async () => {
    const doc = [
      { type: 'code', children: [{ text: 'let x = 1' }] },
    ]
    const result = await from('slate', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('code-block')
    }
  })

  it('parses bulleted-list', async () => {
    const doc = [
      { type: 'bulleted-list', children: [
        { type: 'list-item', children: [{ text: 'Item A' }] },
        { type: 'list-item', children: [{ text: 'Item B' }] },
      ]},
    ]
    const result = await from('slate', JSON.stringify(doc))
    const hir = result.toHIR()
    const ulContainer = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainer).toBeDefined()
    if (ulContainer && ulContainer.type === 'container') {
      const listItems = ulContainer.children.filter(
        (c) => c.type === 'container' && c.name === 'unordered-list-item',
      )
      expect(listItems.length).toBe(2)
    }
  })

  it('parses numbered-list', async () => {
    const doc = [
      { type: 'numbered-list', children: [
        { type: 'list-item', children: [{ text: 'First' }] },
        { type: 'list-item', children: [{ text: 'Second' }] },
      ]},
    ]
    const result = await from('slate', JSON.stringify(doc))
    const hir = result.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(olContainer).toBeDefined()
  })

  it('parses blockquote', async () => {
    const doc = [
      { type: 'block-quote', children: [
        { type: 'paragraph', children: [{ text: 'quoted' }] },
      ]},
    ]
    const result = await from('slate', JSON.stringify(doc))
    const hir = result.toHIR()
    const bq = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(bq).toBeDefined()
  })
})

// ─── toSlate — round-trip ─────────────────────────────────────────────────────

describe('toSlate — round-trip', () => {
  it('bold text round-trip', async () => {
    const input = [
      { type: 'paragraph', children: [
        { text: 'hello', bold: true },
      ]},
    ]
    const doc = await from('slate', JSON.stringify(input))
    const output = JSON.parse(await to('slate', doc))
    expect(output.length).toBeGreaterThan(0)
    const para = output[0]!
    expect(para.type).toBe('paragraph')
    const textNode = para.children[0]
    expect(textNode).toBeDefined()
    if (textNode && 'text' in textNode) {
      expect(textNode.text).toBe('hello')
      expect(textNode['bold']).toBe(true)
    }
  })

  it('heading round-trip', async () => {
    const input = [
      { type: 'heading-two', children: [{ text: 'My Heading' }] },
    ]
    const doc = await from('slate', JSON.stringify(input))
    const output = JSON.parse(await to('slate', doc))
    const heading = output[0]!
    expect(heading.type).toBe('heading-two')
    const textNode = heading.children[0]
    if (textNode && 'text' in textNode) {
      expect(textNode.text).toBe('My Heading')
    }
  })

  it('bullet list round-trip (2 items)', async () => {
    const input = [
      { type: 'bulleted-list', children: [
        { type: 'list-item', children: [{ text: 'Alpha' }] },
        { type: 'list-item', children: [{ text: 'Beta' }] },
      ]},
    ]
    const doc = await from('slate', JSON.stringify(input))
    const output = JSON.parse(await to('slate', doc))
    const list = output[0]!
    expect(list.type).toBe('bulleted-list')
    expect(list.children.length).toBe(2)
    expect(list.children[0]!.type).toBe('list-item')
    expect(list.children[1]!.type).toBe('list-item')
  })

  it('thematic-break round-trip produces thematic-break', async () => {
    const input = [
      { type: 'paragraph', children: [{ text: 'before' }] },
      { type: 'thematic-break', children: [{ text: '' }] },
      { type: 'paragraph', children: [{ text: 'after' }] },
    ]
    const doc = await from('slate', JSON.stringify(input))
    const output = JSON.parse(await to('slate', doc))
    const hrNode = output.find((n) => n.type === 'thematic-break')
    expect(hrNode).toBeDefined()
  })

  it('divider alias round-trips as thematic-break', async () => {
    const input = [
      { type: 'divider', children: [{ text: '' }] },
    ]
    const doc = await from('slate', JSON.stringify(input))
    const output = JSON.parse(await to('slate', doc))
    const hrNode = output.find((n) => n.type === 'thematic-break')
    expect(hrNode).toBeDefined()
  })
})

// ─── Cross-format via lens ────────────────────────────────────────────────────

describe('cross-format: fromSlate → toHTML', () => {
  it('bold → <strong>', async () => {
    const doc = await from('slate', JSON.stringify([
      { type: 'paragraph', children: [
        { text: 'hello', bold: true },
      ]},
    ]))
    expect((await to('html', doc)).trim()).toBe('<p><strong>hello</strong></p>')
  })

  it('italic → <em>', async () => {
    const doc = await from('slate', JSON.stringify([
      { type: 'paragraph', children: [
        { text: 'world', italic: true },
      ]},
    ]))
    expect((await to('html', doc)).trim()).toBe('<p><em>world</em></p>')
  })

  it('heading-one → <h1>', async () => {
    const doc = await from('slate', JSON.stringify([
      { type: 'heading-one', children: [{ text: 'Title' }] },
    ]))
    expect((await to('html', doc)).trim()).toBe('<h1>Title</h1>')
  })

  it('bulleted-list → contains <ul> and <li>', async () => {
    const doc = await from('slate', JSON.stringify([
      { type: 'bulleted-list', children: [
        { type: 'list-item', children: [{ text: 'Item' }] },
      ]},
    ]))
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
  })

  it('blockquote → contains <blockquote>', async () => {
    const doc = await from('slate', JSON.stringify([
      { type: 'block-quote', children: [
        { type: 'paragraph', children: [{ text: 'quoted text' }] },
      ]},
    ]))
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<blockquote>')
  })
})
