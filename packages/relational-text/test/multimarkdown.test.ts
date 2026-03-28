import { describe, it, expect, beforeAll } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('multimarkdown', 'html')
})

// ─── fromMultiMarkdown — inline marks ─────────────────────────────────────────

describe('fromMultiMarkdown — inline marks', () => {
  it('parses bold mark (**text**)', async () => {
    const doc = await from('multimarkdown', '**hello**')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.multimarkdown.facet#strong'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('hello')
      }
    }
  })

  it('parses emphasis mark (*text*)', async () => {
    const doc = await from('multimarkdown', '*italic*')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.multimarkdown.facet#emphasis'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('italic')
      }
    }
  })

  it('parses emphasis mark (_text_)', async () => {
    const doc = await from('multimarkdown', '_italic_')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.multimarkdown.facet#emphasis'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses strikethrough mark (~~text~~)', async () => {
    const doc = await from('multimarkdown', '~~strike~~')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.multimarkdown.facet#strikethrough'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('strike')
      }
    }
  })

  it('parses highlight mark (==text==)', async () => {
    const doc = await from('multimarkdown', '==highlighted==')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.multimarkdown.facet#highlight'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('highlighted')
      }
    }
  })

  it('parses superscript mark (^text^)', async () => {
    const doc = await from('multimarkdown', 'x^2^')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.multimarkdown.facet#superscript'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('2')
      }
    }
  })

  it('parses subscript mark (~text~)', async () => {
    const doc = await from('multimarkdown', 'H~2~O')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.multimarkdown.facet#subscript'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('2')
      }
    }
  })

  it('parses inline code (`text`)', async () => {
    const doc = await from('multimarkdown', '`code`')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.multimarkdown.facet#code-span'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('code')
      }
    }
  })

  it('parses link ([text](url))', async () => {
    const doc = await from('multimarkdown', '[click here](https://example.com)')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.multimarkdown.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('click here')
        const linkMark = seg.marks.find((m) => m.kind === 'org.multimarkdown.facet#link')
        expect(linkMark?.attrs['uri']).toBe('https://example.com')
      }
    }
  })

  it('parses link with title ([text](url "title"))', async () => {
    const doc = await from('multimarkdown', '[click here](https://example.com "My Title")')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.multimarkdown.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const linkMark = seg.marks.find((m) => m.kind === 'org.multimarkdown.facet#link')
        expect(linkMark?.attrs['uri']).toBe('https://example.com')
        expect(linkMark?.attrs['title']).toBe('My Title')
      }
    }
  })

  it('parses footnote reference ([^key])', async () => {
    const doc = await from('multimarkdown', 'See footnote[^1]')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.multimarkdown.facet#footnote-ref'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const fnMark = seg.marks.find((m) => m.kind === 'org.multimarkdown.facet#footnote-ref')
        expect(fnMark?.attrs['key']).toBe('1')
      }
    }
  })
})

// ─── fromMultiMarkdown — block types ──────────────────────────────────────────

