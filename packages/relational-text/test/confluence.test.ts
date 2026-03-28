import { describe, it, expect, beforeAll } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('confluence', 'jira', 'html')
})

// ─── fromConfluence — inline marks ────────────────────────────────────────────

describe('fromConfluence — inline marks', () => {
  it('parses bold mark (*text*)', async () => {
    const doc = await from('confluence', '*hello*')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.atlassian.wiki.facet#bold'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('hello')
      }
    }
  })

  it('parses italic mark (_text_)', async () => {
    const doc = await from('confluence', '_italic_')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.atlassian.wiki.facet#italic'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('italic')
      }
    }
  })

  it('parses underline mark (+text+)', async () => {
    const doc = await from('confluence', '+underline+')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.atlassian.wiki.facet#underline'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('underline')
      }
    }
  })

  it('parses strikethrough mark (-text-)', async () => {
    const doc = await from('confluence', '-struck-')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.atlassian.wiki.facet#strikethrough'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('struck')
      }
    }
  })

  it('parses superscript mark (^text^)', async () => {
    const doc = await from('confluence', '^sup^')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.atlassian.wiki.facet#superscript'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('sup')
      }
    }
  })

  it('parses subscript mark (~text~)', async () => {
    const doc = await from('confluence', '~sub~')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.atlassian.wiki.facet#subscript'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('sub')
      }
    }
  })

  it('parses monospace mark ({{text}})', async () => {
    const doc = await from('confluence', '{{mono}}')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.atlassian.wiki.facet#monospace'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('mono')
      }
    }
  })

  it('parses link with display text ([text|url])', async () => {
    const doc = await from('confluence', '[click here|https://example.com]')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.atlassian.wiki.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('click here')
        const linkMark = seg.marks.find((m) => m.kind === 'com.atlassian.wiki.facet#link')
        expect(linkMark?.attrs['uri']).toBe('https://example.com')
      }
    }
  })

  it('parses bare link ([url])', async () => {
    const doc = await from('confluence', '[https://example.com]')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.atlassian.wiki.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('https://example.com')
      }
    }
  })
})

// ─── fromConfluence — block types ─────────────────────────────────────────────

describe('fromConfluence — block types', () => {
  it('parses h1. Heading as heading level 1', async () => {
    const doc = await from('confluence', 'h1. Hello World')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(1)
    }
  })

  it('parses h2. Heading as heading level 2', async () => {
    const doc = await from('confluence', 'h2. Section')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(2)
    }
  })

  it('parses h3. Heading as heading level 3', async () => {
    const doc = await from('confluence', 'h3. Subsection')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(3)
    }
  })

  it('parses plain text as paragraph block', async () => {
    const doc = await from('confluence', 'Hello, world!')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('paragraph')
    }
  })

  it('parses * item as bullet list structure', async () => {
    const doc = await from('confluence', '* item one\n* item two')
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

  it('parses ** nested item as nested bullet list', async () => {
    const doc = await from('confluence', '* item\n** nested')
    const hir = doc.toHIR()
    const ulContainer = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainer).toBeDefined()
  })

  it('parses # item as ordered list structure', async () => {
    const doc = await from('confluence', '# first\n# second')
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

  it('parses {code:js} block with language', async () => {
    const doc = await from('confluence', '{code:js}\nconsole.log("hi")\n{code}')
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      expect(codeBlock.attrs['language']).toBe('js')
      const code = codeBlock.children
        .filter((c) => c.type === 'text')
        .map((c) => (c.type === 'text' ? c.content : ''))
        .join('')
      expect(code).toContain('console.log("hi")')
    }
  })

  it('parses {code} block without language', async () => {
    const doc = await from('confluence', '{code}\nsome code\n{code}')
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      expect(codeBlock.attrs['language']).toBeUndefined()
    }
  })

  it('parses > quote as blockquote structure', async () => {
    const doc = await from('confluence', '> quoted text')
    const hir = doc.toHIR()
    const blockquote = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(blockquote).toBeDefined()
  })

  it('parses {note} admonition block', async () => {
    const doc = await from('confluence', '{note}\nThis is a note\n{note}')
    const hir = doc.toHIR()
    const admonition = hir.find((n) => n.type === 'block' && n.name === 'admonition')
    expect(admonition).toBeDefined()
    if (admonition?.type === 'block') {
      expect(admonition.attrs['type']).toBe('note')
    }
  })

  it('parses {warning} admonition block', async () => {
    const doc = await from('confluence', '{warning}\nBe careful\n{warning}')
    const hir = doc.toHIR()
    const admonition = hir.find((n) => n.type === 'block' && n.name === 'admonition')
    expect(admonition).toBeDefined()
    if (admonition?.type === 'block') {
      expect(admonition.attrs['type']).toBe('warning')
    }
  })

  it('parses ---- as horizontal-rule block', async () => {
    const doc = await from('confluence', '----')
    const hir = doc.toHIR()
    const hr = hir.find((n) => n.type === 'block' && n.name === 'horizontal-rule')
    expect(hr).toBeDefined()
  })
})

