import { describe, it, expect, beforeAll } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('gitlab', 'html')
})

// ─── fromGitLab — inline marks ────────────────────────────────────────────────

describe('fromGitLab — inline marks', () => {
  it('parses bold mark (**text**)', async () => {
    const doc = await from('gitlab', '**hello**')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.gitlab.facet#strong'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('hello')
      }
    }
  })

  it('parses emphasis mark (*text*)', async () => {
    const doc = await from('gitlab', '*italic*')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.gitlab.facet#emphasis'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('italic')
      }
    }
  })

  it('parses emphasis mark (_text_)', async () => {
    const doc = await from('gitlab', '_italic_')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.gitlab.facet#emphasis'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses strikethrough mark (~~text~~)', async () => {
    const doc = await from('gitlab', '~~struck~~')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.gitlab.facet#strikethrough'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('struck')
      }
    }
  })

  it('parses ins mark ({+text+})', async () => {
    const doc = await from('gitlab', '{+inserted+}')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.gitlab.facet#ins'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('inserted')
      }
    }
  })

  it('parses del mark ({-text-})', async () => {
    const doc = await from('gitlab', '{-deleted-}')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.gitlab.facet#del'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('deleted')
      }
    }
  })

  it('parses math inline ($text$)', async () => {
    const doc = await from('gitlab', '$E=mc^2$')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.gitlab.facet#math-inline'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('E=mc^2')
      }
    }
  })

  it('parses code-span mark (`text`)', async () => {
    const doc = await from('gitlab', '`code`')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.gitlab.facet#code-span'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('code')
      }
    }
  })

  it('parses link ([text](url))', async () => {
    const doc = await from('gitlab', '[click here](https://gitlab.com)')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.gitlab.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('click here')
        const linkMark = seg.marks.find((m) => m.kind === 'com.gitlab.facet#link')
        expect(linkMark?.attrs['uri']).toBe('https://gitlab.com')
      }
    }
  })

  it('parses @mention', async () => {
    const doc = await from('gitlab', '@alice')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.gitlab.facet#mention'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mentionMark = seg.marks.find((m) => m.kind === 'com.gitlab.facet#mention')
        expect(mentionMark?.attrs['handle']).toBe('alice')
      }
    }
  })

  it('parses #123 issue reference', async () => {
    const doc = await from('gitlab', '#42')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.gitlab.facet#issue-ref'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const issueMark = seg.marks.find((m) => m.kind === 'com.gitlab.facet#issue-ref')
        expect(issueMark?.attrs['number']).toBe(42)
      }
    }
  })

  it('parses !123 MR reference', async () => {
    const doc = await from('gitlab', '!99')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.gitlab.facet#mr-ref'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const mrMark = seg.marks.find((m) => m.kind === 'com.gitlab.facet#mr-ref')
        expect(mrMark?.attrs['number']).toBe(99)
      }
    }
  })

  it('parses footnote reference ([^key])', async () => {
    const doc = await from('gitlab', 'See note[^1]')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.gitlab.facet#footnote-ref'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        const fnMark = seg.marks.find((m) => m.kind === 'com.gitlab.facet#footnote-ref')
        expect(fnMark?.attrs['key']).toBe('1')
      }
    }
  })
})

// ─── fromGitLab — block types ─────────────────────────────────────────────────

