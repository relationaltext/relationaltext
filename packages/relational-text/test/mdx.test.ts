import { describe, it, expect, beforeAll } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('mdx', 'html')
})

// ─── fromMDX — frontmatter ────────────────────────────────────────────────────

describe('fromMDX — frontmatter', () => {
  it('parses YAML frontmatter as frontmatter blocks', async () => {
    const doc = await from('mdx', '---\ntitle: My Doc\nauthor: Alice\n---\n\nHello')
    const hir = doc.toHIR()
    const fmBlocks = hir.filter((n) => n.type === 'block' && n.name === 'frontmatter')
    expect(fmBlocks.length).toBe(2)
  })

  it('frontmatter block has key and value attrs', async () => {
    const doc = await from('mdx', '---\ntitle: My Doc\n---\n\nHello')
    const hir = doc.toHIR()
    const titleBlock = hir.find(
      (n) => n.type === 'block' && n.name === 'frontmatter' && n.attrs['key'] === 'title',
    )
    expect(titleBlock).toBeDefined()
    if (titleBlock?.type === 'block') {
      expect(titleBlock.attrs['value']).toBe('My Doc')
    }
  })

  it('document without frontmatter has no frontmatter blocks', async () => {
    const doc = await from('mdx', 'Hello world')
    const hir = doc.toHIR()
    const fmBlocks = hir.filter((n) => n.type === 'block' && n.name === 'frontmatter')
    expect(fmBlocks.length).toBe(0)
  })
})

// ─── fromMDX — import statements ─────────────────────────────────────────────

describe('fromMDX — import statements', () => {
  it('parses import statement as import-stmt block', async () => {
    const doc = await from('mdx', "import Foo from './foo'\n\nHello")
    const hir = doc.toHIR()
    const importBlock = hir.find((n) => n.type === 'block' && n.name === 'import-stmt')
    expect(importBlock).toBeDefined()
    if (importBlock?.type === 'block') {
      expect(importBlock.attrs['code']).toContain('import Foo')
    }
  })
})

// ─── fromMDX — JSX blocks ─────────────────────────────────────────────────────

describe('fromMDX — JSX blocks', () => {
  it('parses self-closing JSX block <Foo />', async () => {
    const doc = await from('mdx', '<Alert />\n')
    const hir = doc.toHIR()
    const jsxBlock = hir.find((n) => n.type === 'block' && n.name === 'jsx-block')
    expect(jsxBlock).toBeDefined()
    if (jsxBlock?.type === 'block') {
      expect(jsxBlock.attrs['tag']).toBe('Alert')
      expect(jsxBlock.attrs['selfClosing']).toBe(true)
    }
  })

  it('parses self-closing JSX block with props <Badge text="new" />', async () => {
    const doc = await from('mdx', '<Badge text="new" />\n')
    const hir = doc.toHIR()
    const jsxBlock = hir.find((n) => n.type === 'block' && n.name === 'jsx-block')
    expect(jsxBlock).toBeDefined()
    if (jsxBlock?.type === 'block') {
      expect(jsxBlock.attrs['tag']).toBe('Badge')
      const props = jsxBlock.attrs['props'] as Record<string, unknown> | undefined
      expect(props?.['text']).toBe('new')
    }
  })

  it('parses JSX block with content <Callout>text</Callout>', async () => {
    const doc = await from('mdx', '<Callout>\nsome content\n</Callout>\n')
    const hir = doc.toHIR()
    const jsxBlock = hir.find((n) => n.type === 'block' && n.name === 'jsx-block')
    expect(jsxBlock).toBeDefined()
    if (jsxBlock?.type === 'block') {
      expect(jsxBlock.attrs['tag']).toBe('Callout')
      expect(jsxBlock.attrs['selfClosing']).toBe(false)
    }
  })
})

// ─── fromMDX — inline JSX ─────────────────────────────────────────────────────

describe('fromMDX — inline JSX', () => {
  it('parses inline JSX <Badge /> as jsx-inline entity', async () => {
    const doc = await from('mdx', 'This is <Badge /> inline')
    const hir = doc.toHIR()
    // Find a block and look for a text node with jsx-inline mark
    let found = false
    for (const node of hir) {
      if (node.type === 'block') {
        for (const child of node.children) {
          if (child.type === 'text' && child.marks.some((m) => m.kind === 'dev.mdxjs.facet#jsx-inline')) {
            found = true
            const mark = child.marks.find((m) => m.kind === 'dev.mdxjs.facet#jsx-inline')
            expect(mark?.attrs['tag']).toBe('Badge')
          }
        }
      }
    }
    expect(found).toBe(true)
  })

  it('parses inline JSX with props <Icon name="star" />', async () => {
    const doc = await from('mdx', 'Click <Icon name="star" /> here')
    const hir = doc.toHIR()
    let found = false
    for (const node of hir) {
      if (node.type === 'block') {
        for (const child of node.children) {
          if (child.type === 'text' && child.marks.some((m) => m.kind === 'dev.mdxjs.facet#jsx-inline')) {
            found = true
            const mark = child.marks.find((m) => m.kind === 'dev.mdxjs.facet#jsx-inline')
            const props = mark?.attrs['props'] as Record<string, unknown> | undefined
            expect(props?.['name']).toBe('star')
          }
        }
      }
    }
    expect(found).toBe(true)
  })
})

