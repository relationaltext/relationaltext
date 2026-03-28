import { describe, it, expect, beforeAll } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('markdoc', 'html')
})

// ─── fromMarkdoc — frontmatter ────────────────────────────────────────────────

describe('fromMarkdoc — frontmatter', () => {
  it('parses YAML frontmatter into frontmatter blocks', async () => {
    const input = '---\ntitle: My Doc\nauthor: Alice\n---\nHello world'
    const doc = await from('markdoc', input)
    const hir = doc.toHIR()
    const frontmatterBlocks = hir.filter((n) => n.type === 'block' && n.name === 'frontmatter')
    expect(frontmatterBlocks.length).toBeGreaterThanOrEqual(2)
    if (frontmatterBlocks[0]?.type === 'block') {
      expect(frontmatterBlocks[0].attrs['key']).toBe('title')
      expect(frontmatterBlocks[0].attrs['value']).toBe('My Doc')
    }
    if (frontmatterBlocks[1]?.type === 'block') {
      expect(frontmatterBlocks[1].attrs['key']).toBe('author')
      expect(frontmatterBlocks[1].attrs['value']).toBe('Alice')
    }
  })

  it('ignores missing frontmatter and treats content as body', async () => {
    const doc = await from('markdoc', 'Hello world')
    const hir = doc.toHIR()
    const frontmatterBlocks = hir.filter((n) => n.type === 'block' && n.name === 'frontmatter')
    expect(frontmatterBlocks.length).toBe(0)
  })

  it('emits frontmatter at top in toMarkdoc', async () => {
    const input = '---\ntitle: My Doc\n---\nBody text'
    const result = await to('markdoc', await from('markdoc', input))
    expect(result).toContain('---')
    expect(result).toContain('title: My Doc')
  })
})

// ─── fromMarkdoc — block tags ─────────────────────────────────────────────────

describe('fromMarkdoc — block tags', () => {
  it('parses block tag with content', async () => {
    const input = '{% callout %}\nThis is a callout\n{% /callout %}'
    const doc = await from('markdoc', input)
    const hir = doc.toHIR()
    const tagBlock = hir.find((n) => n.type === 'block' && n.name === 'tag')
    expect(tagBlock).toBeDefined()
    if (tagBlock?.type === 'block') {
      expect(tagBlock.attrs['name']).toBe('callout')
    }
  })

  it('parses block tag with attributes', async () => {
    const input = '{% callout type="warning" %}\nContent\n{% /callout %}'
    const doc = await from('markdoc', input)
    const hir = doc.toHIR()
    const tagBlock = hir.find((n) => n.type === 'block' && n.name === 'tag')
    expect(tagBlock).toBeDefined()
    if (tagBlock?.type === 'block') {
      expect(tagBlock.attrs['name']).toBe('callout')
      const props = tagBlock.attrs['props'] as Record<string, unknown> | undefined
      expect(props?.['type']).toBe('warning')
    }
  })

  it('parses self-closing block tag', async () => {
    const input = '{% separator /%}'
    const doc = await from('markdoc', input)
    const hir = doc.toHIR()
    const tagBlock = hir.find((n) => n.type === 'block' && n.name === 'tag')
    expect(tagBlock).toBeDefined()
    if (tagBlock?.type === 'block') {
      expect(tagBlock.attrs['name']).toBe('separator')
      expect(tagBlock.attrs['selfClosing']).toBe(true)
    }
  })

  it('parses conditional tag', async () => {
    const input = '{% if $showSection %}\nHidden content\n{% /if %}'
    const doc = await from('markdoc', input)
    const hir = doc.toHIR()
    const condBlock = hir.find((n) => n.type === 'block' && n.name === 'conditional')
    expect(condBlock).toBeDefined()
    if (condBlock?.type === 'block') {
      expect(condBlock.attrs['condition']).toBe('$showSection')
    }
  })
})

// ─── fromMarkdoc — heading annotations ────────────────────────────────────────

