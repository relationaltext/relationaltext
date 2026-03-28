import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

// ─── fromTipTap — inline marks ────────────────────────────────────────────────

beforeAll(() => {
  registerTestFormats('tiptap', 'html')
})

describe('fromTipTap — inline marks', () => {
  it('parses bold mark', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'hello', marks: [{ type: 'bold' }] },
        ]},
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'dev.tiptap.facet#bold'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses italic mark', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'hello', marks: [{ type: 'italic' }] },
        ]},
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'dev.tiptap.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses code mark', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'fn()', marks: [{ type: 'code' }] },
        ]},
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'dev.tiptap.facet#code'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses link mark with href', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
        ]},
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'dev.tiptap.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg && seg.type === 'text') {
        const linkMark = seg.marks.find((m) => m.kind === 'dev.tiptap.facet#link')
        expect(linkMark?.attrs['href']).toBe('https://example.com')
      }
    }
  })

  it('parses strike mark', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'deleted', marks: [{ type: 'strike' }] },
        ]},
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'dev.tiptap.facet#strike'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('ignores textStyle presentational mark', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'styled', marks: [{ type: 'textStyle', attrs: { color: 'red' } }] },
        ]},
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      // Text should be present but no textStyle mark
      const seg = hir[0]!.children.find((c) => c.type === 'text' && c.content === 'styled')
      expect(seg).toBeDefined()
      if (seg && seg.type === 'text') {
        expect(seg.marks.some((m) => m.kind.includes('textStyle'))).toBe(false)
      }
    }
  })

  it('ignores highlight presentational mark', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'highlighted', marks: [{ type: 'highlight' }] },
        ]},
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find((c) => c.type === 'text' && c.content === 'highlighted')
      expect(seg).toBeDefined()
      if (seg && seg.type === 'text') {
        expect(seg.marks.some((m) => m.kind.includes('highlight'))).toBe(false)
      }
    }
  })
})

// ─── fromTipTap — block types ─────────────────────────────────────────────────

describe('fromTipTap — block types', () => {
  it('parses paragraph block', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('paragraph')
    }
  })

  it('parses heading with level', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'My Heading' }] },
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(3)
    }
  })

  it('parses codeBlock', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'codeBlock', content: [{ type: 'text', text: 'let x = 1' }] },
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('codeBlock')
    }
  })

  it('parses codeBlock with language attr', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'codeBlock', attrs: { language: 'typescript' }, content: [{ type: 'text', text: 'const x = 42' }] },
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('codeBlock')
      expect(hir[0]!.attrs['language']).toBe('typescript')
    }
  })

  it('parses bulletList with list-item-text children', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'bulletList', content: [
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Item A' }] },
          ]},
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Item B' }] },
          ]},
        ]},
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    // Find the ul container
    const ulContainer = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainer).toBeDefined()
    if (ulContainer && ulContainer.type === 'container') {
      const listItems = ulContainer.children.filter(
        (c) => c.type === 'container' && c.name === 'unordered-list-item',
      )
      expect(listItems.length).toBe(2)
    }
  })

  it('parses orderedList', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'orderedList', content: [
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
          ]},
        ]},
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(olContainer).toBeDefined()
  })

  it('parses orderedList with start attr', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'orderedList', attrs: { start: 3 }, content: [
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Third' }] },
          ]},
        ]},
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol:3')
    expect(olContainer).toBeDefined()
  })

  it('parses blockquote', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'blockquote', content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'quoted' }] },
        ]},
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    const bq = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(bq).toBeDefined()
  })

  it('parses horizontalRule', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
        { type: 'horizontalRule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    const hr = hir.find((n) => n.type === 'block' && n.name === 'horizontalRule')
    expect(hr).toBeDefined()
  })

  it('parses hardBreak inline as hardBreak entity', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'line one' },
          { type: 'hardBreak' },
          { type: 'text', text: 'line two' },
        ]},
      ],
    }
    const result = await from('tiptap', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const breakSeg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'dev.tiptap.facet#hardBreak'),
      )
      expect(breakSeg).toBeDefined()
    }
  })
})

// ─── toTipTap — round-trip ────────────────────────────────────────────────────

