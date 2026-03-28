import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

// ─── fromLexical — inline marks ───────────────────────────────────────────────

beforeAll(() => {
  registerTestFormats('lexical', 'html')
})

describe('fromLexical — inline marks', () => {
  it('parses bold text (format=1)', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'hello', format: 1, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const result = await from('lexical', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const boldSeg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'io.lexical.facet#bold'),
      )
      expect(boldSeg).toBeDefined()
    }
  })

  it('parses italic text (format=2)', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'world', format: 2, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const result = await from('lexical', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'io.lexical.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses strikethrough text (format=4)', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'old', format: 4, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const result = await from('lexical', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'io.lexical.facet#strikethrough'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses underline text (format=8)', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'underlined', format: 8, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const result = await from('lexical', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'io.lexical.facet#underline'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses code text (format=16)', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'x', format: 16, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const result = await from('lexical', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'io.lexical.facet#code'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses bold+italic combined (format=3)', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'emphasis', format: 3, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const result = await from('lexical', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) =>
          c.type === 'text' &&
          c.marks.some((m) => m.kind === 'io.lexical.facet#bold') &&
          c.marks.some((m) => m.kind === 'io.lexical.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses normal text (format=0) with no marks', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'plain', format: 0, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const result = await from('lexical', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find((c) => c.type === 'text' && c.content === 'plain')
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.marks.filter((m) => m.kind.startsWith('io.lexical.facet#')).length).toBe(0)
      }
    }
  })
})

// ─── fromLexical — block types ────────────────────────────────────────────────

describe('fromLexical — block types', () => {
  it('parses heading h1', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'heading',
            tag: 'h1',
            children: [{ type: 'text', text: 'Title', format: 0, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const result = await from('lexical', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(1)
    }
  })

  it('parses heading h2 through h6', async () => {
    for (let i = 2; i <= 6; i++) {
      const doc = {
        root: {
          type: 'root',
          children: [
            {
              type: 'heading',
              tag: `h${i}`,
              children: [{ type: 'text', text: 'Section', format: 0, version: 1 }],
              version: 1,
            },
          ],
          version: 1,
        },
      }
      const result = await from('lexical', JSON.stringify(doc))
      const hir = result.toHIR()
      if (hir[0]!.type === 'block') {
        expect(hir[0]!.name).toBe('heading')
        expect(hir[0]!.attrs['level']).toBe(i)
      }
    }
  })

  it('parses code block with language attr', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'code',
            language: 'python',
            children: [{ type: 'text', text: "print('hi')", format: 0, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const result = await from('lexical', JSON.stringify(doc))
    const hir = result.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      expect(codeBlock.attrs['language']).toBe('python')
    }
  })

  it('parses code block without language', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'code',
            children: [{ type: 'text', text: 'const x = 1', format: 0, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const result = await from('lexical', JSON.stringify(doc))
    const hir = result.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
  })

  it('parses bullet list', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'list',
            listType: 'bullet',
            start: 1,
            children: [
              {
                type: 'listitem',
                value: 1,
                children: [{ type: 'text', text: 'Item 1', format: 0, version: 1 }],
                version: 1,
              },
              {
                type: 'listitem',
                value: 2,
                children: [{ type: 'text', text: 'Item 2', format: 0, version: 1 }],
                version: 1,
              },
            ],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const result = await from('lexical', JSON.stringify(doc))
    const hir = result.toHIR()
    const ulContainer = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainer).toBeDefined()
  })

  it('parses ordered list', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'list',
            listType: 'number',
            start: 1,
            children: [
              {
                type: 'listitem',
                value: 1,
                children: [{ type: 'text', text: 'First', format: 0, version: 1 }],
                version: 1,
              },
              {
                type: 'listitem',
                value: 2,
                children: [{ type: 'text', text: 'Second', format: 0, version: 1 }],
                version: 1,
              },
            ],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const result = await from('lexical', JSON.stringify(doc))
    const hir = result.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(olContainer).toBeDefined()
  })

  it('parses plain paragraph', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'Hello world', format: 0, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const result = await from('lexical', JSON.stringify(doc))
    const hir = result.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('paragraph')
    }
  })

  it('parses link node', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'link',
                url: 'https://example.com',
                children: [{ type: 'text', text: 'click here', format: 0, version: 1 }],
                version: 1,
              },
            ],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const result = await from('lexical', JSON.stringify(doc))
    const hir = result.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'io.lexical.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'io.lexical.facet#link')
        expect(mark?.attrs['url']).toBe('https://example.com')
      }
    }
  })

  it('accepts JSON string input', async () => {
    const docStr = JSON.stringify({
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'hello', format: 0, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    })
    const result = await from('lexical', JSON.stringify(docStr))
    expect(result.text).toContain('hello')
  })
})

