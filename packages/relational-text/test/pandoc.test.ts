import { describe, it, expect, beforeAll } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('pandoc', 'html')
})

// ─── YAML front matter ────────────────────────────────────────────────────────

describe('fromPandoc — YAML front matter', () => {
  it('parses title from YAML front matter', async () => {
    const doc = await from('pandoc', '---\ntitle: My Document\n---\n\nHello')
    const hir = doc.toHIR()
    const metaBlock = hir.find((n) => n.type === 'block' && n.name === 'Meta')
    expect(metaBlock).toBeDefined()
    if (metaBlock?.type === 'block') {
      expect(metaBlock.attrs['key']).toBe('title')
      expect(metaBlock.attrs['value']).toBe('My Document')
    }
  })

  it('parses multiple metadata fields', async () => {
    const doc = await from('pandoc', '---\ntitle: Hello\nauthor: Alice\ndate: 2024-01-01\n---\n\nContent')
    const hir = doc.toHIR()
    const metaBlocks = hir.filter((n) => n.type === 'block' && n.name === 'Meta')
    expect(metaBlocks.length).toBe(3)
    const keys = metaBlocks.map((b) => b.type === 'block' ? b.attrs['key'] : null)
    expect(keys).toContain('title')
    expect(keys).toContain('author')
    expect(keys).toContain('date')
  })

  it('content after front matter is parsed correctly', async () => {
    const doc = await from('pandoc', '---\ntitle: Test\n---\n\nHello world')
    const hir = doc.toHIR()
    const paraBlock = hir.find((n) => n.type === 'block' && n.name === 'Para')
    expect(paraBlock).toBeDefined()
    if (paraBlock?.type === 'block') {
      const textNode = paraBlock.children.find((c) => c.type === 'text')
      if (textNode?.type === 'text') {
        expect(textNode.content).toBe('Hello world')
      }
    }
  })

  it('toPandoc emits YAML front matter for metadata blocks', async () => {
    const doc = await from('pandoc', '---\ntitle: My Doc\nauthor: Bob\n---\n\nParagraph')
    const output = await to('pandoc', doc)
    expect(output).toContain('---')
    expect(output).toContain('title: My Doc')
    expect(output).toContain('author: Bob')
    expect(output).toContain('Paragraph')
  })
})

// ─── Fenced divs ─────────────────────────────────────────────────────────────

describe('fromPandoc — fenced divs', () => {
  it('parses ::: div block', async () => {
    const doc = await from('pandoc', '::: note\nSome content\n:::')
    const hir = doc.toHIR()
    const divBlock = hir.find((n) => n.type === 'block' && n.name === 'Div')
    expect(divBlock).toBeDefined()
    if (divBlock?.type === 'block') {
      expect(divBlock.attrs['class']).toBe('note')
    }
  })

  it('parses plain ::: div block without class', async () => {
    const doc = await from('pandoc', ':::\nContent\n:::')
    const hir = doc.toHIR()
    const divBlock = hir.find((n) => n.type === 'block' && n.name === 'Div')
    expect(divBlock).toBeDefined()
  })

  it('toPandoc renders div with class', async () => {
    const doc = await from('pandoc', '::: warning\nDanger!\n:::')
    const output = await to('pandoc', doc)
    expect(output).toContain('::: warning')
    expect(output).toContain(':::')
    expect(output).toContain('Danger!')
  })
})

// ─── Inline marks ─────────────────────────────────────────────────────────────

describe('fromPandoc — superscript', () => {
  it('parses ^sup^ as superscript', async () => {
    const doc = await from('pandoc', 'H^2^O')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.pandoc.facet#Superscript'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('2')
      }
    }
  })

  it('round-trips superscript', async () => {
    const result = await to('pandoc', await from('pandoc', 'H^2^O'))
    expect(result).toContain('^2^')
  })
})

describe('fromPandoc — subscript', () => {
  it('parses ~sub~ as subscript', async () => {
    const doc = await from('pandoc', 'H~2~O')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.pandoc.facet#Subscript'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('2')
      }
    }
  })

  it('round-trips subscript', async () => {
    const result = await to('pandoc', await from('pandoc', 'H~2~O'))
    expect(result).toContain('~2~')
  })
})