describe('fromGitLab — block types', () => {
  it('parses # Heading as heading level 1', async () => {
    const doc = await from('gitlab', '# Hello World')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(1)
    }
  })

  it('parses ## Heading as heading level 2', async () => {
    const doc = await from('gitlab', '## Section')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(2)
    }
  })

  it('parses ### Heading as heading level 3', async () => {
    const doc = await from('gitlab', '### Sub')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(3)
    }
  })

  it('parses plain text as paragraph block', async () => {
    const doc = await from('gitlab', 'Hello, world!')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('paragraph')
    }
  })

  it('parses - item as bullet list structure', async () => {
    const doc = await from('gitlab', '- item one\n- item two')
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
    const doc = await from('gitlab', '1. first\n2. second')
    const hir = doc.toHIR()
    const olContainer = hir.find((n) => n.type === 'container' && n.name === 'ol')
    expect(olContainer).toBeDefined()
  })

  it('parses task list - [ ] as list-item-text with checked=false', async () => {
    const doc = await from('gitlab', '- [ ] todo item')
    const hir = doc.toHIR()
    const ulContainer = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainer).toBeDefined()
    if (ulContainer?.type === 'container') {
      const findListItemText = (nodes: typeof ulContainer.children): typeof ulContainer.children[0] | undefined =>
        nodes.find((n) => {
          if (n.type === 'block' && n.name === 'list-item-text') return true
          if (n.type === 'container') return findListItemText(n.children) !== undefined
          return false
        })
      const item = findListItemText(ulContainer.children)
      expect(item).toBeDefined()
      if (item?.type === 'block') {
        expect(item.attrs['checked']).toBe(false)
      }
    }
  })

  it('parses task list - [x] as list-item-text with checked=true', async () => {
    const doc = await from('gitlab', '- [x] done item')
    const hir = doc.toHIR()
    const ulContainer = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainer).toBeDefined()
    if (ulContainer?.type === 'container') {
      const findListItemText = (nodes: typeof ulContainer.children): typeof ulContainer.children[0] | undefined =>
        nodes.find((n) => {
          if (n.type === 'block' && n.name === 'list-item-text') return true
          if (n.type === 'container') return findListItemText(n.children) !== undefined
          return false
        })
      const item = findListItemText(ulContainer.children)
      expect(item).toBeDefined()
      if (item?.type === 'block') {
        expect(item.attrs['checked']).toBe(true)
      }
    }
  })

  it('parses fenced code block with language', async () => {
    const doc = await from('gitlab', '```ruby\nputs "hello"\n```')
    const hir = doc.toHIR()
    const codeBlock = hir.find((n) => n.type === 'block' && n.name === 'code-block')
    expect(codeBlock).toBeDefined()
    if (codeBlock?.type === 'block') {
      expect(codeBlock.attrs['language']).toBe('ruby')
      const code = codeBlock.children
        .filter((c) => c.type === 'text')
        .map((c) => (c.type === 'text' ? c.content : ''))
        .join('')
      expect(code).toContain('puts "hello"')
    }
  })

  it('parses > quote as blockquote structure', async () => {
    const doc = await from('gitlab', '> quoted text')
    const hir = doc.toHIR()
    const blockquote = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(blockquote).toBeDefined()
  })

  it('parses --- as horizontal-rule block', async () => {
    const doc = await from('gitlab', '---')
    const hir = doc.toHIR()
    const hr = hir.find((n) => n.type === 'block' && n.name === 'horizontal-rule')
    expect(hr).toBeDefined()
  })

  it('parses $$ math block fences', async () => {
    const doc = await from('gitlab', '$$\nE = mc^2\n$$')
    const hir = doc.toHIR()
    const mathBlock = hir.find((n) => n.type === 'block' && n.name === 'math-block')
    expect(mathBlock).toBeDefined()
    if (mathBlock?.type === 'block') {
      const content = mathBlock.children
        .filter((c) => c.type === 'text')
        .map((c) => (c.type === 'text' ? c.content : ''))
        .join('')
      expect(content).toContain('E = mc^2')
    }
  })

  it('parses [^key]: text as footnote-def block', async () => {
    const doc = await from('gitlab', '[^1]: footnote content')
    const hir = doc.toHIR()
    const fnDef = hir.find((n) => n.type === 'block' && n.name === 'footnote-def')
    expect(fnDef).toBeDefined()
    if (fnDef?.type === 'block') {
      expect(fnDef.attrs['key']).toBe('1')
    }
  })
})

// ─── toGitLab — round-trips ───────────────────────────────────────────────────

