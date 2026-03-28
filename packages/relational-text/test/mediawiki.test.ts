import { describe, it, expect, beforeAll } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('mediawiki', 'html')
})

// ─── fromMediaWiki — inline marks ─────────────────────────────────────────────

describe('fromMediaWiki — inline marks', () => {
  it('parses bold mark (\'\'\'text\'\'\')', async () => {
    const doc = await from('mediawiki', "'''hello'''")
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mediawiki.facet#bold'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('hello')
      }
    }
  })

  it('parses italic mark (\'\'text\'\')', async () => {
    const doc = await from('mediawiki', "''italic''")
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mediawiki.facet#italic'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('italic')
      }
    }
  })

  it('parses bold+italic mark (\'\'\'\'\'text\'\'\'\'\')', async () => {
    const doc = await from('mediawiki', "'''''bolditalic'''''")
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) =>
          c.type === 'text' &&
          c.marks.some((m) => m.kind === 'org.mediawiki.facet#bold') &&
          c.marks.some((m) => m.kind === 'org.mediawiki.facet#italic'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('bolditalic')
      }
    }
  })

  it('parses inline code mark (<code>text</code>)', async () => {
    const doc = await from('mediawiki', '<code>snippet</code>')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mediawiki.facet#code'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('snippet')
      }
    }
  })
})

// ─── fromMediaWiki — link entities ────────────────────────────────────────────

describe('fromMediaWiki — link entities', () => {
  it('parses wikilink ([[Page Title]])', async () => {
    const doc = await from('mediawiki', '[[Main Page]]')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mediawiki.facet#wikilink'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('Main Page')
        const mark = seg.marks.find((m) => m.kind === 'org.mediawiki.facet#wikilink')
        expect(mark?.attrs['page']).toBe('Main Page')
      }
    }
  })

  it('parses wikilink with display text ([[Page|Display]])', async () => {
    const doc = await from('mediawiki', '[[Main Page|click here]]')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mediawiki.facet#wikilink'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('click here')
        const mark = seg.marks.find((m) => m.kind === 'org.mediawiki.facet#wikilink')
        expect(mark?.attrs['page']).toBe('Main Page')
        expect(mark?.attrs['display']).toBe('click here')
      }
    }
  })

  it('parses external link with display ([url text])', async () => {
    const doc = await from('mediawiki', '[https://example.com Visit Example]')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mediawiki.facet#extlink'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('Visit Example')
        const mark = seg.marks.find((m) => m.kind === 'org.mediawiki.facet#extlink')
        expect(mark?.attrs['uri']).toBe('https://example.com')
      }
    }
  })

  it('parses bare external link ([url])', async () => {
    const doc = await from('mediawiki', '[https://example.com]')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mediawiki.facet#extlink'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'org.mediawiki.facet#extlink')
        expect(mark?.attrs['uri']).toBe('https://example.com')
      }
    }
  })
})

// ─── fromMediaWiki — block types ──────────────────────────────────────────────