describe('fromPandoc — strikethrough', () => {
  it('parses ~~strike~~ as strikethrough', async () => {
    const doc = await from('pandoc', '~~struck~~')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.pandoc.facet#Strikeout'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('round-trips strikethrough', async () => {
    const result = await to('pandoc', await from('pandoc', '~~strike~~'))
    expect(result).toContain('~~strike~~')
  })
})

describe('fromPandoc — strong and emphasis', () => {
  it('parses **bold** as strong', async () => {
    const doc = await from('pandoc', '**bold**')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.pandoc.facet#Strong'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses *em* as emphasis', async () => {
    const doc = await from('pandoc', '*italic*')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.pandoc.facet#Emph'),
      )
      expect(seg).toBeDefined()
    }
  })
})

// ─── Footnotes ────────────────────────────────────────────────────────────────

describe('fromPandoc — footnotes', () => {
  it('parses [^1] as footnote-ref', async () => {
    const doc = await from('pandoc', 'See note[^1].')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.pandoc.facet#Note'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const fnMark = seg.marks.find((m) => m.kind === 'org.pandoc.facet#Note')
        expect(fnMark?.attrs['key']).toBe('1')
      }
    }
  })

  it('parses [^note]: text as footnote-def block', async () => {
    const doc = await from('pandoc', '[^note]: This is the footnote text.')
    const hir = doc.toHIR()
    const fnDef = hir.find((n) => n.type === 'block' && n.name === 'footnote-def')
    expect(fnDef).toBeDefined()
    if (fnDef?.type === 'block') {
      expect(fnDef.attrs['key']).toBe('note')
    }
  })

  it('round-trips footnote ref', async () => {
    const result = await to('pandoc', await from('pandoc', 'Text[^1].'))
    expect(result).toContain('[^1]')
  })

  it('round-trips footnote def', async () => {
    const result = await to('pandoc', await from('pandoc', '[^1]: Definition text.'))
    expect(result).toContain('[^1]:')
    expect(result).toContain('Definition text.')
  })
})

// ─── Bracketed spans ──────────────────────────────────────────────────────────

describe('fromPandoc — bracketed spans', () => {
  it('parses [text]{.class} as span with class', async () => {
    const doc = await from('pandoc', '[highlighted]{.highlight}')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.pandoc.facet#Span'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const spanMark = seg.marks.find((m) => m.kind === 'org.pandoc.facet#Span')
        expect(spanMark?.attrs['class']).toBe('highlight')
      }
    }
  })

  it('round-trips bracketed span with class', async () => {
    const result = await to('pandoc', await from('pandoc', '[text]{.myclass}'))
    expect(result).toContain('[text]{.myclass}')
  })
})

// ─── Headings with id ─────────────────────────────────────────────────────────

describe('fromPandoc — heading with id', () => {
  it('parses heading with {#id} suffix', async () => {
    const doc = await from('pandoc', '# My Section {#intro}')
    const hir = doc.toHIR()
    const headingBlock = hir.find((n) => n.type === 'block' && n.name === 'Header')
    expect(headingBlock).toBeDefined()
    if (headingBlock?.type === 'block') {
      expect(headingBlock.attrs['level']).toBe(1)
      expect(headingBlock.attrs['id']).toBe('intro')
    }
  })

  it('round-trips heading with id', async () => {
    const result = await to('pandoc', await from('pandoc', '# Section {#my-section}'))
    expect(result).toContain('# Section {#my-section}')
  })

  it('parses heading without id normally', async () => {
    const doc = await from('pandoc', '## Plain Heading')
    const hir = doc.toHIR()
    const headingBlock = hir.find((n) => n.type === 'block' && n.name === 'Header')
    expect(headingBlock).toBeDefined()
    if (headingBlock?.type === 'block') {
      expect(headingBlock.attrs['level']).toBe(2)
      expect(headingBlock.attrs['id']).toBeUndefined()
    }
  })
})

// ─── Block types ─────────────────────────────────────────────────────────────