// ─── fromMDX — expression inline ─────────────────────────────────────────────

describe('fromMDX — expression inline', () => {
  it('parses {expr} as expression entity', async () => {
    const doc = await from('mdx', 'Value is {count + 1}')
    const hir = doc.toHIR()
    let found = false
    for (const node of hir) {
      if (node.type === 'block') {
        for (const child of node.children) {
          if (child.type === 'text' && child.marks.some((m) => m.kind === 'dev.mdxjs.facet#expression')) {
            found = true
            const mark = child.marks.find((m) => m.kind === 'dev.mdxjs.facet#expression')
            expect(mark?.attrs['code']).toBe('count + 1')
          }
        }
      }
    }
    expect(found).toBe(true)
  })
})

// ─── fromMDX — standard block types ──────────────────────────────────────────

describe('fromMDX — standard block types', () => {
  it('parses # Heading as heading level 1', async () => {
    const doc = await from('mdx', '# Hello World')
    const hir = doc.toHIR()
    const heading = hir.find((n) => n.type === 'block' && n.name === 'heading')
    expect(heading).toBeDefined()
    if (heading?.type === 'block') {
      expect(heading.attrs['level']).toBe(1)
    }
  })

  it('parses ## Heading as heading level 2', async () => {
    const doc = await from('mdx', '## Section')
    const hir = doc.toHIR()
    const heading = hir.find((n) => n.type === 'block' && n.name === 'heading')
    expect(heading).toBeDefined()
    if (heading?.type === 'block') {
      expect(heading.attrs['level']).toBe(2)
    }
  })

  it('parses plain text as paragraph block', async () => {
    const doc = await from('mdx', 'Hello, world!')
    const hir = doc.toHIR()
    const para = hir.find((n) => n.type === 'block' && n.name === 'paragraph')
    expect(para).toBeDefined()
  })

  it('parses code fence as code-block', async () => {
    const doc = await from('mdx', '```js\nconsole.log("hi")\n```')
    const hir = doc.toHIR()
    const cb = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(cb).toBeDefined()
    if (cb?.type === 'block') {
      expect(cb.attrs['language']).toBe('js')
      const code = cb.children
        .filter((c) => c.type === 'text')
        .map((c) => (c.type === 'text' ? c.content : ''))
        .join('')
      expect(code).toContain('console.log("hi")')
    }
  })

  it('parses > blockquote', async () => {
    const doc = await from('mdx', '> quoted text')
    const hir = doc.toHIR()
    const bq = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(bq).toBeDefined()
  })

  it('parses bullet list', async () => {
    const doc = await from('mdx', '- item one\n- item two')
    const hir = doc.toHIR()
    const ul = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ul).toBeDefined()
  })

  it('parses ordered list', async () => {
    const doc = await from('mdx', '1. first\n2. second')
    const hir = doc.toHIR()
    const ol = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(ol).toBeDefined()
  })

  it('parses --- as horizontal-rule', async () => {
    const doc = await from('mdx', 'some text\n\n---\n\nmore text')
    const hir = doc.toHIR()
    const hr = hir.find((n) => n.type === 'block' && n.name === 'horizontal-rule')
    expect(hr).toBeDefined()
  })
})

// ─── fromMDX — inline marks ───────────────────────────────────────────────────

