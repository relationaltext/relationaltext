import { describe, it, expect, beforeAll } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('myst', 'html')
})

// ─── fromMyST — frontmatter ───────────────────────────────────────────────────

describe('fromMyST — frontmatter', () => {
  it('parses YAML frontmatter into frontmatter blocks', async () => {
    const doc = await from('myst', '---\ntitle: My Document\nauthor: Alice\n---\n\nHello')
    const hir = doc.toHIR()
    const fmBlocks = hir.filter((n) => n.type === 'block' && n.name === 'frontmatter')
    expect(fmBlocks.length).toBeGreaterThanOrEqual(1)
    const titleBlock = fmBlocks.find(
      (n) => n.type === 'block' && n.attrs['key'] === 'title',
    )
    expect(titleBlock).toBeDefined()
    if (titleBlock?.type === 'block') {
      expect(titleBlock.attrs['value']).toBe('My Document')
    }
  })

  it('parses multiple frontmatter keys', async () => {
    const doc = await from('myst', '---\ntitle: Doc\ndate: 2026-01-01\ntags: math\n---\n\nBody')
    const hir = doc.toHIR()
    const fmBlocks = hir.filter((n) => n.type === 'block' && n.name === 'frontmatter')
    expect(fmBlocks.length).toBe(3)
  })

  it('toMyST_full emits YAML frontmatter block', async () => {
    const doc = await from('myst', '---\ntitle: Test\n---\n\nContent')
    const result = await to('myst', doc)
    expect(result).toContain('---')
    expect(result).toContain('title: Test')
  })

  it('document without frontmatter has no frontmatter blocks', async () => {
    const doc = await from('myst', 'Just a paragraph')
    const hir = doc.toHIR()
    const fmBlocks = hir.filter((n) => n.type === 'block' && n.name === 'frontmatter')
    expect(fmBlocks.length).toBe(0)
  })
})

// ─── fromMyST — directive blocks ─────────────────────────────────────────────

describe('fromMyST — directive blocks', () => {
  it('parses a directive block', async () => {
    const doc = await from('myst', '```{figure} image.png\nA caption\n```')
    const hir = doc.toHIR()
    const dirBlock = hir.find((n) => n.type === 'block' && n.name === 'directive')
    expect(dirBlock).toBeDefined()
    if (dirBlock?.type === 'block') {
      expect(dirBlock.attrs['name']).toBe('figure')
      expect(dirBlock.attrs['args']).toBe('image.png')
    }
  })

  it('parses directive options', async () => {
    const doc = await from('myst', '```{code-cell} python\n:tags: [hide-cell]\n\nprint("hi")\n```')
    const hir = doc.toHIR()
    const dirBlock = hir.find((n) => n.type === 'block' && n.name === 'directive')
    expect(dirBlock).toBeDefined()
    if (dirBlock?.type === 'block') {
      expect(dirBlock.attrs['name']).toBe('code-cell')
      const options = dirBlock.attrs['options'] as Record<string, string> | undefined
      expect(options).toBeDefined()
      if (options) {
        expect(options['tags']).toBe('[hide-cell]')
      }
    }
  })

  it('directive without args omits args attr', async () => {
    const doc = await from('myst', '```{note}\nThis is a note.\n```')
    const hir = doc.toHIR()
    const dirBlock = hir.find((n) => n.type === 'block' && n.name === 'directive')
    expect(dirBlock).toBeDefined()
    if (dirBlock?.type === 'block') {
      expect(dirBlock.attrs['name']).toBe('note')
      expect(dirBlock.attrs['args']).toBeUndefined()
    }
  })

  it('round-trips a directive block via toMyST', async () => {
    const input = '```{figure} img.png\nCaption text\n```'
    const doc = await from('myst', input)
    const result = await to('myst', doc)
    expect(result).toContain('```{figure}')
    expect(result).toContain('img.png')
  })
})

// ─── fromMyST — admonition blocks ────────────────────────────────────────────

describe('fromMyST — admonition blocks', () => {
  it('parses a note admonition', async () => {
    const doc = await from('myst', ':::{note}\nThis is a note.\n:::')
    const hir = doc.toHIR()
    const admBlock = hir.find((n) => n.type === 'block' && n.name === 'admonition')
    expect(admBlock).toBeDefined()
    if (admBlock?.type === 'block') {
      expect(admBlock.attrs['type']).toBe('note')
    }
  })

  it('parses admonition with title', async () => {
    const doc = await from('myst', ':::{warning} Watch Out\nBe careful.\n:::')
    const hir = doc.toHIR()
    const admBlock = hir.find((n) => n.type === 'block' && n.name === 'admonition')
    expect(admBlock).toBeDefined()
    if (admBlock?.type === 'block') {
      expect(admBlock.attrs['type']).toBe('warning')
      expect(admBlock.attrs['title']).toBe('Watch Out')
    }
  })

  it('round-trips admonition via toMyST', async () => {
    const doc = await from('myst', ':::{tip} Pro Tip\nUse MyST!\n:::')
    const result = await to('myst', doc)
    expect(result).toContain(':::{tip}')
    expect(result).toContain('Pro Tip')
  })
})

