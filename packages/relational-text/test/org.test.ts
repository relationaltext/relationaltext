import { describe, it, expect, beforeAll } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('org', 'html')
})

// ─── fromOrg — inline marks ───────────────────────────────────────────────────

describe('fromOrg — inline marks', () => {
  it('parses bold mark (*text*)', async () => {
    const doc = await from('org', '*bold*')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.orgmode.facet#bold'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('bold')
      }
    }
  })

  it('parses italic mark (/text/)', async () => {
    const doc = await from('org', '/italic/')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.orgmode.facet#italic'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('italic')
      }
    }
  })

  it('parses underline mark (_text_)', async () => {
    const doc = await from('org', '_underline_')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.orgmode.facet#underline'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('underline')
      }
    }
  })

  it('parses strikethrough mark (+text+)', async () => {
    const doc = await from('org', '+strike+')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.orgmode.facet#strikethrough'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('strike')
      }
    }
  })

  it('parses verbatim mark (=text=)', async () => {
    const doc = await from('org', '=verbatim=')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.orgmode.facet#verbatim'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('verbatim')
      }
    }
  })

  it('parses code mark (~text~)', async () => {
    const doc = await from('org', '~code~')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.orgmode.facet#code'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('code')
      }
    }
  })

  it('parses link with description ([[url][desc]])', async () => {
    const doc = await from('org', '[[https://example.com][click here]]')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.orgmode.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('click here')
        const linkMark = seg.marks.find((m) => m.kind === 'org.orgmode.facet#link')
        expect(linkMark?.attrs['uri']).toBe('https://example.com')
      }
    }
  })

  it('parses bare link ([[url]])', async () => {
    const doc = await from('org', '[[https://example.com]]')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.orgmode.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        // bare link: text = url
        expect(seg.content).toBe('https://example.com')
        const linkMark = seg.marks.find((m) => m.kind === 'org.orgmode.facet#link')
        expect(linkMark?.attrs['uri']).toBe('https://example.com')
      }
    }
  })
})

// ─── fromOrg — block types ────────────────────────────────────────────────────

describe('fromOrg — block types', () => {
  it('parses * Heading as heading level 1', async () => {
    const doc = await from('org', '* Heading')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(1)
    }
  })

  it('parses ** Heading as heading level 2', async () => {
    const doc = await from('org', '** Heading')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(2)
    }
  })

  it('parses * TODO Task as heading with todo attribute', async () => {
    const doc = await from('org', '* TODO Task name')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['todo']).toBe('TODO')
    }
  })

  it('parses #+BEGIN_SRC / #+END_SRC as code block with language', async () => {
    const doc = await from('org', '#+BEGIN_SRC python\nprint("hello")\n#+END_SRC')
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      expect(codeBlock.attrs['language']).toBe('python')
      const code = codeBlock.children
        .filter((c) => c.type === 'text')
        .map((c) => (c.type === 'text' ? c.content : ''))
        .join('')
      expect(code).toContain('print("hello")')
    }
  })

  it('parses #+BEGIN_QUOTE / #+END_QUOTE as blockquote structure', async () => {
    const doc = await from('org', '#+BEGIN_QUOTE\nquoted text\n#+END_QUOTE')
    const hir = doc.toHIR()
    const blockquote = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(blockquote).toBeDefined()
  })

  it('parses - item as bullet list structure', async () => {
    const doc = await from('org', '- item one\n- item two')
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

  it('parses 1. item as ordered list structure', async () => {
    const doc = await from('org', '1. first\n2. second')
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

  it('parses ----- as horizontal-rule block', async () => {
    const doc = await from('org', '-----')
    const hir = doc.toHIR()
    const hr = hir.find((n) => n.type === 'block' && n.name === 'horizontal-rule')
    expect(hr).toBeDefined()
  })
})

// ─── toOrg — round-trips ──────────────────────────────────────────────────────

describe('toOrg — round-trip', () => {
  it('round-trips bold text', async () => {
    const result = await to('org', await from('org', '*bold*'))
    expect(result).toBe('*bold*')
  })

  it('round-trips heading level 1', async () => {
    const result = await to('org', await from('org', '* My Heading'))
    expect(result).toBe('* My Heading')
  })

  it('round-trips heading level 2', async () => {
    const result = await to('org', await from('org', '** Section'))
    expect(result).toBe('** Section')
  })

  it('round-trips code block', async () => {
    const result = await to('org', await from('org', '#+BEGIN_SRC js\nconsole.log("hi")\n#+END_SRC'))
    expect(result).toContain('#+BEGIN_SRC js')
    expect(result).toContain('console.log("hi")')
    expect(result).toContain('#+END_SRC')
  })

  it('round-trips bullet list', async () => {
    const result = await to('org', await from('org', '- item one\n- item two'))
    expect(result).toContain('- item one')
    expect(result).toContain('- item two')
  })
})

// ─── Cross-format rendering ───────────────────────────────────────────────────

describe('to(html, from(org, ...))', () => {
  it('bold → <strong>', async () => {
    const html = (await to('html', await from('org', '*bold*'))).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('italic → <em>', async () => {
    const html = (await to('html', await from('org', '/italic/'))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('heading 1 → <h1>', async () => {
    const html = (await to('html', await from('org', '* Hello'))).trim()
    expect(html).toContain('<h1>Hello</h1>')
  })
})