describe('fromPandoc — block types', () => {
  it('parses plain text as paragraph', async () => {
    const doc = await from('pandoc', 'Hello, world!')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('Para')
    }
  })

  it('parses code block with language', async () => {
    const doc = await from('pandoc', '```python\nprint("hi")\n```')
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'CodeBlock')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      expect(codeBlock.attrs['language']).toBe('python')
    }
  })

  it('parses > blockquote', async () => {
    const doc = await from('pandoc', '> Quoted text')
    const hir = doc.toHIR()
    const blockquote = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(blockquote).toBeDefined()
  })

  it('parses - bullet list items', async () => {
    const doc = await from('pandoc', '- item one\n- item two')
    const hir = doc.toHIR()
    const ulContainer = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainer).toBeDefined()
  })

  it('parses 1. ordered list items', async () => {
    const doc = await from('pandoc', '1. first\n2. second')
    const hir = doc.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(olContainer).toBeDefined()
  })

  it('parses --- as horizontal rule', async () => {
    const doc = await from('pandoc', '---')
    const hir = doc.toHIR()
    // Note: --- by itself is also a YAML delimiter, but without leading ---, it's an HR
    // The parser sees it as horizontal-rule since there's no YAML block started
    const hr = hir.find((n) => n.type === 'block' && n.name === 'HorizontalRule')
    expect(hr).toBeDefined()
  })
})

// ─── Round-trips ──────────────────────────────────────────────────────────────

describe('toPandoc — round-trips', () => {
  it('round-trips bold text', async () => {
    const result = await to('pandoc', await from('pandoc', '**bold**'))
    expect(result).toContain('**bold**')
  })

  it('round-trips italic text', async () => {
    const result = await to('pandoc', await from('pandoc', '*italic*'))
    expect(result).toContain('*italic*')
  })

  it('round-trips heading level 1', async () => {
    const result = await to('pandoc', await from('pandoc', '# My Heading'))
    expect(result).toContain('# My Heading')
  })

  it('round-trips code block', async () => {
    const result = await to('pandoc', await from('pandoc', '```js\nconsole.log("hi")\n```'))
    expect(result).toContain('```js')
    expect(result).toContain('console.log("hi")')
    expect(result).toContain('```')
  })

  it('round-trips bullet list', async () => {
    const result = await to('pandoc', await from('pandoc', '- item one\n- item two'))
    expect(result).toContain('- item one')
    expect(result).toContain('- item two')
  })

  it('round-trips ordered list', async () => {
    const result = await to('pandoc', await from('pandoc', '1. first\n2. second'))
    expect(result).toMatch(/1\. first/)
    expect(result).toMatch(/2\. second/)
  })

  it('round-trips link', async () => {
    const result = await to('pandoc', await from('pandoc', '[click here](https://example.com)'))
    expect(result).toContain('[click here](https://example.com)')
  })
})

// ─── Cross-format rendering ───────────────────────────────────────────────────

describe('to(html, from(pandoc, ...))', () => {
  it('bold → <strong>', async () => {
    const html = (await to('html', await from('pandoc', '**bold**'))).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('italic → <em>', async () => {
    const html = (await to('html', await from('pandoc', '*italic*'))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('heading 1 → <h1>', async () => {
    const html = (await to('html', await from('pandoc', '# Hello'))).trim()
    expect(html).toContain('<h1>Hello</h1>')
  })

  it('heading 2 → <h2>', async () => {
    const html = (await to('html', await from('pandoc', '## World'))).trim()
    expect(html).toContain('<h2>World</h2>')
  })

  it('code → <code>', async () => {
    const html = (await to('html', await from('pandoc', '`code`'))).trim()
    expect(html).toContain('<code>code</code>')
  })

  it('strikethrough → <s>', async () => {
    const html = (await to('html', await from('pandoc', '~~struck~~'))).trim()
    expect(html).toContain('<s>struck</s>')
  })

  it('paragraph → <p>', async () => {
    const html = (await to('html', await from('pandoc', 'plain text'))).trim()
    expect(html).toContain('<p>plain text</p>')
  })

  it('bullet list → <ul><li>', async () => {
    const html = (await to('html', await from('pandoc', '- item'))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })

  it('code block → <pre><code>', async () => {
    const html = (await to('html', await from('pandoc', '```\nconst x = 1\n```'))).trim()
    expect(html).toContain('<pre><code>')
    expect(html).toContain('const x = 1')
  })
})