describe('toTipTap — round-trip', () => {
  it('bold text round-trip', async () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'hello', marks: [{ type: 'bold' }] },
        ]},
      ],
    }
    const doc = await from('tiptap', JSON.stringify(input))
    const output = JSON.parse(await to('tiptap', doc))
    expect(output.type).toBe('doc')
    const para = output.content?.[0]
    expect(para?.type).toBe('paragraph')
    const textNode = para?.content?.[0]
    expect(textNode?.type).toBe('text')
    expect(textNode?.text).toBe('hello')
    expect(textNode?.marks?.[0]?.type).toBe('bold')
  })

  it('heading level round-trip', async () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'My Heading' }] },
      ],
    }
    const doc = await from('tiptap', JSON.stringify(input))
    const output = JSON.parse(await to('tiptap', doc))
    const heading = output.content?.[0]
    expect(heading?.type).toBe('heading')
    expect(heading?.attrs?.['level']).toBe(3)
    expect(heading?.content?.[0]?.text).toBe('My Heading')
  })

  it('bullet list round-trip (2 items)', async () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'bulletList', content: [
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
          ]},
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Beta' }] },
          ]},
        ]},
      ],
    }
    const doc = await from('tiptap', JSON.stringify(input))
    const output = JSON.parse(await to('tiptap', doc))
    const list = output.content?.[0]
    expect(list?.type).toBe('bulletList')
    expect(list?.content?.length).toBe(2)
    expect(list?.content?.[0]?.type).toBe('listItem')
    expect(list?.content?.[0]?.content?.[0]?.type).toBe('paragraph')
    expect(list?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('Alpha')
  })

  it('ordered list round-trip', async () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'orderedList', content: [
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'One' }] },
          ]},
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Two' }] },
          ]},
        ]},
      ],
    }
    const doc = await from('tiptap', JSON.stringify(input))
    const output = JSON.parse(await to('tiptap', doc))
    const list = output.content?.[0]
    expect(list?.type).toBe('orderedList')
    expect(list?.content?.length).toBe(2)
  })

  it('link attrs (href) round-trip', async () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'visit', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
        ]},
      ],
    }
    const doc = await from('tiptap', JSON.stringify(input))
    const output = JSON.parse(await to('tiptap', doc))
    const textNode = output.content?.[0]?.content?.[0]
    expect(textNode?.marks?.[0]?.type).toBe('link')
    expect(textNode?.marks?.[0]?.attrs?.['href']).toBe('https://example.com')
  })

  it('codeBlock content preserved', async () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 42' }] },
      ],
    }
    const doc = await from('tiptap', JSON.stringify(input))
    const output = JSON.parse(await to('tiptap', doc))
    const block = output.content?.[0]
    expect(block?.type).toBe('codeBlock')
    expect(block?.content?.[0]?.text).toBe('const x = 42')
  })

  it('block-level image round-trip: wrapped in paragraph, src/alt preserved', async () => {
    // TipTap images are inline atoms (entity featureClass). A top-level image
    // in the TipTap doc is wrapped in a paragraph on import; on export, the
    // paragraph contains the image as an inline node.
    const input = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'https://example.com/photo.jpg', alt: 'A photo' } },
      ],
    }
    const doc = await from('tiptap', JSON.stringify(input))
    const output = JSON.parse(await to('tiptap', doc))
    const para = output.content?.[0]
    expect(para?.type).toBe('paragraph')
    const imgNode = para?.content?.[0]
    expect(imgNode?.type).toBe('image')
    expect(imgNode?.attrs?.['src']).toBe('https://example.com/photo.jpg')
    expect(imgNode?.attrs?.['alt']).toBe('A photo')
  })

  it('block-level image with title: title preserved through paragraph wrap', async () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'https://example.com/img.png', alt: 'img', title: 'My Image' } },
      ],
    }
    const doc = await from('tiptap', JSON.stringify(input))
    const output = JSON.parse(await to('tiptap', doc))
    const para = output.content?.[0]
    expect(para?.type).toBe('paragraph')
    const imgNode = para?.content?.[0]
    expect(imgNode?.type).toBe('image')
    expect(imgNode?.attrs?.['title']).toBe('My Image')
  })
})

// ─── Cross-format via lens ─────────────────────────────────────────────────────

describe('cross-format: fromTipTap → toHTML', () => {
  it('bold → <strong>', async () => {
    const doc = await from('tiptap', JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'hello', marks: [{ type: 'bold' }] },
        ]},
      ],
    }))
    expect((await to('html', doc)).trim()).toBe('<p><strong>hello</strong></p>')
  })

  it('heading h1 → <h1>', async () => {
    const doc = await from('tiptap', JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
      ],
    }))
    expect((await to('html', doc)).trim()).toBe('<h1>Title</h1>')
  })

  it('bulletList → <ul><li>', async () => {
    const doc = await from('tiptap', JSON.stringify({
      type: 'doc',
      content: [
        { type: 'bulletList', content: [
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Item' }] },
          ]},
        ]},
      ],
    }))
    expect((await to('html', doc)).trim()).toBe('<ul>\n<li>Item</li>\n</ul>')
  })

  it('blockquote → <blockquote><p>', async () => {
    const doc = await from('tiptap', JSON.stringify({
      type: 'doc',
      content: [
        { type: 'blockquote', content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'quoted text' }] },
        ]},
      ],
    }))
    expect((await to('html', doc)).trim()).toBe('<blockquote>\n<p>quoted text</p>\n</blockquote>')
  })

  it('italic → <em>', async () => {
    const doc = await from('tiptap', JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'world', marks: [{ type: 'italic' }] },
        ]},
      ],
    }))
    expect((await to('html', doc)).trim()).toBe('<p><em>world</em></p>')
  })

  it('link → <a href>', async () => {
    const doc = await from('tiptap', JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
        ]},
      ],
    }))
    expect((await to('html', doc)).trim()).toBe('<p><a href="https://example.com">click</a></p>')
  })

  it('horizontalRule → <hr />', async () => {
    const doc = await from('tiptap', JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
        { type: 'horizontalRule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
      ],
    }))
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<hr />')
  })
})