// ─── toLexical — round-trip ────────────────────────────────────────────────────

describe('toLexical — round-trip', () => {
  it('bold text round-trips', async () => {
    const input = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'hello', format: 1, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const doc = await from('lexical', JSON.stringify(input))
    const output = JSON.parse(await to('lexical', doc))
    // Find a text node with bold format (bit 1)
    const para = output.root.children[0] as Record<string, unknown>
    expect(para['type']).toBe('paragraph')
    const children = para['children'] as Array<Record<string, unknown>>
    const boldNode = children.find((c) => typeof c['format'] === 'number' && (c['format'] as number & 1) === 1 && c['text'] === 'hello')
    expect(boldNode).toBeDefined()
  })

  it('heading round-trips', async () => {
    const input = {
      root: {
        type: 'root',
        children: [
          {
            type: 'heading',
            tag: 'h2',
            children: [{ type: 'text', text: 'Section', format: 0, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const doc = await from('lexical', JSON.stringify(input))
    const output = JSON.parse(await to('lexical', doc))
    const heading = output.root.children[0] as Record<string, unknown>
    expect(heading['type']).toBe('heading')
    expect(heading['tag']).toBe('h2')
  })

  it('bullet list round-trips', async () => {
    const input = {
      root: {
        type: 'root',
        children: [
          {
            type: 'list',
            listType: 'bullet',
            start: 1,
            children: [
              {
                type: 'listitem',
                value: 1,
                children: [{ type: 'text', text: 'Item 1', format: 0, version: 1 }],
                version: 1,
              },
              {
                type: 'listitem',
                value: 2,
                children: [{ type: 'text', text: 'Item 2', format: 0, version: 1 }],
                version: 1,
              },
            ],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const doc = await from('lexical', JSON.stringify(input))
    const output = JSON.parse(await to('lexical', doc))
    const list = output.root.children.find((c) => (c as Record<string, unknown>)['type'] === 'list') as Record<string, unknown> | undefined
    expect(list).toBeDefined()
    expect(list?.['listType']).toBe('bullet')
    const items = list?.['children'] as Array<Record<string, unknown>> | undefined
    expect(items?.length).toBe(2)
  })

  it('paragraph text round-trips', async () => {
    const input = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'Hello world', format: 0, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const doc = await from('lexical', JSON.stringify(input))
    const output = JSON.parse(await to('lexical', doc))
    const para = output.root.children[0] as Record<string, unknown>
    expect(para['type']).toBe('paragraph')
    const children = para['children'] as Array<Record<string, unknown>>
    const textNode = children.find((c) => c['text'] === 'Hello world')
    expect(textNode).toBeDefined()
  })
})

// ─── Cross-format via lens ────────────────────────────────────────────────────

describe('fromLexical → toHTML (cross-format via lens)', () => {
  it('bold → <strong>', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'hello', format: 1, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const html = (await to('html', await from('lexical', JSON.stringify(doc)))).trim()
    expect(html).toContain('<strong>hello</strong>')
  })

  it('italic → <em>', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'world', format: 2, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const html = (await to('html', await from('lexical', JSON.stringify(doc)))).trim()
    expect(html).toContain('<em>world</em>')
  })

  it('heading h1 → <h1>', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'heading',
            tag: 'h1',
            children: [{ type: 'text', text: 'My Title', format: 0, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const html = (await to('html', await from('lexical', JSON.stringify(doc)))).trim()
    expect(html).toContain('<h1>My Title</h1>')
  })

  it('heading h3 → <h3>', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'heading',
            tag: 'h3',
            children: [{ type: 'text', text: 'Section', format: 0, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const html = (await to('html', await from('lexical', JSON.stringify(doc)))).trim()
    expect(html).toContain('<h3>Section</h3>')
  })

  it('bullet list → contains <ul> and <li>', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'list',
            listType: 'bullet',
            start: 1,
            children: [
              {
                type: 'listitem',
                value: 1,
                children: [{ type: 'text', text: 'item', format: 0, version: 1 }],
                version: 1,
              },
            ],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const html = (await to('html', await from('lexical', JSON.stringify(doc)))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })

  it('ordered list → contains <ol> and <li>', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'list',
            listType: 'number',
            start: 1,
            children: [
              {
                type: 'listitem',
                value: 1,
                children: [{ type: 'text', text: 'first', format: 0, version: 1 }],
                version: 1,
              },
            ],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const html = (await to('html', await from('lexical', JSON.stringify(doc)))).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
  })

  it('code block → <pre><code>', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'code',
            language: 'javascript',
            children: [{ type: 'text', text: 'let x = 1;', format: 0, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const html = (await to('html', await from('lexical', JSON.stringify(doc)))).trim()
    expect(html).toContain('<pre><code')
    expect(html).toContain('let x = 1;')
  })

  it('paragraph → <p>', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'plain text', format: 0, version: 1 }],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const html = (await to('html', await from('lexical', JSON.stringify(doc)))).trim()
    expect(html).toContain('<p>plain text</p>')
  })

  it('link → <a href>', async () => {
    const doc = {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'link',
                url: 'https://example.com',
                children: [{ type: 'text', text: 'click here', format: 0, version: 1 }],
                version: 1,
              },
            ],
            version: 1,
          },
        ],
        version: 1,
      },
    }
    const html = (await to('html', await from('lexical', JSON.stringify(doc)))).trim()
    expect(html).toContain('<a href="https://example.com">click here</a>')
  })
})

// ─── fromLexical — full example ───────────────────────────────────────────────

describe('fromLexical — full Lexical JSON example', () => {
  it('parses the full example from the spec', async () => {
    const input = {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'Hello ', format: 1, version: 1 },
              { type: 'text', text: 'world', format: 0, version: 1 },
            ],
            version: 1,
          },
          {
            type: 'heading',
            tag: 'h2',
            children: [{ type: 'text', text: 'Section', format: 0, version: 1 }],
            version: 1,
          },
          {
            type: 'list',
            listType: 'bullet',
            start: 1,
            children: [
              {
                type: 'listitem',
                value: 1,
                children: [{ type: 'text', text: 'Item 1', format: 0, version: 1 }],
                version: 1,
              },
            ],
            version: 1,
          },
          {
            type: 'code',
            language: 'python',
            children: [{ type: 'text', text: "print('hi')", format: 0, version: 1 }],
            version: 1,
          },
        ],
        type: 'root',
        version: 1,
      },
    }
    const result = await from('lexical', JSON.stringify(input as LexicalDoc))
    expect(result.text).toContain('Hello ')
    expect(result.text).toContain('world')
    expect(result.text).toContain('Section')
    expect(result.text).toContain('Item 1')
    expect(result.text).toContain("print('hi')")

    const hir = result.toHIR()
    const heading = hir.find((n) => n.type === 'block' && n.name === 'heading')
    expect(heading).toBeDefined()
    if (heading?.type === 'block') {
      expect(heading.attrs['level']).toBe(2)
    }

    const ulContainer = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainer).toBeDefined()

    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      expect(codeBlock.attrs['language']).toBe('python')
    }
  })
})