describe('fromMarkdoc — heading annotations', () => {
  it('parses heading with id annotation', async () => {
    const input = '# My Heading {% #my-id %}'
    const doc = await from('markdoc', input)
    const hir = doc.toHIR()
    const heading = hir.find((n) => n.type === 'block' && n.name === 'heading')
    expect(heading).toBeDefined()
    if (heading?.type === 'block') {
      expect(heading.attrs['level']).toBe(1)
      expect(heading.attrs['id']).toBe('my-id')
    }
  })

  it('parses heading without annotation as plain heading', async () => {
    const input = '## Section Title'
    const doc = await from('markdoc', input)
    const hir = doc.toHIR()
    const heading = hir.find((n) => n.type === 'block' && n.name === 'heading')
    expect(heading).toBeDefined()
    if (heading?.type === 'block') {
      expect(heading.attrs['level']).toBe(2)
      expect(heading.attrs['id']).toBeUndefined()
    }
  })

  it('includes the heading text content (stripped of annotation)', async () => {
    const input = '# My Heading {% #my-id %}'
    const doc = await from('markdoc', input)
    const hir = doc.toHIR()
    const heading = hir.find((n) => n.type === 'block' && n.name === 'heading')
    if (heading?.type === 'block') {
      const text = heading.children.filter((c) => c.type === 'text').map((c) => (c.type === 'text' ? c.content : '')).join('')
      expect(text).toBe('My Heading')
    }
  })
})

// ─── fromMarkdoc — inline elements ────────────────────────────────────────────

describe('fromMarkdoc — inline elements', () => {
  it('parses variable reference {% $varname %}', async () => {
    const input = 'Hello {% $username %}'
    const doc = await from('markdoc', input)
    const hir = doc.toHIR()
    expect(hir.length).toBeGreaterThan(0)
    // Variable is an entity feature on the block
    const block = hir.find((n) => n.type === 'block' && n.name === 'paragraph')
    expect(block).toBeDefined()
  })

  it('parses inline self-closing tag {% tag /%}', async () => {
    const input = 'Before {% tooltip /%} after'
    const doc = await from('markdoc', input)
    // Just verifies it parses without error
    expect(doc).toBeDefined()
  })

  it('parses strong mark (**text**)', async () => {
    const input = '**bold text**'
    const doc = await from('markdoc', input)
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      const boldSeg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.markdoc.facet#strong'),
      )
      expect(boldSeg).toBeDefined()
    }
  })

  it('parses emphasis mark (*text*)', async () => {
    const input = '*italic text*'
    const doc = await from('markdoc', input)
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.markdoc.facet#emphasis'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses code-span mark (`text`)', async () => {
    const input = '`inline code`'
    const doc = await from('markdoc', input)
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block')
    if (block?.type === 'block') {
      const seg = block.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.markdoc.facet#code-span'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses paragraph with class annotation', async () => {
    const input = 'Some text {% .intro %}'
    const doc = await from('markdoc', input)
    const hir = doc.toHIR()
    const para = hir.find((n) => n.type === 'block' && n.name === 'paragraph')
    expect(para).toBeDefined()
    if (para?.type === 'block') {
      expect(para.attrs['class']).toBe('intro')
    }
  })
})

// ─── fromMarkdoc — standard block types ──────────────────────────────────────

describe('fromMarkdoc — standard block types', () => {
  it('parses plain text as paragraph', async () => {
    const doc = await from('markdoc', 'Hello world')
    const hir = doc.toHIR()
    expect(hir[0]?.type).toBe('block')
    if (hir[0]?.type === 'block') {
      expect(hir[0].name).toBe('paragraph')
    }
  })

  it('parses code block with language', async () => {
    const doc = await from('markdoc', '```typescript\nconst x = 1\n```')
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      expect(codeBlock.attrs['language']).toBe('typescript')
    }
  })

  it('parses blockquote', async () => {
    const doc = await from('markdoc', '> quoted text')
    const hir = doc.toHIR()
    const bq = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(bq).toBeDefined()
  })

  it('parses bullet list', async () => {
    const doc = await from('markdoc', '- item one\n- item two')
    const hir = doc.toHIR()
    const ul = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ul).toBeDefined()
  })

  it('parses ordered list', async () => {
    const doc = await from('markdoc', '1. first\n2. second')
    const hir = doc.toHIR()
    const ol = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(ol).toBeDefined()
  })

  it('parses horizontal rule', async () => {
    const doc = await from('markdoc', '---')
    const hir = doc.toHIR()
    const hr = hir.find((n) => n.type === 'block' && n.name === 'horizontal-rule')
    expect(hr).toBeDefined()
  })
})