describe('toGitLab — round-trip', () => {
  it('round-trips bold text', async () => {
    const result = await to('gitlab', await from('gitlab', '**bold**'))
    expect(result).toBe('**bold**\n')
  })

  it('round-trips emphasis text', async () => {
    const result = await to('gitlab', await from('gitlab', '*italic*'))
    expect(result).toBe('*italic*\n')
  })

  it('round-trips strikethrough', async () => {
    const result = await to('gitlab', await from('gitlab', '~~struck~~'))
    expect(result).toBe('~~struck~~\n')
  })

  it('round-trips ins ({+text+})', async () => {
    const result = await to('gitlab', await from('gitlab', '{+inserted+}'))
    expect(result).toBe('{+inserted+}\n')
  })

  it('round-trips del ({-text-})', async () => {
    const result = await to('gitlab', await from('gitlab', '{-deleted-}'))
    expect(result).toBe('{-deleted-}\n')
  })

  it('round-trips math inline ($text$)', async () => {
    const result = await to('gitlab', await from('gitlab', '$x^2$'))
    expect(result).toBe('$x^2$\n')
  })

  it('round-trips code-span', async () => {
    const result = await to('gitlab', await from('gitlab', '`code`'))
    expect(result).toBe('`code`\n')
  })

  it('round-trips heading level 1', async () => {
    const result = await to('gitlab', await from('gitlab', '# My Heading'))
    expect(result).toBe('# My Heading\n')
  })

  it('round-trips heading level 2', async () => {
    const result = await to('gitlab', await from('gitlab', '## Section'))
    expect(result).toBe('## Section\n')
  })

  it('round-trips code block with language', async () => {
    const result = await to('gitlab', await from('gitlab', '```ruby\nputs "hi"\n```'))
    expect(result).toContain('```ruby')
    expect(result).toContain('puts "hi"')
    expect(result).toContain('```')
  })

  it('round-trips task list unchecked', async () => {
    const result = await to('gitlab', await from('gitlab', '- [ ] todo'))
    expect(result).toContain('- [ ] todo')
  })

  it('round-trips task list checked', async () => {
    const result = await to('gitlab', await from('gitlab', '- [x] done'))
    expect(result).toContain('- [x] done')
  })

  it('round-trips bullet list', async () => {
    const result = await to('gitlab', await from('gitlab', '- item one\n- item two'))
    expect(result).toContain('- item one')
    expect(result).toContain('- item two')
  })

  it('round-trips ordered list', async () => {
    const result = await to('gitlab', await from('gitlab', '1. first\n2. second'))
    expect(result).toMatch(/1\. first/)
    expect(result).toMatch(/2\. second/)
  })

  it('round-trips horizontal rule', async () => {
    const result = await to('gitlab', await from('gitlab', '---'))
    expect(result).toBe('---\n')
  })

  it('round-trips math block', async () => {
    const result = await to('gitlab', await from('gitlab', '$$\nE = mc^2\n$$'))
    expect(result).toContain('$$')
    expect(result).toContain('E = mc^2')
  })

  it('round-trips footnote def', async () => {
    const result = await to('gitlab', await from('gitlab', '[^1]: this is the footnote'))
    expect(result).toContain('[^1]:')
    expect(result).toContain('this is the footnote')
  })
})

// ─── Cross-format rendering ───────────────────────────────────────────────────

describe('to(html, from(gitlab, ...))', () => {
  it('bold → <strong>', async () => {
    const html = (await to('html', await from('gitlab', '**bold**'))).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('emphasis → <em>', async () => {
    const html = (await to('html', await from('gitlab', '*italic*'))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('strikethrough → <s>', async () => {
    const html = (await to('html', await from('gitlab', '~~struck~~'))).trim()
    expect(html).toContain('<s>struck</s>')
  })

  it('ins → <ins> (via lens: ins→insertion)', async () => {
    const html = (await to('html', await from('gitlab', '{+inserted+}'))).trim()
    expect(html).toContain('<ins>inserted</ins>')
  })

  it('del → <del> (via lens: del→deletion)', async () => {
    const html = (await to('html', await from('gitlab', '{-deleted-}'))).trim()
    expect(html).toContain('<del>deleted</del>')
  })

  it('code-span → <code>', async () => {
    const html = (await to('html', await from('gitlab', '`code`'))).trim()
    expect(html).toContain('<code>code</code>')
  })

  it('heading 1 → <h1>', async () => {
    const html = (await to('html', await from('gitlab', '# Hello'))).trim()
    expect(html).toContain('<h1>Hello</h1>')
  })

  it('heading 2 → <h2>', async () => {
    const html = (await to('html', await from('gitlab', '## World'))).trim()
    expect(html).toContain('<h2>World</h2>')
  })

  it('bullet list → <ul><li>', async () => {
    const html = (await to('html', await from('gitlab', '- item'))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })

  it('ordered list → <ol><li>', async () => {
    const html = (await to('html', await from('gitlab', '1. first'))).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
    expect(html).toContain('first')
  })

  it('code block → <pre><code>', async () => {
    const html = (await to('html', await from('gitlab', '```\nconst x = 1\n```'))).trim()
    expect(html).toContain('<pre><code>')
    expect(html).toContain('const x = 1')
  })

  it('paragraph → <p>', async () => {
    const html = (await to('html', await from('gitlab', 'plain text'))).trim()
    expect(html).toContain('<p>plain text</p>')
  })

  it('blockquote → <blockquote>', async () => {
    const html = (await to('html', await from('gitlab', '> quoted text'))).trim()
    expect(html).toContain('<blockquote>')
    expect(html).toContain('quoted text')
  })

  it('horizontal rule → <hr />', async () => {
    const html = (await to('html', await from('gitlab', '---'))).trim()
    expect(html).toContain('<hr')
  })
})