// ─── fromMyST — roles ─────────────────────────────────────────────────────────

describe('fromMyST — role inline', () => {
  it('parses a role inline as a role entity', async () => {
    const doc = await from('myst', 'Check {ref}`my-section` for details.')
    const facets = doc.facets
    const roleFacet = facets.find((f) =>
      f.features.some((feat) => 'name' in feat && (feat as Record<string, unknown>)['name'] === 'role'),
    )
    expect(roleFacet).toBeDefined()
  })

  it('stores role name and content in feature data', async () => {
    const doc = await from('myst', 'See {math}`E = mc^2` here.')
    const facets = doc.facets
    const roleFacet = facets.find((f) =>
      f.features.some(
        (feat) =>
          'name' in feat &&
          (feat as Record<string, unknown>)['name'] === 'role' &&
          (feat as Record<string, unknown>)['name_'] === 'math',
      ),
    )
    expect(roleFacet).toBeDefined()
  })
})

// ─── fromMyST — math ─────────────────────────────────────────────────────────

describe('fromMyST — math', () => {
  it('parses inline math $...$', async () => {
    const doc = await from('myst', 'The formula $E = mc^2$ is famous.')
    const facets = doc.facets
    const mathFacet = facets.find((f) =>
      f.features.some(
        (feat) =>
          'name' in feat && (feat as Record<string, unknown>)['name'] === 'math-inline',
      ),
    )
    expect(mathFacet).toBeDefined()
    if (mathFacet) {
      const feat = mathFacet.features.find(
        (f) => 'name' in f && (f as Record<string, unknown>)['name'] === 'math-inline',
      ) as Record<string, unknown> | undefined
      expect(feat?.['code']).toBe('E = mc^2')
    }
  })

  it('parses math block $$...$$', async () => {
    const doc = await from('myst', '$$\n\\int_0^1 x \\, dx = \\frac{1}{2}\n$$')
    const hir = doc.toHIR()
    const mathBlock = hir.find((n) => n.type === 'block' && n.name === 'math-block')
    expect(mathBlock).toBeDefined()
    if (mathBlock?.type === 'block') {
      expect(mathBlock.attrs['code']).toContain('\\int_0^1')
    }
  })

  it('round-trips math block via toMyST', async () => {
    const doc = await from('myst', '$$\nx^2 + y^2 = r^2\n$$')
    const result = await to('myst', doc)
    expect(result).toContain('$$')
    expect(result).toContain('x^2 + y^2 = r^2')
  })
})

// ─── fromMyST — target labels ─────────────────────────────────────────────────

describe('fromMyST — target labels', () => {
  it('stores target label on the following heading', async () => {
    const doc = await from('myst', '(intro)=\n# Introduction')
    const hir = doc.toHIR()
    const heading = hir.find((n) => n.type === 'block' && n.name === 'heading')
    expect(heading).toBeDefined()
    if (heading?.type === 'block') {
      expect(heading.attrs['target']).toBe('intro')
      expect(heading.attrs['level']).toBe(1)
    }
  })

  it('heading without target has no target attr', async () => {
    const doc = await from('myst', '# Plain Heading')
    const hir = doc.toHIR()
    const heading = hir.find((n) => n.type === 'block' && n.name === 'heading')
    expect(heading).toBeDefined()
    if (heading?.type === 'block') {
      expect(heading.attrs['target']).toBeUndefined()
    }
  })

  it('toMyST emits (target)= before heading', async () => {
    const doc = await from('myst', '(sec-intro)=\n## Introduction')
    const result = await to('myst', doc)
    expect(result).toContain('(sec-intro)=')
    expect(result).toContain('## Introduction')
  })
})

// ─── fromMyST — standard features ────────────────────────────────────────────

describe('fromMyST — headings', () => {
  it('parses h1 heading', async () => {
    const doc = await from('myst', '# Title')
    const hir = doc.toHIR()
    const h = hir.find((n) => n.type === 'block' && n.name === 'heading')
    expect(h).toBeDefined()
    if (h?.type === 'block') expect(h.attrs['level']).toBe(1)
  })

  it('parses h2 heading', async () => {
    const doc = await from('myst', '## Section')
    const hir = doc.toHIR()
    const h = hir.find((n) => n.type === 'block' && n.name === 'heading')
    expect(h).toBeDefined()
    if (h?.type === 'block') expect(h.attrs['level']).toBe(2)
  })

  it('round-trips heading via toMyST', async () => {
    expect(await to('myst', await from('myst', '# My Title'))).toBe('# My Title\n')
    expect(await to('myst', await from('myst', '## Section'))).toBe('## Section\n')
  })
})

describe('fromMyST — paragraph', () => {
  it('parses a plain paragraph', async () => {
    const doc = await from('myst', 'Hello world')
    const hir = doc.toHIR()
    const p = hir.find((n) => n.type === 'block' && n.name === 'paragraph')
    expect(p).toBeDefined()
  })

  it('round-trips paragraph', async () => {
    expect(await to('myst', await from('myst', 'Hello world'))).toBe('Hello world\n')
  })
})