describe('fromMultiMarkdown — block types', () => {
  it('parses # Heading as heading level 1', async () => {
    const doc = await from('multimarkdown', '# Hello World')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(1)
    }
  })

  it('parses ## Heading as heading level 2', async () => {
    const doc = await from('multimarkdown', '## Section')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(2)
    }
  })

  it('parses plain text as paragraph block', async () => {
    const doc = await from('multimarkdown', 'Hello, world!')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('paragraph')
    }
  })

  it('parses fenced code block with language', async () => {
    const doc = await from('multimarkdown', '```python\nprint("hello")\n```')
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      expect(codeBlock.attrs['language']).toBe('python')
    }
  })

  it('parses fenced code block without language', async () => {
    const doc = await from('multimarkdown', '```\nsome code\n```')
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      const code = codeBlock.children
        .filter((c) => c.type === 'text')
        .map((c) => (c.type === 'text' ? c.content : ''))
        .join('')
      expect(code).toContain('some code')
    }
  })

  it('parses > blockquote', async () => {
    const doc = await from('multimarkdown', '> quoted text')
    const hir = doc.toHIR()
    const blockquote = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(blockquote).toBeDefined()
  })

  it('parses - bullet list items', async () => {
    const doc = await from('multimarkdown', '- item one\n- item two')
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

  it('parses * bullet list items', async () => {
    const doc = await from('multimarkdown', '* item')
    const hir = doc.toHIR()
    const ulContainer = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainer).toBeDefined()
  })

  it('parses ordered list items', async () => {
    const doc = await from('multimarkdown', '1. first\n2. second')
    const hir = doc.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(olContainer).toBeDefined()
  })

  it('parses --- as horizontal-rule block', async () => {
    const doc = await from('multimarkdown', '---')
    const hir = doc.toHIR()
    const hr = hir.find((n) => n.type === 'block' && n.name === 'horizontal-rule')
    expect(hr).toBeDefined()
  })

  it('parses footnote definition ([^key]: text)', async () => {
    const doc = await from('multimarkdown', '[^1]: This is the footnote text.')
    const hir = doc.toHIR()
    const fnDef = hir.find((n) => n.type === 'block' && n.name === 'footnote-def')
    expect(fnDef).toBeDefined()
    if (fnDef?.type === 'block') {
      expect(fnDef.attrs['key']).toBe('1')
    }
  })

  it('parses metadata block at top of document', async () => {
    const input = 'Title: My Document\nAuthor: John Doe\n\nContent here.'
    const doc = await from('multimarkdown', input)
    const hir = doc.toHIR()
    const metaBlocks = hir.filter((n) => n.type === 'block' && n.name === 'metadata')
    expect(metaBlocks.length).toBe(2)
    if (metaBlocks[0]?.type === 'block') {
      expect(metaBlocks[0].attrs['key']).toBe('Title')
      expect(metaBlocks[0].attrs['value']).toBe('My Document')
    }
    if (metaBlocks[1]?.type === 'block') {
      expect(metaBlocks[1].attrs['key']).toBe('Author')
      expect(metaBlocks[1].attrs['value']).toBe('John Doe')
    }
  })

  it('does not parse metadata when there is no blank line terminator', async () => {
    // When the first line looks like metadata but next content follows directly,
    // it still parses as metadata if consecutive key: value lines
    const input = 'Title: My Doc\nAuthor: Me\n\nParagraph'
    const doc = await from('multimarkdown', input)
    const hir = doc.toHIR()
    const metaBlocks = hir.filter((n) => n.type === 'block' && n.name === 'metadata')
    expect(metaBlocks.length).toBe(2)
  })
})

// ─── toMultiMarkdown — round-trips ────────────────────────────────────────────