// ─── fromJIRA — JIRA-specific syntax ─────────────────────────────────────────

describe('fromJIRA — JIRA-specific syntax', () => {
  it('parses bq. blockquote (JIRA syntax)', async () => {
    const doc = await from('jira', 'bq. This is a blockquote')
    const hir = doc.toHIR()
    const blockquote = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(blockquote).toBeDefined()
  })

  it('fromJIRA produces same result as fromConfluence for shared syntax', async () => {
    const doc1 = await from('jira', '*bold* and _italic_')
    const doc2 = await from('confluence', '*bold* and _italic_')
    expect(doc1.toString()).toBe(doc2.toString())
  })
})

// ─── toConfluence — round-trips ───────────────────────────────────────────────

describe('toConfluence — round-trip', () => {
  it('round-trips bold text', async () => {
    const result = await to('confluence', await from('confluence', '*bold*'))
    expect(result).toBe('*bold*')
  })

  it('round-trips italic text', async () => {
    const result = await to('confluence', await from('confluence', '_italic_'))
    expect(result).toBe('_italic_')
  })

  it('round-trips heading level 1', async () => {
    const result = await to('confluence', await from('confluence', 'h1. My Heading'))
    expect(result).toBe('h1. My Heading')
  })

  it('round-trips heading level 2', async () => {
    const result = await to('confluence', await from('confluence', 'h2. Section'))
    expect(result).toBe('h2. Section')
  })

  it('round-trips code block with language', async () => {
    const result = await to('confluence', await from('confluence', '{code:python}\nprint("hello")\n{code}'))
    expect(result).toContain('{code:python}')
    expect(result).toContain('print("hello")')
    expect(result).toContain('{code}')
  })

  it('round-trips bullet list', async () => {
    const result = await to('confluence', await from('confluence', '* item one\n* item two'))
    expect(result).toContain('* item one')
    expect(result).toContain('* item two')
  })

  it('round-trips ordered list', async () => {
    const result = await to('confluence', await from('confluence', '# first\n# second'))
    expect(result).toContain('# first')
    expect(result).toContain('# second')
  })

  it('round-trips horizontal rule', async () => {
    const result = await to('confluence', await from('confluence', '----'))
    expect(result).toBe('----')
  })

  it('round-trips monospace', async () => {
    const result = await to('confluence', await from('confluence', '{{code here}}'))
    expect(result).toBe('{{code here}}')
  })

  it('round-trips underline', async () => {
    const result = await to('confluence', await from('confluence', '+underlined+'))
    expect(result).toBe('+underlined+')
  })

  it('round-trips strikethrough', async () => {
    const result = await to('confluence', await from('confluence', '-struck-'))
    expect(result).toBe('-struck-')
  })

  it('round-trips superscript', async () => {
    const result = await to('confluence', await from('confluence', '^sup^'))
    expect(result).toBe('^sup^')
  })

  it('round-trips subscript', async () => {
    const result = await to('confluence', await from('confluence', '~sub~'))
    expect(result).toBe('~sub~')
  })
})

// ─── toJIRA — alias ───────────────────────────────────────────────────────────

describe('toJIRA — alias for toConfluence', () => {
  it('toJIRA produces same output as toConfluence', async () => {
    const doc = await from('confluence', '*bold* _italic_')
    expect(await to('jira', doc)).toBe(await to('confluence', doc))
  })
})

// ─── Cross-format rendering ───────────────────────────────────────────────────

describe('to(html, from(confluence, ...))', () => {
  it('bold → <strong>', async () => {
    const html = (await to('html', await from('confluence', '*bold*'))).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('italic → <em>', async () => {
    const html = (await to('html', await from('confluence', '_italic_'))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('heading 2 → <h2>', async () => {
    const html = (await to('html', await from('confluence', 'h2. World'))).trim()
    expect(html).toContain('<h2>World</h2>')
  })

  it('code → <code>', async () => {
    const html = (await to('html', await from('confluence', '{{inline code}}'))).trim()
    expect(html).toContain('<code>inline code</code>')
  })

  it('strikethrough → <s>', async () => {
    const html = (await to('html', await from('confluence', '-struck-'))).trim()
    expect(html).toContain('<s>struck</s>')
  })

  it('bullet list → <ul><li>', async () => {
    const html = (await to('html', await from('confluence', '* item'))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })

  it('ordered list → <ol><li>', async () => {
    const html = (await to('html', await from('confluence', '# first'))).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
    expect(html).toContain('first')
  })

  it('code block → <pre><code>', async () => {
    const html = (await to('html', await from('confluence', '{code}\nconst x = 1\n{code}'))).trim()
    expect(html).toContain('<pre><code>')
    expect(html).toContain('const x = 1')
  })

  it('paragraph → <p>', async () => {
    const html = (await to('html', await from('confluence', 'plain text'))).trim()
    expect(html).toContain('<p>plain text</p>')
  })

  it('blockquote → <blockquote>', async () => {
    const html = (await to('html', await from('confluence', '> quoted text'))).trim()
    expect(html).toContain('<blockquote>')
  })
})