describe('fromMDX — inline marks', () => {
  it('parses **bold** as strong mark', async () => {
    const doc = await from('mdx', '**bold text**')
    const hir = doc.toHIR()
    let found = false
    for (const node of hir) {
      if (node.type === 'block') {
        for (const child of node.children) {
          if (child.type === 'text' && child.marks.some((m) => m.kind === 'dev.mdxjs.facet#strong')) {
            found = true
            expect(child.content).toBe('bold text')
          }
        }
      }
    }
    expect(found).toBe(true)
  })

  it('parses *italic* as emphasis mark', async () => {
    const doc = await from('mdx', '*italic text*')
    const hir = doc.toHIR()
    let found = false
    for (const node of hir) {
      if (node.type === 'block') {
        for (const child of node.children) {
          if (child.type === 'text' && child.marks.some((m) => m.kind === 'dev.mdxjs.facet#emphasis')) {
            found = true
            expect(child.content).toBe('italic text')
          }
        }
      }
    }
    expect(found).toBe(true)
  })

  it('parses `code` as code-span mark', async () => {
    const doc = await from('mdx', '`inline code`')
    const hir = doc.toHIR()
    let found = false
    for (const node of hir) {
      if (node.type === 'block') {
        for (const child of node.children) {
          if (child.type === 'text' && child.marks.some((m) => m.kind === 'dev.mdxjs.facet#code-span')) {
            found = true
            expect(child.content).toBe('inline code')
          }
        }
      }
    }
    expect(found).toBe(true)
  })
})

// ─── toMDX — round-trips ─────────────────────────────────────────────────────

describe('toMDX — round-trips', () => {
  it('round-trips a heading', async () => {
    const result = await to('mdx', await from('mdx', '# My Title'))
    expect(result).toContain('# My Title')
  })

  it('round-trips a paragraph', async () => {
    const result = await to('mdx', await from('mdx', 'Hello, world!'))
    expect(result).toContain('Hello, world!')
  })

  it('round-trips bold text', async () => {
    const result = await to('mdx', await from('mdx', '**bold**'))
    expect(result).toContain('**bold**')
  })

  it('round-trips italic text', async () => {
    const result = await to('mdx', await from('mdx', '*italic*'))
    expect(result).toContain('*italic*')
  })

  it('round-trips inline code', async () => {
    const result = await to('mdx', await from('mdx', '`code`'))
    expect(result).toContain('`code`')
  })

  it('round-trips a code block', async () => {
    const result = await to('mdx', await from('mdx', '```python\nprint("hello")\n```'))
    expect(result).toContain('```python')
    expect(result).toContain('print("hello")')
  })

  it('round-trips frontmatter', async () => {
    const result = await to('mdx', await from('mdx', '---\ntitle: My Doc\n---\n\nHello'))
    expect(result).toContain('---')
    expect(result).toContain('title: My Doc')
  })

  it('round-trips import statement', async () => {
    const result = await to('mdx', await from('mdx', "import Foo from './foo'\n\nHello"))
    expect(result).toContain("import Foo from './foo'")
  })

  it('round-trips self-closing JSX block', async () => {
    const result = await to('mdx', await from('mdx', '<Alert />\n'))
    expect(result).toContain('<Alert')
    expect(result).toContain('/>')
  })

  it('round-trips bullet list', async () => {
    const result = await to('mdx', await from('mdx', '- item one\n- item two'))
    expect(result).toContain('- item one')
    expect(result).toContain('- item two')
  })

  it('round-trips ordered list', async () => {
    const result = await to('mdx', await from('mdx', '1. first\n2. second'))
    expect(result).toMatch(/1\.\s+first/)
    expect(result).toMatch(/2\.\s+second/)
  })

  it('round-trips horizontal rule', async () => {
    const result = await to('mdx', await from('mdx', 'text\n\n---\n\nmore'))
    expect(result).toContain('---')
  })
})

// ─── Cross-format: await to('html', await from('mdx', …)) ────────────────────────────────────────

describe('to(html, from(mdx, ...))', () => {
  it('strong → <strong>', async () => {
    const html = (await to('html', await from('mdx', '**bold**'))).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('emphasis → <em>', async () => {
    const html = (await to('html', await from('mdx', '*italic*'))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('heading 1 → <h1>', async () => {
    const html = (await to('html', await from('mdx', '# Hello'))).trim()
    expect(html).toContain('<h1>Hello</h1>')
  })

  it('heading 2 → <h2>', async () => {
    const html = (await to('html', await from('mdx', '## World'))).trim()
    expect(html).toContain('<h2>World</h2>')
  })

  it('code span → <code>', async () => {
    const html = (await to('html', await from('mdx', '`code`'))).trim()
    expect(html).toContain('<code>code</code>')
  })

  it('paragraph → <p>', async () => {
    const html = (await to('html', await from('mdx', 'plain text'))).trim()
    expect(html).toContain('<p>plain text</p>')
  })

  it('code block → <pre><code>', async () => {
    const html = (await to('html', await from('mdx', '```\nconst x = 1\n```'))).trim()
    expect(html).toContain('<pre><code>')
    expect(html).toContain('const x = 1')
  })

  it('bullet list → <ul><li>', async () => {
    const html = (await to('html', await from('mdx', '- item'))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })

  it('ordered list → <ol><li>', async () => {
    const html = (await to('html', await from('mdx', '1. first'))).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
    expect(html).toContain('first')
  })
})