describe('fromMediaWiki — block types', () => {
  it('parses == Heading == as heading level 2 (h2)', async () => {
    const doc = await from('mediawiki', '== My Heading ==')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'heading')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      // MediaWiki == corresponds to <h2>, so level is stored as 2
      expect(block.attrs['level']).toBe(2)
    }
  })

  it('parses === Heading === as heading level 3 (h3)', async () => {
    const doc = await from('mediawiki', '=== Section ===')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'heading')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      expect(block.attrs['level']).toBe(3)
    }
  })

  it('parses ==== Heading ==== as heading level 4 (h4)', async () => {
    const doc = await from('mediawiki', '==== Deep Heading ====')
    const hir = doc.toHIR()
    const block = hir.find((n) => n.type === 'block' && n.name === 'heading')
    expect(block).toBeDefined()
    if (block?.type === 'block') {
      expect(block.attrs['level']).toBe(4)
    }
  })

  it('parses plain text as paragraph block', async () => {
    const doc = await from('mediawiki', 'Hello, world!')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('paragraph')
    }
  })

  it('parses * item as bullet list structure', async () => {
    const doc = await from('mediawiki', '* item one\n* item two')
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
    const doc = await from('mediawiki', '# first\n# second')
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

  it('parses ---- as horizontal-rule block', async () => {
    const doc = await from('mediawiki', '----')
    const hir = doc.toHIR()
    const hr = hir.find((n) => n.type === 'block' && n.name === 'horizontal-rule')
    expect(hr).toBeDefined()
  })

  it('parses : indented text as blockquote structure', async () => {
    const doc = await from('mediawiki', ': indented text')
    const hir = doc.toHIR()
    const blockquote = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(blockquote).toBeDefined()
  })

  it('parses [[File:Name.jpg|thumb|Caption]] as image entity', async () => {
    const doc = await from('mediawiki', '[[File:photo.jpg|thumb|A photo]]')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mediawiki.facet#image'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'org.mediawiki.facet#image')
        expect(mark?.attrs['src']).toBe('photo.jpg')
        expect(mark?.attrs['caption']).toBe('A photo')
      }
    }
  })

  it('parses {{Template|args}} as template entity', async () => {
    const doc = await from('mediawiki', '{{Infobox|name=Test}}')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mediawiki.facet#template'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'org.mediawiki.facet#template')
        expect(mark?.attrs['templateName']).toBe('Infobox')
      }
    }
  })

  it('parses <ref>content</ref> as ref entity', async () => {
    const doc = await from('mediawiki', 'text<ref>footnote</ref>')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mediawiki.facet#ref'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'org.mediawiki.facet#ref')
        expect(mark?.attrs['content']).toBe('footnote')
      }
    }
  })
})

// ─── toMediaWiki — round-trips ─────────────────────────────────────────────────

describe('toMediaWiki — round-trip', () => {
  it('round-trips bold text', async () => {
    const result = await to('mediawiki', await from('mediawiki', "'''bold'''"))
    expect(result).toContain("'''bold'''")
  })

  it('round-trips italic text', async () => {
    const result = await to('mediawiki', await from('mediawiki', "''italic''"))
    expect(result).toContain("''italic''")
  })

  it('round-trips wikilink', async () => {
    const result = await to('mediawiki', await from('mediawiki', '[[Main Page]]'))
    expect(result).toContain('[[Main Page]]')
  })

  it('round-trips wikilink with display text', async () => {
    const result = await to('mediawiki', await from('mediawiki', '[[Main Page|click here]]'))
    expect(result).toContain('[[Main Page|click here]]')
  })

  it('round-trips heading level 1 (== ==)', async () => {
    const result = await to('mediawiki', await from('mediawiki', '== My Heading =='))
    expect(result).toMatch(/^== My Heading ==$/m)
  })

  it('round-trips heading level 2 (=== ===)', async () => {
    const result = await to('mediawiki', await from('mediawiki', '=== Section ==='))
    expect(result).toMatch(/^=== Section ===$/m)
  })

  it('round-trips horizontal rule', async () => {
    const result = await to('mediawiki', await from('mediawiki', '----'))
    expect(result).toBe('----')
  })

  it('round-trips bullet list', async () => {
    const result = await to('mediawiki', await from('mediawiki', '* item one\n* item two'))
    expect(result).toContain('* item one')
    expect(result).toContain('* item two')
  })

  it('round-trips ordered list', async () => {
    const result = await to('mediawiki', await from('mediawiki', '# first\n# second'))
    expect(result).toContain('# first')
    expect(result).toContain('# second')
  })
})

// ─── Cross-format rendering ───────────────────────────────────────────────────

