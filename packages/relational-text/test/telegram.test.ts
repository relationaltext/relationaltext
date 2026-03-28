import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('telegram', 'html')
})

// ─── fromTelegram — inline marks ──────────────────────────────────────────────

describe('fromTelegram — inline marks', () => {
  it('parses *bold*', async () => {
    const doc = await from('telegram', '*bold*')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.telegram.facet#bold'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses _italic_', async () => {
    const doc = await from('telegram', '_italic_')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.telegram.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses __underline__', async () => {
    const doc = await from('telegram', '__underline__')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.telegram.facet#underline'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses ~strike~', async () => {
    const doc = await from('telegram', '~strike~')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.telegram.facet#strikethrough'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses ||spoiler||', async () => {
    const doc = await from('telegram', '||spoiler||')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.telegram.facet#spoiler'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses `code`', async () => {
    const doc = await from('telegram', '`code`')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.telegram.facet#code'),
      )
      expect(seg).toBeDefined()
    }
  })
})

// ─── fromTelegram — block types ───────────────────────────────────────────────

describe('fromTelegram — block types', () => {
  it('parses code block with language', async () => {
    const input = '```python\nprint("hello")\n```'
    const doc = await from('telegram', input)
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      expect(codeBlock.attrs['language']).toBe('python')
      const text = codeBlock.children
        .filter((c) => c.type === 'text')
        .map((c) => (c.type === 'text' ? c.content : ''))
        .join('')
      expect(text).toContain('print("hello")')
    }
  })

  it('parses > quote as blockquote structure', async () => {
    const doc = await from('telegram', '> this is a quote')
    const hir = doc.toHIR()
    const blockquote = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(blockquote).toBeDefined()
  })

  it('parses - item as bullet list', async () => {
    const doc = await from('telegram', '- item')
    const hir = doc.toHIR()
    const ul = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ul).toBeDefined()
    if (ul?.type === 'container') {
      const hasListItemText = (nodes: typeof ul.children): boolean =>
        nodes.some(
          (n) =>
            (n.type === 'block' && n.name === 'list-item-text') ||
            (n.type === 'container' && hasListItemText(n.children)),
        )
      expect(hasListItemText(ul.children)).toBe(true)
    }
  })

  it('parses 1. item as ordered list', async () => {
    const doc = await from('telegram', '1. first item')
    const hir = doc.toHIR()
    const ol = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(ol).toBeDefined()
  })

  it('parses [text](url) as link entity with href attr', async () => {
    const doc = await from('telegram', '[click here](https://example.com)')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.telegram.facet#text_link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'org.telegram.facet#text_link')
        expect(mark?.attrs['href']).toBe('https://example.com')
      }
    }
  })

  it('parses escaped chars as literal text (no mark)', async () => {
    const doc = await from('telegram', 'hello\\_world')
    const hir = doc.toHIR()
    // Should be a paragraph with text containing "hello_world" (no italic mark)
    expect(doc.text).toContain('hello')
    expect(doc.text).toContain('_world')
    if (hir[0]!.type === 'block') {
      const hasItalic = hir[0]!.children.some(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.telegram.facet#italic'),
      )
      expect(hasItalic).toBe(false)
    }
  })
})

// ─── toTelegram — round-trip ──────────────────────────────────────────────────

describe('toTelegram — round-trip', () => {
  it('*bold* round-trips', async () => {
    const doc = await from('telegram', '*bold*')
    const output = await to('telegram', doc)
    expect(output).toContain('*bold*')
  })

  it('code block round-trips', async () => {
    const input = '```js\nconsole.log("hi")\n```'
    const doc = await from('telegram', input)
    const output = await to('telegram', doc)
    expect(output).toContain('```js')
    expect(output).toContain('console.log("hi")')
    expect(output).toContain('```')
  })

  it('link round-trips', async () => {
    const doc = await from('telegram', '[click](https://example.com)')
    const output = await to('telegram', doc)
    expect(output).toContain('[click](https://example.com)')
  })

  it('bullet list round-trips', async () => {
    const input = '- item one\n- item two'
    const doc = await from('telegram', input)
    const output = await to('telegram', doc)
    expect(output).toContain('- item one')
    expect(output).toContain('- item two')
  })

  it('ordered list round-trips', async () => {
    const input = '1. first\n2. second'
    const doc = await from('telegram', input)
    const output = await to('telegram', doc)
    expect(output).toContain('1. first')
    expect(output).toContain('2. second')
  })
})

// ─── Cross-format via lens ────────────────────────────────────────────────────

describe('fromTelegram → toHTML (cross-format via lens)', () => {
  it('bold → <strong>', async () => {
    const doc = await from('telegram', '*bold*')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('italic → <em>', async () => {
    const doc = await from('telegram', '_italic_')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('italic + bold combination both rendered', async () => {
    const doc = await from('telegram', '*bold* and _italic_')
    const html = (await to('html', doc)).trim()
    // Both marks should be rendered in the same paragraph
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
  })

  it('link → <a href>', async () => {
    const doc = await from('telegram', '[my link](https://example.com)')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<a href="https://example.com">my link</a>')
  })

  it('strike → <s>', async () => {
    const doc = await from('telegram', '~strikethrough~')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<s>strikethrough</s>')
  })

  it('code → <code>', async () => {
    const doc = await from('telegram', '`mycode`')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<code>mycode</code>')
  })

  it('paragraph → <p>', async () => {
    const doc = await from('telegram', 'hello world')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<p>hello world</p>')
  })

  it('code-block → <pre><code>', async () => {
    const input = '```\nlet x = 1;\n```'
    const doc = await from('telegram', input)
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<pre><code>')
    expect(html).toContain('let x = 1;')
  })

  it('bullet list → <ul><li>', async () => {
    const doc = await from('telegram', '- item')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })

  it('ordered list → <ol><li>', async () => {
    const doc = await from('telegram', '1. first')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
    expect(html).toContain('first')
  })

  it('blockquote → <blockquote>', async () => {
    const doc = await from('telegram', '> quoted text')
    const html = (await to('html', doc)).trim()
    expect(html).toContain('<blockquote>')
    expect(html).toContain('quoted text')
  })
})
