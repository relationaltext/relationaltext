import { describe, it, expect, beforeAll } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('textile', 'html')
})

// ─── fromTextile — inline marks ───────────────────────────────────────────────

describe('fromTextile — inline marks', () => {
  it('parses bold mark (*text*)', async () => {
    const doc = await from('textile', '*hello*')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.textile.facet#bold'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('hello')
      }
    }
  })

  it('parses strong mark (**text**)', async () => {
    const doc = await from('textile', '**hello**')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.textile.facet#strong'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('hello')
      }
    }
  })

  it('parses italic mark (_text_)', async () => {
    const doc = await from('textile', '_italic_')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.textile.facet#italic'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('italic')
      }
    }
  })

  it('parses italic mark (__text__)', async () => {
    const doc = await from('textile', '__italic__')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.textile.facet#italic'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('italic')
      }
    }
  })

  it('parses underline mark (+text+)', async () => {
    const doc = await from('textile', '+underline+')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.textile.facet#underline'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('underline')
      }
    }
  })

  it('parses strikethrough mark (-text-)', async () => {
    const doc = await from('textile', '-strike-')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.textile.facet#strikethrough'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('strike')
      }
    }
  })

  it('parses superscript mark (^text^)', async () => {
    const doc = await from('textile', '^sup^')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.textile.facet#superscript'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('sup')
      }
    }
  })

  it('parses subscript mark (~text~)', async () => {
    const doc = await from('textile', '~sub~')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.textile.facet#subscript'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('sub')
      }
    }
  })

  it('parses code mark (@text@)', async () => {
    const doc = await from('textile', '@code@')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.textile.facet#code'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('code')
      }
    }
  })

  it('parses link ("text":url)', async () => {
    const doc = await from('textile', '"click here":https://example.com')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.textile.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('click here')
        const linkMark = seg.marks.find((m) => m.kind === 'org.textile.facet#link')
        expect(linkMark?.attrs['uri']).toBe('https://example.com')
      }
    }
  })

  it('parses image (!src!)', async () => {
    const doc = await from('textile', '!photo.jpg!')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.textile.facet#image'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const imgMark = seg.marks.find((m) => m.kind === 'org.textile.facet#image')
        expect(imgMark?.attrs['src']).toBe('photo.jpg')
      }
    }
  })

  it('parses image with alt text (!src(alt)!)', async () => {
    const doc = await from('textile', '!photo.jpg(A photo)!')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.textile.facet#image'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const imgMark = seg.marks.find((m) => m.kind === 'org.textile.facet#image')
        expect(imgMark?.attrs['src']).toBe('photo.jpg')
        expect(imgMark?.attrs['alt']).toBe('A photo')
      }
    }
  })
})

// ─── fromTextile — block types ────────────────────────────────────────────────

describe('fromTextile — block types', () => {
  it('parses h1. as heading level 1', async () => {
    const doc = await from('textile', 'h1. Hello World')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(1)
    }
  })

  it('parses h2. as heading level 2', async () => {
    const doc = await from('textile', 'h2. Section')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(2)
    }
  })

  it('parses h3. as heading level 3', async () => {
    const doc = await from('textile', 'h3. Subsection')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(3)
    }
  })

  it('parses plain text as paragraph block', async () => {
    const doc = await from('textile', 'Hello, world!')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('paragraph')
    }
  })

  it('parses p. as explicit paragraph', async () => {
    const doc = await from('textile', 'p. explicit paragraph')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('paragraph')
    }
  })

  it('parses * item as bullet list structure', async () => {
    const doc = await from('textile', '* item one\n* item two')
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

  it('parses # item as ordered list structure', async () => {
    const doc = await from('textile', '# first\n# second')
    const hir = doc.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(olContainer).toBeDefined()
    if (olContainer?.type === 'container') {
      const hasListItemText = (nodes: typeof olContainer.children): boolean =>
        nodes.some(
          (n) =>
            (n.type === 'block' && n.name === 'list-item-text') ||
            (n.type === 'container' && hasListItemText(n.children)),
        )
      expect(hasListItemText(olContainer.children)).toBe(true)
    }
  })

  it('parses bq. as blockquote structure', async () => {
    const doc = await from('textile', 'bq. quoted text')
    const hir = doc.toHIR()
    const blockquote = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(blockquote).toBeDefined()
  })

  it('parses bc. as code-block', async () => {
    const doc = await from('textile', 'bc. const x = 1')
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      const code = codeBlock.children
        .filter((c) => c.type === 'text')
        .map((c) => (c.type === 'text' ? c.content : ''))
        .join('')
      expect(code).toContain('const x = 1')
    }
  })

  it('parses --- as horizontal-rule block', async () => {
    const doc = await from('textile', '---')
    const hir = doc.toHIR()
    const hr = hir.find((n) => n.type === 'block' && n.name === 'horizontal-rule')
    expect(hr).toBeDefined()
  })
})

// ─── toTextile — round-trips ──────────────────────────────────────────────────