describe('to(html, from(mediawiki, ...))', () => {
  it("bold → <strong>", async () => {
    const html = (await to('html', await from('mediawiki', "'''bold'''"))).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it("italic → <em>", async () => {
    const html = (await to('html', await from('mediawiki', "''italic''"))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('heading == == → <h2>', async () => {
    const html = (await to('html', await from('mediawiki', '== My Heading =='))).trim()
    expect(html).toContain('<h2>My Heading</h2>')
  })

  it('code → <code>', async () => {
    const html = (await to('html', await from('mediawiki', '<code>snippet</code>'))).trim()
    expect(html).toContain('<code>snippet</code>')
  })

  it('paragraph → <p>', async () => {
    const html = (await to('html', await from('mediawiki', 'Hello, world!'))).trim()
    expect(html).toContain('<p>Hello, world!</p>')
  })
})

// ─── fromMediaWiki — structured templates ───────────────────────────────────

describe('fromMediaWiki — structured templates', () => {
  it('parses template with named parameters', async () => {
    const doc = await from('mediawiki', '{{Infobox|name=Test|type=food}}')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mediawiki.facet#template'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'org.mediawiki.facet#template')
        expect(mark?.attrs['templateName']).toBe('Infobox')
        expect(mark?.attrs['parameters']).toBeDefined()
        const params = mark?.attrs['parameters'] as Array<Record<string, string>>
        expect(params).toHaveLength(2)
        expect(params[0]).toMatchObject({ key: 'name', value: 'Test' })
        expect(params[1]).toMatchObject({ key: 'type', value: 'food' })
      }
    }
  })

  it('parses template with positional parameters', async () => {
    const doc = await from('mediawiki', '{{convert|5|kg|lb}}')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mediawiki.facet#template'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'org.mediawiki.facet#template')
        expect(mark?.attrs['templateName']).toBe('convert')
        expect(mark?.attrs['parameters']).toBeDefined()
        const params = mark?.attrs['parameters'] as Array<Record<string, unknown>>
        expect(params).toHaveLength(3)
        expect(params[0]).toMatchObject({ index: 0, value: '5' })
      }
    }
  })
})

// ─── fromMediaWiki — ref with attributes ────────────────────────────────────

describe('fromMediaWiki — ref with attributes', () => {
  it('parses <ref name="foo">content</ref> with name attribute', async () => {
    const doc = await from('mediawiki', 'text<ref name="foo">footnote content</ref>')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mediawiki.facet#ref'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mark = seg.marks.find((m) => m.kind === 'org.mediawiki.facet#ref')
        expect(mark?.attrs['content']).toBe('footnote content')
        expect(mark?.attrs['refName']).toBe('foo')
      }
    }
  })
})

// ─── fromMediaWiki — tables ─────────────────────────────────────────────────

describe('fromMediaWiki — tables', () => {
  it('parses a simple table', async () => {
    const wikitext = '{|\n|-\n| cell1 || cell2\n|-\n| cell3 || cell4\n|}'
    const doc = await from('mediawiki', wikitext)
    const hir = doc.toHIR()
    // Tables emit multiple child blocks, so the HIR creates a container
    const tableContainer = hir.find((n) => n.type === 'container' && n.name === 'table')
    expect(tableContainer).toBeDefined()
  })

  it('parses table with heading cells preserving content', async () => {
    const wikitext = '{|\n|-\n! Header1 !! Header2\n|-\n| cell1 || cell2\n|}'
    const doc = await from('mediawiki', wikitext)
    const hir = doc.toHIR()
    const tableContainer = hir.find((n) => n.type === 'container' && n.name === 'table')
    expect(tableContainer).toBeDefined()
    if (tableContainer?.type === 'container') {
      // Collect all text content from the table container recursively
      const collectText = (nodes: typeof tableContainer.children): string =>
        nodes.map((n) =>
          n.type === 'text' ? n.content :
          (n.type === 'block' || n.type === 'container') ? collectText(n.children) : ''
        ).join('')
      const textContent = collectText(tableContainer.children)
      expect(textContent).toContain('Header1')
      expect(textContent).toContain('Header2')
      expect(textContent).toContain('cell1')
      expect(textContent).toContain('cell2')
    }
  })
})

// ─── fromMediaWiki — nested structures ──────────────────────────────────────

describe('fromMediaWiki — nested structures', () => {
  it('parses bold text inside a wikilink', async () => {
    const doc = await from('mediawiki', "[[Main Page|'''bold link''']]")
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.mediawiki.facet#wikilink'),
      )
      expect(seg).toBeDefined()
    }
  })
})
