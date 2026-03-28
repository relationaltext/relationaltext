import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

// ─── fromProseMirror — inline marks ───────────────────────────────────────────

beforeAll(() => {
  registerTestFormats('prosemirror', 'html')
})

describe('fromProseMirror — inline marks', () => {
  it('parses bold mark', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'hello', marks: [{ type: 'bold' }] },
        ]},
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.prosemirror.facet#bold'),
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
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.prosemirror.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses underline mark', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'hello', marks: [{ type: 'underline' }] },
        ]},
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.prosemirror.facet#underline'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses strike mark', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'hello', marks: [{ type: 'strike' }] },
        ]},
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.prosemirror.facet#strike'),
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
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.prosemirror.facet#code'),
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
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.prosemirror.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg && seg.type === 'text') {
        const linkMark = seg.marks.find((m) => m.kind === 'org.prosemirror.facet#link')
        expect(linkMark?.attrs['href']).toBe('https://example.com')
      }
    }
  })

  it('parses superscript mark', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: '2', marks: [{ type: 'superscript' }] },
        ]},
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.prosemirror.facet#superscript'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses subscript mark', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: '2', marks: [{ type: 'subscript' }] },
        ]},
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.prosemirror.facet#subscript'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('normalizes strong alias to bold', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'hello', marks: [{ type: 'strong' }] },
        ]},
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.prosemirror.facet#bold'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('normalizes em alias to italic', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'hello', marks: [{ type: 'em' }] },
        ]},
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.prosemirror.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })
})

// ─── fromProseMirror — block types ────────────────────────────────────────────

describe('fromProseMirror — block types', () => {
  it('parses paragraph block', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
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
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(2)
    }
  })

  it('parses code_block', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'code_block', content: [{ type: 'text', text: 'let x = 1' }] },
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('code_block')
    }
  })

  it('parses code_block with language attr', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'code_block', attrs: { language: 'python' }, content: [{ type: 'text', text: 'print("hi")' }] },
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('code_block')
      expect(hir[0]!.attrs['language']).toBe('python')
    }
  })

  it('parses bullet_list with list-item-text children', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'bullet_list', content: [
          { type: 'list_item', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Item A' }] },
          ]},
          { type: 'list_item', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Item B' }] },
          ]},
        ]},
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
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

  it('parses ordered_list', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'ordered_list', content: [
          { type: 'list_item', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
          ]},
        ]},
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(olContainer).toBeDefined()
  })

  it('parses ordered_list with start attr', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'ordered_list', attrs: { start: 3 }, content: [
          { type: 'list_item', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Third' }] },
          ]},
        ]},
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
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
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    const bq = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(bq).toBeDefined()
  })

  it('parses horizontal_rule', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
        { type: 'horizontal_rule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    const hr = hir.find((n) => n.type === 'block' && n.name === 'horizontal_rule')
    expect(hr).toBeDefined()
  })

  it('parses hard_break inline as hard-break entity', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'line one' },
          { type: 'hard_break' },
          { type: 'text', text: 'line two' },
        ]},
      ],
    }
    const result = await from('prosemirror', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const breakSeg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.prosemirror.facet#hard_break'),
      )
      expect(breakSeg).toBeDefined()
    }
  })
})

// ─── toProseMirror — round-trip ───────────────────────────────────────────────