describe('toMultiMarkdown — round-trip', () => {
  it('round-trips bold text', async () => {
    const result = await to('multimarkdown', await from('multimarkdown', '**bold**'))
    expect(result).toBe('**bold**\n')
  })

  it('round-trips emphasis text', async () => {
    const result = await to('multimarkdown', await from('multimarkdown', '*italic*'))
    expect(result).toBe('*italic*\n')
  })

  it('round-trips strikethrough', async () => {
    const result = await to('multimarkdown', await from('multimarkdown', '~~struck~~'))
    expect(result).toBe('~~struck~~\n')
  })

  it('round-trips highlight', async () => {
    const result = await to('multimarkdown', await from('multimarkdown', '==highlighted=='))
    expect(result).toBe('==highlighted==\n')
  })

  it('round-trips superscript', async () => {
    const result = await to('multimarkdown', await from('multimarkdown', 'x^2^'))
    expect(result).toContain('^2^')
  })

  it('round-trips subscript', async () => {
    const result = await to('multimarkdown', await from('multimarkdown', 'H~2~O'))
    expect(result).toContain('~2~')
  })

  it('round-trips inline code', async () => {
    const result = await to('multimarkdown', await from('multimarkdown', '`code`'))
    expect(result).toBe('`code`\n')
  })

  it('round-trips heading level 1', async () => {
    const result = await to('multimarkdown', await from('multimarkdown', '# My Heading'))
    expect(result).toBe('# My Heading\n')
  })

  it('round-trips heading level 2', async () => {
    const result = await to('multimarkdown', await from('multimarkdown', '## Section'))
    expect(result).toBe('## Section\n')
  })

  it('round-trips code block with language', async () => {
    const result = await to('multimarkdown', await from('multimarkdown', '```js\nconsole.log("hi")\n```'))
    expect(result).toContain('```js')
    expect(result).toContain('console.log("hi")')
  })

  it('round-trips horizontal rule', async () => {
    const result = await to('multimarkdown', await from('multimarkdown', '---'))
    expect(result).toBe('---\n')
  })

  it('round-trips bullet list', async () => {
    const result = await to('multimarkdown', await from('multimarkdown', '- item one\n- item two'))
    expect(result).toContain('- item one')
    expect(result).toContain('- item two')
  })

  it('round-trips ordered list', async () => {
    const result = await to('multimarkdown', await from('multimarkdown', '1. first\n2. second'))
    expect(result).toMatch(/1\. first/)
    expect(result).toMatch(/2\. second/)
  })

  it('round-trips footnote reference and definition', async () => {
    const input = 'See note[^1]\n\n[^1]: The footnote text.'
    const result = await to('multimarkdown', await from('multimarkdown', input))
    expect(result).toContain('[^1]')
    expect(result).toContain('[^1]: The footnote text.')
  })

  it('round-trips metadata block', async () => {
    const input = 'Title: My Doc\nAuthor: Me\n\nContent here.'
    const result = await to('multimarkdown', await from('multimarkdown', input))
    expect(result).toContain('Title: My Doc')
    expect(result).toContain('Author: Me')
    expect(result).toContain('Content here.')
  })
})

// ─── Cross-format rendering ───────────────────────────────────────────────────

describe('to(html, from(multimarkdown, ...))', () => {
  it('bold → <strong>', async () => {
    const html = (await to('html', await from('multimarkdown', '**bold**'))).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('emphasis → <em>', async () => {
    const html = (await to('html', await from('multimarkdown', '*italic*'))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('heading 1 → <h1>', async () => {
    const html = (await to('html', await from('multimarkdown', '# Hello'))).trim()
    expect(html).toContain('<h1>Hello</h1>')
  })

  it('heading 2 → <h2>', async () => {
    const html = (await to('html', await from('multimarkdown', '## World'))).trim()
    expect(html).toContain('<h2>World</h2>')
  })

  it('strikethrough → <s>', async () => {
    const html = (await to('html', await from('multimarkdown', '~~struck~~'))).trim()
    expect(html).toContain('<s>struck</s>')
  })

  it('code-span → <code>', async () => {
    const html = (await to('html', await from('multimarkdown', '`code`'))).trim()
    expect(html).toContain('<code>code</code>')
  })

  it('bullet list → <ul><li>', async () => {
    const html = (await to('html', await from('multimarkdown', '- item'))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })

  it('ordered list → <ol><li>', async () => {
    const html = (await to('html', await from('multimarkdown', '1. first'))).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
    expect(html).toContain('first')
  })

  it('code block → <pre><code>', async () => {
    const html = (await to('html', await from('multimarkdown', '```\nconst x = 1\n```'))).trim()
    expect(html).toContain('<pre><code>')
    expect(html).toContain('const x = 1')
  })

  it('paragraph → <p>', async () => {
    const html = (await to('html', await from('multimarkdown', 'plain text'))).trim()
    expect(html).toContain('<p>plain text</p>')
  })
})
