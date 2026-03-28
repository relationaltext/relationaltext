import { describe, it, expect, beforeAll } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('discord', 'html')
})

// ─── fromDiscord — inline marks ───────────────────────────────────────────────

describe('fromDiscord — inline marks', () => {
  it('parses bold mark (**text**)', async () => {
    const doc = await from('discord', '**hello**')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.discord.facet#bold'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('hello')
      }
    }
  })

  it('parses italic mark (*text*)', async () => {
    const doc = await from('discord', '*italic*')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.discord.facet#italic'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('italic')
      }
    }
  })

  it('parses italic mark (_text_)', async () => {
    const doc = await from('discord', '_italic_')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.discord.facet#italic'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses underline mark (__text__)', async () => {
    const doc = await from('discord', '__underline__')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.discord.facet#underline'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('underline')
      }
    }
  })

  it('parses strikethrough mark (~~text~~)', async () => {
    const doc = await from('discord', '~~strike~~')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.discord.facet#strikethrough'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('strike')
      }
    }
  })

  it('parses code mark (`text`)', async () => {
    const doc = await from('discord', '`code`')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.discord.facet#code'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('code')
      }
    }
  })

  it('parses spoiler mark (||text||)', async () => {
    const doc = await from('discord', '||spoiler||')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.discord.facet#spoiler'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('spoiler')
      }
    }
  })

  it('parses link ([text](url))', async () => {
    const doc = await from('discord', '[click here](https://example.com)')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'com.discord.facet#link'),
      )
      expect(seg).toBeDefined()
      if (seg?.type === 'text') {
        expect(seg.content).toBe('click here')
        const linkMark = seg.marks.find((m) => m.kind === 'com.discord.facet#link')
        expect(linkMark?.attrs['href']).toBe('https://example.com')
      }
    }
  })
})

// ─── fromDiscord — block types ────────────────────────────────────────────────

describe('fromDiscord — block types', () => {
  it('parses # Heading as heading level 1', async () => {
    const doc = await from('discord', '# Hello World')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(1)
    }
  })

  it('parses ## Heading as heading level 2', async () => {
    const doc = await from('discord', '## Section')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(2)
    }
  })

  it('parses ### Heading as heading level 3', async () => {
    const doc = await from('discord', '### Subsection')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('heading')
      expect(hir[0]!.attrs['level']).toBe(3)
    }
  })

  it('parses plain text as paragraph block', async () => {
    const doc = await from('discord', 'Hello, world!')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('paragraph')
    }
  })

  it('parses - item as bullet list structure', async () => {
    const doc = await from('discord', '- item one\n- item two')
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

  it('parses * item as bullet list structure', async () => {
    const doc = await from('discord', '* item')
    const hir = doc.toHIR()
    const ulContainer = hir.find((n) => n.type === 'container' && n.name === 'ul')
    expect(ulContainer).toBeDefined()
  })

  it('parses 1. item as ordered list structure', async () => {
    const doc = await from('discord', '1. first\n2. second')
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

  it('parses triple-backtick code block with language', async () => {
    const doc = await from('discord', '```python\nprint("hello")\n```')
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

  it('parses > quote as blockquote structure', async () => {
    const doc = await from('discord', '> quoted text')
    const hir = doc.toHIR()
    const blockquote = hir.find((n) => n.type === 'container' && n.name === 'blockquote')
    expect(blockquote).toBeDefined()
  })

  it('parses --- as horizontal-rule block', async () => {
    const doc = await from('discord', '---')
    const hir = doc.toHIR()
    const hr = hir.find((n) => n.type === 'block' && n.name === 'horizontal-rule')
    expect(hr).toBeDefined()
  })
})

// ─── toDiscord — round-trips ──────────────────────────────────────────────────

describe('toDiscord — round-trip', () => {
  it('round-trips bold text', async () => {
    const result = await to('discord', await from('discord', '**bold**'))
    expect(result).toBe('**bold**')
  })

  it('round-trips italic text', async () => {
    const result = await to('discord', await from('discord', '*italic*'))
    expect(result).toBe('*italic*')
  })

  it('round-trips heading level 1', async () => {
    const result = await to('discord', await from('discord', '# My Heading'))
    expect(result).toBe('# My Heading')
  })

  it('round-trips heading level 2', async () => {
    const result = await to('discord', await from('discord', '## Section'))
    expect(result).toBe('## Section')
  })

  it('round-trips code block', async () => {
    const result = await to('discord', await from('discord', '```js\nconsole.log("hi")\n```'))
    expect(result).toContain('```js')
    expect(result).toContain('console.log("hi")')
    expect(result).toContain('```')
  })

  it('round-trips strikethrough', async () => {
    const result = await to('discord', await from('discord', '~~struck~~'))
    expect(result).toBe('~~struck~~')
  })

  it('round-trips underline', async () => {
    const result = await to('discord', await from('discord', '__underlined__'))
    expect(result).toBe('__underlined__')
  })

  it('round-trips spoiler', async () => {
    const result = await to('discord', await from('discord', '||secret||'))
    expect(result).toBe('||secret||')
  })

  it('round-trips bullet list', async () => {
    const result = await to('discord', await from('discord', '- item one\n- item two'))
    expect(result).toContain('- item one')
    expect(result).toContain('- item two')
  })

  it('round-trips ordered list', async () => {
    const result = await to('discord', await from('discord', '1. first\n2. second'))
    expect(result).toMatch(/1\. first/)
    expect(result).toMatch(/2\. second/)
  })

  it('round-trips horizontal rule', async () => {
    const result = await to('discord', await from('discord', '---'))
    expect(result).toBe('---')
  })
})

// ─── Cross-format rendering ───────────────────────────────────────────────────

describe('to(html, from(discord, ...))', () => {
  it('bold → <strong>', async () => {
    const html = (await to('html', await from('discord', '**bold**'))).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('italic → <em>', async () => {
    const html = (await to('html', await from('discord', '*italic*'))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('heading 1 → <h1>', async () => {
    const html = (await to('html', await from('discord', '# Hello'))).trim()
    expect(html).toContain('<h1>Hello</h1>')
  })

  it('heading 2 → <h2>', async () => {
    const html = (await to('html', await from('discord', '## World'))).trim()
    expect(html).toContain('<h2>World</h2>')
  })

  it('code → <code>', async () => {
    const html = (await to('html', await from('discord', '`code`'))).trim()
    expect(html).toContain('<code>code</code>')
  })

  it('strikethrough → <s>', async () => {
    const html = (await to('html', await from('discord', '~~struck~~'))).trim()
    expect(html).toContain('<s>struck</s>')
  })

  it('bullet list → <ul><li>', async () => {
    const html = (await to('html', await from('discord', '- item'))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })

  it('ordered list → <ol><li>', async () => {
    const html = (await to('html', await from('discord', '1. first'))).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
    expect(html).toContain('first')
  })

  it('code block → <pre><code>', async () => {
    const html = (await to('html', await from('discord', '```\nconst x = 1\n```'))).trim()
    expect(html).toContain('<pre><code>')
    expect(html).toContain('const x = 1')
  })

  it('paragraph → <p>', async () => {
    const html = (await to('html', await from('discord', 'plain text'))).trim()
    expect(html).toContain('<p>plain text</p>')
  })
})