describe('toProseMirror — round-trip', () => {
  it('bold text round-trip', async () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'hello', marks: [{ type: 'bold' }] },
        ]},
      ],
    }
    const doc = await from('prosemirror', JSON.stringify(input))
    const output = JSON.parse(await to('prosemirror', doc))
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
    const doc = await from('prosemirror', JSON.stringify(input))
    const output = JSON.parse(await to('prosemirror', doc))
    const heading = output.content?.[0]
    expect(heading?.type).toBe('heading')
    expect(heading?.attrs?.['level']).toBe(3)
    expect(heading?.content?.[0]?.text).toBe('My Heading')
  })

  it('bullet list round-trip (2 items)', async () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'bullet_list', content: [
          { type: 'list_item', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
          ]},
          { type: 'list_item', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Beta' }] },
          ]},
        ]},
      ],
    }
    const doc = await from('prosemirror', JSON.stringify(input))
    const output = JSON.parse(await to('prosemirror', doc))
    const list = output.content?.[0]
    expect(list?.type).toBe('bullet_list')
    expect(list?.content?.length).toBe(2)
    expect(list?.content?.[0]?.type).toBe('list_item')
    expect(list?.content?.[0]?.content?.[0]?.type).toBe('paragraph')
    expect(list?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('Alpha')
  })

  it('ordered list round-trip', async () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'ordered_list', content: [
          { type: 'list_item', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'One' }] },
          ]},
          { type: 'list_item', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Two' }] },
          ]},
        ]},
      ],
    }
    const doc = await from('prosemirror', JSON.stringify(input))
    const output = JSON.parse(await to('prosemirror', doc))
    const list = output.content?.[0]
    expect(list?.type).toBe('ordered_list')
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
    const doc = await from('prosemirror', JSON.stringify(input))
    const output = JSON.parse(await to('prosemirror', doc))
    const textNode = output.content?.[0]?.content?.[0]
    expect(textNode?.marks?.[0]?.type).toBe('link')
    expect(textNode?.marks?.[0]?.attrs?.['href']).toBe('https://example.com')
  })

  it('code_block content preserved', async () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'code_block', content: [{ type: 'text', text: 'const x = 42' }] },
      ],
    }
    const doc = await from('prosemirror', JSON.stringify(input))
    const output = JSON.parse(await to('prosemirror', doc))
    const block = output.content?.[0]
    expect(block?.type).toBe('code_block')
    expect(block?.content?.[0]?.text).toBe('const x = 42')
  })

  it('nested list round-trip', async () => {
    const input = {
      type: 'doc',
      content: [
        { type: 'bullet_list', content: [
          { type: 'list_item', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Outer' }] },
            { type: 'bullet_list', content: [
              { type: 'list_item', content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Nested' }] },
              ]},
            ]},
          ]},
        ]},
      ],
    }
    const doc = await from('prosemirror', JSON.stringify(input))
    const output = JSON.parse(await to('prosemirror', doc))
    const outerList = output.content?.[0]
    expect(outerList?.type).toBe('bullet_list')
    const outerItem = outerList?.content?.[0]
    expect(outerItem?.type).toBe('list_item')
    // Should have a paragraph and a nested bullet_list
    const innerList = outerItem?.content?.find((n) => n.type === 'bullet_list')
    expect(innerList).toBeDefined()
    expect(innerList?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('Nested')
  })
})

// ─── Cross-format via lens ─────────────────────────────────────────────────────

describe('cross-format: fromProseMirror → toHTML', () => {
  it('bold → <strong>', async () => {
    const doc = await from('prosemirror', JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'hello', marks: [{ type: 'bold' }] },
        ]},
      ],
    }))
    expect((await to('html', doc)).trim()).toBe('<p><strong>hello</strong></p>')
  })

  it('italic → <em>', async () => {
    const doc = await from('prosemirror', JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'world', marks: [{ type: 'italic' }] },
        ]},
      ],
    }))
    expect((await to('html', doc)).trim()).toBe('<p><em>world</em></p>')
  })

  it('heading level 1 → <h1>', async () => {
    const doc = await from('prosemirror', JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
      ],
    }))
    expect((await to('html', doc)).trim()).toBe('<h1>Title</h1>')
  })

  it('link → <a href>', async () => {
    const doc = await from('prosemirror', JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
        ]},
      ],
    }))
    expect((await to('html', doc)).trim()).toBe('<p><a href="https://example.com">click</a></p>')
  })

  it('bullet_list → <ul><li>', async () => {
    const doc = await from('prosemirror', JSON.stringify({
      type: 'doc',
      content: [
        { type: 'bullet_list', content: [
          { type: 'list_item', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Item' }] },
          ]},
        ]},
      ],
    }))
    expect((await to('html', doc)).trim()).toBe('<ul>\n<li>Item</li>\n</ul>')
  })

  it('code_block → <pre><code>', async () => {
    const doc = await from('prosemirror', JSON.stringify({
      type: 'doc',
      content: [
        { type: 'code_block', content: [{ type: 'text', text: 'let x = 1' }] },
      ],
    }))
    expect((await to('html', doc)).trim()).toBe('<pre><code>let x = 1\n</code></pre>')
  })

  it('blockquote → <blockquote><p>', async () => {
    const doc = await from('prosemirror', JSON.stringify({
      type: 'doc',
      content: [
        { type: 'blockquote', content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'quoted text' }] },
        ]},
      ],
    }))
    expect((await to('html', doc)).trim()).toBe('<blockquote>\n<p>quoted text</p>\n</blockquote>')
  })
})