describe('fromMyST — code block', () => {
  it('parses fenced code block with language', async () => {
    const doc = await from('myst', '```python\nprint("hi")\n```')
    const hir = doc.toHIR()
    const cb = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(cb).toBeDefined()
    if (cb?.type === 'block') expect(cb.attrs['language']).toBe('python')
  })

  it('round-trips code block', async () => {
    const result = await to('myst', await from('myst', '```js\nconsole.log("hi")\n```'))
    expect(result).toContain('```js')
    expect(result).toContain('console.log("hi")')
  })
})

describe('fromMyST — blockquote', () => {
  it('parses blockquote structure', async () => {
    const doc = await from('myst', '> Quoted text')
    const hir = doc.toHIR()
    const bq = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(bq).toBeDefined()
  })
})

describe('fromMyST — lists', () => {
  it('parses unordered list', async () => {
    const doc = await from('myst', '- Item one\n- Item two')
    const hir = doc.toHIR()
    const ul = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ul).toBeDefined()
  })

  it('parses ordered list', async () => {
    const doc = await from('myst', '1. First\n2. Second')
    const hir = doc.toHIR()
    const ol = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(ol).toBeDefined()
  })

  it('round-trips bullet list', async () => {
    const result = await to('myst', await from('myst', '- Alpha\n- Beta'))
    expect(result).toContain('- Alpha')
    expect(result).toContain('- Beta')
  })
})

// ─── fromMyST — inline marks ─────────────────────────────────────────────────

describe('fromMyST — inline marks', () => {
  it('parses bold (**text**)', async () => {
    const doc = await from('myst', '**bold**')
    const hir = doc.toHIR()
    const p = hir.find((n) => n.type === 'block')
    expect(p).toBeDefined()
    if (p?.type === 'block') {
      const seg = p.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mystmd.facet#strong'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') expect(seg.content).toBe('bold')
    }
  })

  it('parses emphasis (*text*)', async () => {
    const doc = await from('myst', '*italic*')
    const hir = doc.toHIR()
    const p = hir.find((n) => n.type === 'block')
    expect(p).toBeDefined()
    if (p?.type === 'block') {
      const seg = p.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mystmd.facet#emphasis'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses strikethrough (~~text~~)', async () => {
    const doc = await from('myst', '~~strike~~')
    const hir = doc.toHIR()
    const p = hir.find((n) => n.type === 'block')
    if (p?.type === 'block') {
      const seg = p.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mystmd.facet#strikethrough'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses inline code (`text`)', async () => {
    const doc = await from('myst', '`code`')
    const hir = doc.toHIR()
    const p = hir.find((n) => n.type === 'block')
    if (p?.type === 'block') {
      const seg = p.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mystmd.facet#code-span'),
      )
      expect(seg).toBeDefined()
    }
  })
})

// ─── Round-trips ──────────────────────────────────────────────────────────────

describe('toMyST — round-trips', () => {
  it('round-trips bold', async () => {
    expect(await to('myst', await from('myst', '**bold**'))).toBe('**bold**\n')
  })

  it('round-trips emphasis', async () => {
    expect(await to('myst', await from('myst', '*italic*'))).toBe('*italic*\n')
  })

  it('round-trips strikethrough', async () => {
    expect(await to('myst', await from('myst', '~~strike~~'))).toBe('~~strike~~\n')
  })

  it('round-trips horizontal rule', async () => {
    expect(await to('myst', await from('myst', '---'))).toBe('---\n')
  })

  it('round-trips ordered list', async () => {
    const result = await to('myst', await from('myst', '1. First\n2. Second'))
    expect(result).toContain('1. First')
    expect(result).toContain('2. Second')
  })
})

// ─── Cross-format: toHTML ─────────────────────────────────────────────────────

describe('toHTML from MyST document', () => {
  it('converts MyST paragraph to HTML <p>', async () => {
    const doc = await from('myst', 'Hello world')
    const html = await to('html', doc)
    expect(html).toContain('<p>Hello world</p>')
  })

  it('converts MyST heading to HTML <h1>', async () => {
    const doc = await from('myst', '# My Title')
    const html = await to('html', doc)
    expect(html).toContain('<h1>My Title</h1>')
  })

  it('converts MyST bold to HTML <strong>', async () => {
    const doc = await from('myst', '**bold text**')
    const html = await to('html', doc)
    expect(html).toContain('<strong>bold text</strong>')
  })

  it('converts MyST emphasis to HTML <em>', async () => {
    const doc = await from('myst', '*italic text*')
    const html = await to('html', doc)
    expect(html).toContain('<em>italic text</em>')
  })

  it('converts MyST code block to HTML <pre><code>', async () => {
    const doc = await from('myst', '```python\nprint("hi")\n```')
    const html = await to('html', doc)
    expect(html).toContain('<pre>')
    expect(html).toContain('<code')
  })

  it('converts MyST unordered list to HTML <ul>', async () => {
    const doc = await from('myst', '- Item A\n- Item B')
    const html = await to('html', doc)
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
  })
})
