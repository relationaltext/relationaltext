import { describe, it, expect, beforeAll } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('dokuwiki', 'html')
})

// ─── fromDokuWiki — inline marks ──────────────────────────────────────────────

describe('fromDokuWiki — inline marks', () => {
  it('parses bold mark (**text**)', async () => {
    const doc = await from('dokuwiki', '**hello**')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.dokuwiki.facet#bold'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('hello')
      }
    }
  })

  it('parses italic mark (//text//)', async () => {
    const doc = await from('dokuwiki', '//italic//')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.dokuwiki.facet#italic'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('italic')
      }
    }
  })

  it('parses underline mark (__text__)', async () => {
    const doc = await from('dokuwiki', '__underline__')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.dokuwiki.facet#underline'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('underline')
      }
    }
  })

  it("parses monospace mark (''text'')", async () => {
    const doc = await from('dokuwiki', "''mono''")
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.dokuwiki.facet#monospace'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('mono')
      }
    }
  })

  it('parses strikethrough mark (<del>text</del>)', async () => {
    const doc = await from('dokuwiki', '<del>struck</del>')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.dokuwiki.facet#strikethrough'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('struck')
      }
    }
  })

  it('parses internal wikilink ([[page]])', async () => {
    const doc = await from('dokuwiki', '[[mypage]]')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.dokuwiki.facet#wikilink'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('mypage')
        const mark = seg.marks.find((m) => m.kind === 'org.dokuwiki.facet#wikilink')
        expect(mark?.attrs['page']).toBe('mypage')
      }
    }
  })

  it('parses wikilink with display text ([[page|display]])', async () => {
    const doc = await from('dokuwiki', '[[start|Home Page]]')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.dokuwiki.facet#wikilink'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('Home Page')
        const mark = seg.marks.find((m) => m.kind === 'org.dokuwiki.facet#wikilink')
        expect(mark?.attrs['page']).toBe('start')
      }
    }
  })

  it('parses external link ([[https://url]])', async () => {
    const doc = await from('dokuwiki', '[[https://example.com]]')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.dokuwiki.facet#extlink'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'org.dokuwiki.facet#extlink')
        expect(mark?.attrs['uri']).toBe('https://example.com')
      }
    }
  })

  it('parses external link with display text ([[https://url|display]])', async () => {
    const doc = await from('dokuwiki', '[[https://example.com|Visit Example]]')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.dokuwiki.facet#extlink'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('Visit Example')
        const mark = seg.marks.find((m) => m.kind === 'org.dokuwiki.facet#extlink')
        expect(mark?.attrs['uri']).toBe('https://example.com')
      }
    }
  })

  it('parses image ({{image.png|alt text}})', async () => {
    const doc = await from('dokuwiki', '{{photo.png|a photo}}')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.dokuwiki.facet#image'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'org.dokuwiki.facet#image')
        expect(mark?.attrs['src']).toBe('photo.png')
        expect(mark?.attrs['alt']).toBe('a photo')
      }
    }
  })

  it('parses line break (\\\\)', async () => {
    const doc = await from('dokuwiki', 'line one\\\\line two')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const hasLineBreak = hir[0]!.children.some(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.dokuwiki.facet#line-break'),
      )
      expect(hasLineBreak).toBe(true)
    }
  })
})

// ─── fromDokuWiki — block types ───────────────────────────────────────────────

describe('fromDokuWiki — block types', () => {
  it('parses ====== Heading 1 ====== as heading level 1', async () => {
    const doc = await from('dokuwiki', '====== My Title ======')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(1)
    }
  })

  it('parses ===== Heading 2 ===== as heading level 2', async () => {
    const doc = await from('dokuwiki', '===== Section =====')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(2)
    }
  })

  it('parses ==== Heading 3 ==== as heading level 3', async () => {
    const doc = await from('dokuwiki', '==== Subsection ====')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(3)
    }
  })

  it('parses plain text as paragraph block', async () => {
    const doc = await from('dokuwiki', 'Hello, world!')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('paragraph')
    }
  })

  it('parses bullet list (  * item) as ul structure', async () => {
    const doc = await from('dokuwiki', '  * item one\n  * item two')
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

  it('parses ordered list (  - item) as ol structure', async () => {
    const doc = await from('dokuwiki', '  - first\n  - second')
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

  it('parses > quote as blockquote structure', async () => {
    const doc = await from('dokuwiki', '> quoted text')
    const hir = doc.toHIR()
    const blockquote = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(blockquote).toBeDefined()
  })

  it('parses <code> block as code-block', async () => {
    const doc = await from('dokuwiki', '<code>\nconst x = 1\n</code>')
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

  it('parses <code lang> block with language attribute', async () => {
    const doc = await from('dokuwiki', '<code javascript>\nconsole.log("hi")\n</code>')
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      expect(codeBlock.attrs['language']).toBe('javascript')
    }
  })

  it('parses ---- as horizontal-rule block', async () => {
    const doc = await from('dokuwiki', '----')
    const hir = doc.toHIR()
    const hr = hir.find((n) => n.type === 'block' && n.name === 'horizontal-rule')
    expect(hr).toBeDefined()
  })
})

// ─── toDokuWiki — round-trips ─────────────────────────────────────────────────

describe('toDokuWiki — round-trip', () => {
  it('round-trips bold text', async () => {
    const result = await to('dokuwiki', await from('dokuwiki', '**bold**'))
    expect(result).toBe('**bold**')
  })

  it('round-trips italic text', async () => {
    const result = await to('dokuwiki', await from('dokuwiki', '//italic//'))
    expect(result).toBe('//italic//')
  })

  it('round-trips wikilink', async () => {
    const result = await to('dokuwiki', await from('dokuwiki', '[[mypage]]'))
    expect(result).toContain('[[mypage]]')
  })

  it('round-trips wikilink with display', async () => {
    const result = await to('dokuwiki', await from('dokuwiki', '[[start|Home Page]]'))
    expect(result).toContain('[[start|Home Page]]')
  })

  it('round-trips heading level 1', async () => {
    const result = await to('dokuwiki', await from('dokuwiki', '====== My Title ======'))
    expect(result).toContain('====== My Title ======')
  })

  it('round-trips heading level 2', async () => {
    const result = await to('dokuwiki', await from('dokuwiki', '===== Section ====='))
    expect(result).toContain('===== Section =====')
  })

  it('round-trips horizontal rule', async () => {
    const result = await to('dokuwiki', await from('dokuwiki', '----'))
    expect(result).toBe('----')
  })
})

// ─── Cross-format rendering ───────────────────────────────────────────────────

describe('to(html, from(dokuwiki, ...))', () => {
  it('bold → <strong>', async () => {
    const html = (await to('html', await from('dokuwiki', '**bold**'))).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('italic → <em>', async () => {
    const html = (await to('html', await from('dokuwiki', '//italic//'))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('heading level 1 → <h1>', async () => {
    const html = (await to('html', await from('dokuwiki', '====== Title ======'))).trim()
    expect(html).toContain('<h1>Title</h1>')
  })

  it('heading level 2 → <h2>', async () => {
    const html = (await to('html', await from('dokuwiki', '===== Section ====='))).trim()
    expect(html).toContain('<h2>Section</h2>')
  })

  it('heading level 3 → <h3>', async () => {
    const html = (await to('html', await from('dokuwiki', '==== Subsection ===='))).trim()
    expect(html).toContain('<h3>Subsection</h3>')
  })

  it('paragraph → <p>', async () => {
    const html = (await to('html', await from('dokuwiki', 'plain text'))).trim()
    expect(html).toContain('<p>plain text</p>')
  })
})