describe('toTextile — round-trip', () => {
  it('round-trips bold text', async () => {
    const result = await to('textile', await from('textile', '*bold*'))
    expect(result).toBe('*bold*')
  })

  it('round-trips strong text', async () => {
    const result = await to('textile', await from('textile', '**strong**'))
    expect(result).toBe('**strong**')
  })

  it('round-trips italic text (_)', async () => {
    const result = await to('textile', await from('textile', '_italic_'))
    expect(result).toBe('_italic_')
  })

  it('round-trips underline text', async () => {
    const result = await to('textile', await from('textile', '+underline+'))
    expect(result).toBe('+underline+')
  })

  it('round-trips strikethrough text', async () => {
    const result = await to('textile', await from('textile', '-strike-'))
    expect(result).toBe('-strike-')
  })

  it('round-trips superscript text', async () => {
    const result = await to('textile', await from('textile', '^sup^'))
    expect(result).toBe('^sup^')
  })

  it('round-trips subscript text', async () => {
    const result = await to('textile', await from('textile', '~sub~'))
    expect(result).toBe('~sub~')
  })

  it('round-trips code text', async () => {
    const result = await to('textile', await from('textile', '@code@'))
    expect(result).toBe('@code@')
  })

  it('round-trips heading level 1', async () => {
    const result = await to('textile', await from('textile', 'h1. My Heading'))
    expect(result).toBe('h1. My Heading')
  })

  it('round-trips heading level 2', async () => {
    const result = await to('textile', await from('textile', 'h2. Section'))
    expect(result).toBe('h2. Section')
  })

  it('round-trips heading level 3', async () => {
    const result = await to('textile', await from('textile', 'h3. Subsection'))
    expect(result).toBe('h3. Subsection')
  })

  it('round-trips bullet list', async () => {
    const result = await to('textile', await from('textile', '* item one\n* item two'))
    expect(result).toContain('* item one')
    expect(result).toContain('* item two')
  })

  it('round-trips ordered list', async () => {
    const result = await to('textile', await from('textile', '# first\n# second'))
    expect(result).toContain('# first')
    expect(result).toContain('# second')
  })

  it('round-trips horizontal rule', async () => {
    const result = await to('textile', await from('textile', '---'))
    expect(result).toBe('---')
  })

  it('round-trips code block', async () => {
    const result = await to('textile', await from('textile', 'bc. const x = 1'))
    expect(result).toContain('const x = 1')
  })

  it('round-trips plain paragraph', async () => {
    const result = await to('textile', await from('textile', 'Hello world'))
    expect(result).toBe('Hello world')
  })
})

// ─── Cross-format rendering ───────────────────────────────────────────────────

describe('to(html, from(textile, ...))', () => {
  it('bold → <strong>', async () => {
    const html = (await to('html', await from('textile', '*bold*'))).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('strong → <strong>', async () => {
    const html = (await to('html', await from('textile', '**strong**'))).trim()
    expect(html).toContain('<strong>strong</strong>')
  })

  it('italic → <em>', async () => {
    const html = (await to('html', await from('textile', '_italic_'))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('italic (__) → <em>', async () => {
    const html = (await to('html', await from('textile', '__italic__'))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('code → <code>', async () => {
    const html = (await to('html', await from('textile', '@code@'))).trim()
    expect(html).toContain('<code>code</code>')
  })

  it('heading 1 → <h1>', async () => {
    const html = (await to('html', await from('textile', 'h1. Hello'))).trim()
    expect(html).toContain('<h1>Hello</h1>')
  })

  it('heading 2 → <h2>', async () => {
    const html = (await to('html', await from('textile', 'h2. World'))).trim()
    expect(html).toContain('<h2>World</h2>')
  })

  it('heading 3 → <h3>', async () => {
    const html = (await to('html', await from('textile', 'h3. Section'))).trim()
    expect(html).toContain('<h3>Section</h3>')
  })

  it('paragraph → <p>', async () => {
    const html = (await to('html', await from('textile', 'plain text'))).trim()
    expect(html).toContain('<p>plain text</p>')
  })

  it('bullet list → <ul><li>', async () => {
    const html = (await to('html', await from('textile', '* item'))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })

  it('ordered list → <ol><li>', async () => {
    const html = (await to('html', await from('textile', '# first'))).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
    expect(html).toContain('first')
  })

  it('code block → <pre><code>', async () => {
    const html = (await to('html', await from('textile', 'bc. const x = 1'))).trim()
    expect(html).toContain('<pre><code>')
    expect(html).toContain('const x = 1')
  })

  it('horizontal rule → <hr />', async () => {
    const html = (await to('html', await from('textile', '---'))).trim()
    expect(html).toContain('<hr')
  })

  it('blockquote → <blockquote>', async () => {
    const html = (await to('html', await from('textile', 'bq. quoted text'))).trim()
    expect(html).toContain('<blockquote>')
    expect(html).toContain('quoted text')
  })
})
