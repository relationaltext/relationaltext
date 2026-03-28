import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

// ─── fromContentful — inline marks ────────────────────────────────────────────

beforeAll(() => {
  registerTestFormats('contentful', 'html')
})

describe('fromContentful — inline marks', () => {
  it('parses bold mark', async () => {
    const doc = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'paragraph',
          data: {},
          content: [
            { nodeType: 'text', value: 'hello', marks: [{ type: 'bold' }], data: {} },
          ],
        },
      ],
    }
    const result = await from('contentful', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.contentful.richtext.facet#bold'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses italic mark', async () => {
    const doc = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'paragraph',
          data: {},
          content: [
            { nodeType: 'text', value: 'world', marks: [{ type: 'italic' }], data: {} },
          ],
        },
      ],
    }
    const result = await from('contentful', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.contentful.richtext.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses hyperlink with uri', async () => {
    const doc = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'paragraph',
          data: {},
          content: [
            {
              nodeType: 'hyperlink',
              data: { uri: 'https://example.com' },
              content: [
                { nodeType: 'text', value: 'click', marks: [], data: {} },
              ],
            },
          ],
        },
      ],
    }
    const result = await from('contentful', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.contentful.richtext.facet#hyperlink'),
      )
      expect(seg).toBeDefined()
      if (seg && seg.type === 'text') {
        const linkMark = seg.marks.find((m) => m.kind === 'com.contentful.richtext.facet#hyperlink')
        expect(linkMark?.attrs['uri']).toBe('https://example.com')
      }
    }
  })
})

// ─── fromContentful — block types ─────────────────────────────────────────────

describe('fromContentful — block types', () => {
  it('parses heading-1', async () => {
    const doc = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'heading-1',
          data: {},
          content: [{ nodeType: 'text', value: 'Title', marks: [], data: {} }],
        },
      ],
    }
    const result = await from('contentful', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading-1')
    }
  })

  it('parses heading-2', async () => {
    const doc = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'heading-2',
          data: {},
          content: [{ nodeType: 'text', value: 'Subtitle', marks: [], data: {} }],
        },
      ],
    }
    const result = await from('contentful', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading-2')
    }
  })

  it('parses unordered-list with 2 items', async () => {
    const doc = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'unordered-list',
          data: {},
          content: [
            {
              nodeType: 'list-item',
              data: {},
              content: [
                {
                  nodeType: 'paragraph',
                  data: {},
                  content: [{ nodeType: 'text', value: 'Item 1', marks: [], data: {} }],
                },
              ],
            },
            {
              nodeType: 'list-item',
              data: {},
              content: [
                {
                  nodeType: 'paragraph',
                  data: {},
                  content: [{ nodeType: 'text', value: 'Item 2', marks: [], data: {} }],
                },
              ],
            },
          ],
        },
      ],
    }
    const result = await from('contentful', JSON.stringify(doc))
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

  it('parses ordered-list', async () => {
    const doc = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'ordered-list',
          data: {},
          content: [
            {
              nodeType: 'list-item',
              data: {},
              content: [
                {
                  nodeType: 'paragraph',
                  data: {},
                  content: [{ nodeType: 'text', value: 'First', marks: [], data: {} }],
                },
              ],
            },
          ],
        },
      ],
    }
    const result = await from('contentful', JSON.stringify(doc))
    const hir = result.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(olContainer).toBeDefined()
  })

  it('parses blockquote', async () => {
    const doc = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'blockquote',
          data: {},
          content: [
            {
              nodeType: 'paragraph',
              data: {},
              content: [{ nodeType: 'text', value: 'quoted', marks: [], data: {} }],
            },
          ],
        },
      ],
    }
    const result = await from('contentful', JSON.stringify(doc))
    const hir = result.toHIR()
    const bq = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(bq).toBeDefined()
  })

  it('parses hr', async () => {
    const doc = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'paragraph',
          data: {},
          content: [{ nodeType: 'text', value: 'before', marks: [], data: {} }],
        },
        { nodeType: 'hr', data: {}, content: [] },
        {
          nodeType: 'paragraph',
          data: {},
          content: [{ nodeType: 'text', value: 'after', marks: [], data: {} }],
        },
      ],
    }
    const result = await from('contentful', JSON.stringify(doc))
    const hir = result.toHIR()
    const hr = hir.find((n) => n.type === 'block' && n.name === 'hr')
    expect(hr).toBeDefined()
  })
})