// ─── toMarkdoc — round-trips ──────────────────────────────────────────────────

describe('toMarkdoc — round-trips', () => {
  it('round-trips bold text', async () => {
    const result = await to('markdoc', await from('markdoc', '**bold**'))
    expect(result).toContain('**bold**')
  })

  it('round-trips italic text', async () => {
    const result = await to('markdoc', await from('markdoc', '*italic*'))
    expect(result).toContain('*italic*')
  })

  it('round-trips heading level 1', async () => {
    const result = await to('markdoc', await from('markdoc', '# My Heading'))
    expect(result).toContain('# My Heading')
  })

  it('round-trips heading with id annotation', async () => {
    const result = await to('markdoc', await from('markdoc', '# My Heading {% #my-id %}'))
    expect(result).toContain('# My Heading')
    expect(result).toContain('{% #my-id %}')
  })

  it('round-trips self-closing tag', async () => {
    const result = await to('markdoc', await from('markdoc', '{% separator /%}'))
    expect(result).toContain('{% separator')
    expect(result).toContain('/%}')
  })

  it('round-trips code block', async () => {
    const result = await to('markdoc', await from('markdoc', '```js\nconsole.log("hi")\n```'))
    expect(result).toContain('```js')
    expect(result).toContain('console.log("hi")')
  })

  it('round-trips code-span', async () => {
    const result = await to('markdoc', await from('markdoc', '`inline code`'))
    expect(result).toContain('`inline code`')
  })

  it('round-trips horizontal rule', async () => {
    const result = await to('markdoc', await from('markdoc', '---'))
    expect(result).toBe('---')
  })

  it('round-trips bullet list', async () => {
    const result = await to('markdoc', await from('markdoc', '- item one\n- item two'))
    expect(result).toContain('- item one')
    expect(result).toContain('- item two')
  })

  it('round-trips ordered list', async () => {
    const result = await to('markdoc', await from('markdoc', '1. first\n2. second'))
    expect(result).toMatch(/1\. first/)
    expect(result).toMatch(/2\. second/)
  })
})

// ─── Cross-format rendering ───────────────────────────────────────────────────

describe('to(html, from(markdoc, ...))', () => {
  it('strong → <strong>', async () => {
    const html = (await to('html', await from('markdoc', '**bold**'))).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('emphasis → <em>', async () => {
    const html = (await to('html', await from('markdoc', '*italic*'))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('heading 1 → <h1>', async () => {
    const html = (await to('html', await from('markdoc', '# Hello'))).trim()
    expect(html).toContain('<h1>Hello</h1>')
  })

  it('heading 2 → <h2>', async () => {
    const html = (await to('html', await from('markdoc', '## World'))).trim()
    expect(html).toContain('<h2>World</h2>')
  })

  it('code-span → <code>', async () => {
    const html = (await to('html', await from('markdoc', '`code`'))).trim()
    expect(html).toContain('<code>code</code>')
  })

  it('bullet list → <ul><li>', async () => {
    const html = (await to('html', await from('markdoc', '- item'))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })

  it('ordered list → <ol><li>', async () => {
    const html = (await to('html', await from('markdoc', '1. first'))).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
    expect(html).toContain('first')
  })

  it('code block → <pre><code>', async () => {
    const html = (await to('html', await from('markdoc', '```\nconst x = 1\n```'))).trim()
    expect(html).toContain('<pre><code>')
    expect(html).toContain('const x = 1')
  })

  it('paragraph → <p>', async () => {
    const html = (await to('html', await from('markdoc', 'plain text'))).trim()
    expect(html).toContain('<p>plain text</p>')
  })
})