// ─── toContentful — round-trip ─────────────────────────────────────────────────

describe('toContentful — round-trip', () => {
  it('bold text round-trip', async () => {
    const input = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'paragraph',
          data: {},
          content: [
            { nodeType: 'text', value: 'hello', marks: [{ type: 'bold' }], data: {} },
          ],
        },
      ],
    }
    const doc = await from('contentful', JSON.stringify(input))
    const output = JSON.parse(await to('contentful', doc))
    expect(output.nodeType).toBe('document')
    const para = output.content[0]
    expect(para?.nodeType).toBe('paragraph')
    if (para?.nodeType === 'paragraph') {
      const cfEl = para as import('../src/contentful.js').ContentfulElement
      const textNode = cfEl.content[0] as import('../src/contentful.js').ContentfulText
      expect(textNode?.nodeType).toBe('text')
      expect(textNode?.value).toBe('hello')
      expect(textNode?.marks).toContainEqual({ type: 'bold' })
    }
  })

  it('heading round-trip', async () => {
    const input = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'heading-3',
          data: {},
          content: [{ nodeType: 'text', value: 'My Heading', marks: [], data: {} }],
        },
      ],
    }
    const doc = await from('contentful', JSON.stringify(input))
    const output = JSON.parse(await to('contentful', doc))
    const heading = output.content[0]
    expect(heading?.nodeType).toBe('heading-3')
    if (heading?.nodeType === 'heading-3') {
      const cfEl = heading as import('../src/contentful.js').ContentfulElement
      const textNode = cfEl.content[0] as import('../src/contentful.js').ContentfulText
      expect(textNode?.value).toBe('My Heading')
    }
  })

  it('unordered list round-trip', async () => {
    const input = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'unordered-list',
          data: {},
          content: [
            {
              nodeType: 'list-item',
              data: {},
              content: [
                {
                  nodeType: 'paragraph',
                  data: {},
                  content: [{ nodeType: 'text', value: 'Alpha', marks: [], data: {} }],
                },
              ],
            },
            {
              nodeType: 'list-item',
              data: {},
              content: [
                {
                  nodeType: 'paragraph',
                  data: {},
                  content: [{ nodeType: 'text', value: 'Beta', marks: [], data: {} }],
                },
              ],
            },
          ],
        },
      ],
    }
    const doc = await from('contentful', JSON.stringify(input))
    const output = JSON.parse(await to('contentful', doc))
    const list = output.content[0]
    expect(list?.nodeType).toBe('unordered-list')
    if (list?.nodeType === 'unordered-list') {
      const cfList = list as import('../src/contentful.js').ContentfulElement
      expect(cfList.content.length).toBe(2)
      expect(cfList.content[0]?.nodeType).toBe('list-item')
    }
  })
})

// ─── Cross-format via lens ─────────────────────────────────────────────────────

describe('cross-format: fromContentful → toHTML', () => {
  it('bold → <strong>', async () => {
    const doc = await from('contentful', JSON.stringify({
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'paragraph',
          data: {},
          content: [
            { nodeType: 'text', value: 'hello', marks: [{ type: 'bold' }], data: {} },
          ],
        },
      ],
    }))
    expect((await to('html', doc)).trim()).toBe('<p><strong>hello</strong></p>')
  })

  it('heading-1 → <h1>', async () => {
    const doc = await from('contentful', JSON.stringify({
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'heading-1',
          data: {},
          content: [{ nodeType: 'text', value: 'Title', marks: [], data: {} }],
        },
      ],
    }))
    expect((await to('html', doc)).trim()).toBe('<h1>Title</h1>')
  })

  it('unordered-list → contains <ul> and <li>', async () => {
    const doc = await from('contentful', JSON.stringify({
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'unordered-list',
          data: {},
          content: [
            {
              nodeType: 'list-item',
              data: {},
              content: [
                {
                  nodeType: 'paragraph',
                  data: {},
                  content: [{ nodeType: 'text', value: 'Item', marks: [], data: {} }],
                },
              ],
            },
          ],
        },
      ],
    }))
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
  })

  it('blockquote → contains <blockquote>', async () => {
    const doc = await from('contentful', JSON.stringify({
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'blockquote',
          data: {},
          content: [
            {
              nodeType: 'paragraph',
              data: {},
              content: [{ nodeType: 'text', value: 'quoted text', marks: [], data: {} }],
            },
          ],
        },
      ],
    }))
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<blockquote>')
  })
})
