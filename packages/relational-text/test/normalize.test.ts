/**
 * Tests for normalizeMarkdown / normalizeHTML.
 *
 * Both functions are text-level whitespace normalizations — they do not
 * parse or re-render. The key property each satisfies:
 *
 *   normalizeMarkdown(x) === normalizeMarkdown(toMarkdown(fromMarkdown(x)))
 *   normalizeHTML(x)     === normalizeHTML(toHTML(fromHTML(x)))
 *
 * This lets you compare an original document against a round-tripped one
 * without caring about the insignificant whitespace differences the renderer
 * introduces (e.g. toMarkdown always appends \n\n after each block).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'
import { normalizeMarkdown, normalizeHTML } from './test-utils.js'

beforeAll(() => {
  registerTestFormats('markdown', 'html')
})

// ─── normalizeMarkdown ────────────────────────────────────────────────────────

describe('normalizeMarkdown — what it normalizes', () => {
  it('removes trailing blank line', () => {
    expect(normalizeMarkdown('# Hello World\n\n')).toBe('# Hello World\n')
  })

  it('removes multiple trailing blank lines', () => {
    expect(normalizeMarkdown('paragraph\n\n\n\n')).toBe('paragraph\n')
  })

  it('strips trailing whitespace from each line', () => {
    expect(normalizeMarkdown('line one   \nline two\t\n')).toBe('line one\nline two\n')
  })

  it('collapses 3+ consecutive newlines to one blank line', () => {
    expect(normalizeMarkdown('a\n\n\n\nb')).toBe('a\n\nb\n')
    expect(normalizeMarkdown('a\n\n\nb')).toBe('a\n\nb\n')
  })

  it('preserves a single blank line between blocks', () => {
    expect(normalizeMarkdown('paragraph one\n\nparagraph two\n')).toBe(
      'paragraph one\n\nparagraph two\n',
    )
  })

  it('removes leading blank lines', () => {
    expect(normalizeMarkdown('\n\n# Heading\n')).toBe('# Heading\n')
  })

  it('normalizes CRLF to LF', () => {
    expect(normalizeMarkdown('line one\r\nline two\r\n')).toBe('line one\nline two\n')
  })

  it('ensures exactly one trailing newline when none is present', () => {
    expect(normalizeMarkdown('no newline')).toBe('no newline\n')
  })
})

describe('normalizeMarkdown — what it does NOT change', () => {
  it('does not alter heading syntax', () => {
    expect(normalizeMarkdown('# Heading\n')).toBe('# Heading\n')
    expect(normalizeMarkdown('## Heading\n')).toBe('## Heading\n')
  })

  it('does not convert __bold__ to **bold**', () => {
    expect(normalizeMarkdown('__bold__\n')).toBe('__bold__\n')
  })

  it('does not convert _italic_ to *italic*', () => {
    expect(normalizeMarkdown('_italic_\n')).toBe('_italic_\n')
  })

  it('does not alter list markers', () => {
    expect(normalizeMarkdown('- item\n')).toBe('- item\n')
    expect(normalizeMarkdown('* item\n')).toBe('* item\n')
  })

  it('preserves inline formatting and code', () => {
    expect(normalizeMarkdown('**bold** and `code`\n')).toBe('**bold** and `code`\n')
  })

  it('preserves fenced code block content', () => {
    const block = '```ts\nconst x = 1\n```\n'
    expect(normalizeMarkdown(block)).toBe(block)
  })

  it('is already idempotent on its own output', () => {
    const cases = [
      '# Heading\n',
      'paragraph one\n\nparagraph two\n',
      '- a\n- b\n',
      '```ts\ncode\n```\n',
    ]
    for (const c of cases) {
      expect(normalizeMarkdown(c)).toBe(c)
    }
  })
})

describe('normalizeMarkdown — stable round-trip property', () => {
  /**
   * The core property: normalizeMarkdown(x) === normalizeMarkdown(toMarkdown(fromMarkdown(x)))
   *
   * The renderer appends \n\n after each block. normalizeMarkdown strips those
   * trailing blank lines so both sides compare equal.
   */
  async function assertRoundTripStable(input: string): Promise<void> {
    const roundTripped = await to('markdown', await from('markdown', input))
    expect(normalizeMarkdown(roundTripped)).toBe(normalizeMarkdown(input))
  }

  it('heading', () => assertRoundTripStable('# Hello World\n'))
  it('paragraph', () => assertRoundTripStable('A simple paragraph.\n'))
  it('bold inline', () => assertRoundTripStable('**bold** text\n'))
  it('italic inline', () => assertRoundTripStable('*italic* text\n'))
  it('inline code', () => assertRoundTripStable('Use `console.log()`.\n'))
  it('strikethrough', () => assertRoundTripStable('~~struck~~\n'))
  it('link', () => assertRoundTripStable('[Example](https://example.com)\n'))
  it('unordered list', () => assertRoundTripStable('- one\n- two\n- three\n'))
  it('ordered list', () => assertRoundTripStable('1. first\n2. second\n3. third\n'))
  it('blockquote', () => assertRoundTripStable('> A quoted line.\n'))
  it('fenced code block', () => assertRoundTripStable('```ts\nconst x = 1\n```\n'))
  it('horizontal rule', () => assertRoundTripStable('---\n'))
  it('GFM table', () => assertRoundTripStable('| A | B |\n| --- | --- |\n| 1 | 2 |\n'))
  it('bold wrapping inline code', () => assertRoundTripStable('**`code` and text.**\n'))
  it('italic wrapping bold', () => assertRoundTripStable('*text and **bold** more*\n'))
  it('nested list', () => assertRoundTripStable('1. Parent\n   - Child one\n   - Child two\n'))
  it('multi-block document', async () => {
    await assertRoundTripStable('# Title\n\nFirst paragraph.\n\nSecond paragraph.\n')
  })
  it('blockquote with multiple paragraphs', async () => {
    // round-trip may change loose to tight or normalize blank lines inside blockquote
    const input = '> First.\n>\n> Second.\n'
    await assertRoundTripStable(input)
  })
})

// ─── normalizeHTML ────────────────────────────────────────────────────────────

describe('normalizeHTML — what it normalizes', () => {
  it('removes trailing blank line', () => {
    expect(normalizeHTML('<p>Hello</p>\n\n')).toBe('<p>Hello</p>\n')
  })

  it('collapses whitespace between elements', () => {
    expect(normalizeHTML('<p>one</p>\n\n<p>two</p>\n')).toBe('<p>one</p><p>two</p>\n')
    expect(normalizeHTML('<p>one</p>   <p>two</p>\n')).toBe('<p>one</p><p>two</p>\n')
  })

  it('strips trailing whitespace from each line', () => {
    expect(normalizeHTML('<p>text</p>   \n')).toBe('<p>text</p>\n')
  })

  it('removes leading blank lines', () => {
    expect(normalizeHTML('\n\n<p>text</p>\n')).toBe('<p>text</p>\n')
  })

  it('normalizes CRLF to LF', () => {
    expect(normalizeHTML('<p>a</p>\r\n<p>b</p>\r\n')).toBe('<p>a</p><p>b</p>\n')
  })

  it('ensures exactly one trailing newline when none is present', () => {
    expect(normalizeHTML('<p>text</p>')).toBe('<p>text</p>\n')
  })
})

describe('normalizeHTML — what it does NOT change', () => {
  it('does not alter tag names or attributes', () => {
    expect(normalizeHTML('<h2 class="title">Text</h2>\n')).toBe(
      '<h2 class="title">Text</h2>\n',
    )
  })

  it('does not alter text content', () => {
    expect(normalizeHTML('<p>Hello &amp; world</p>\n')).toBe('<p>Hello &amp; world</p>\n')
  })

  it('is already idempotent on its own output', () => {
    const cases = [
      '<h1>Title</h1>\n',
      '<p>paragraph</p>\n',
      '<ul><li>item</li></ul>\n',
      '<pre><code>code</code></pre>\n',
    ]
    for (const c of cases) {
      expect(normalizeHTML(c)).toBe(c)
    }
  })
})

describe('normalizeHTML — stable round-trip property', () => {
  /**
   * The core property: normalizeHTML(x) === normalizeHTML(toHTML(fromHTML(x)))
   *
   * normalizeHTML collapses inter-tag whitespace (>\s+< → ><) so that compact
   * arbitrary HTML and the renderer's equivalent output compare equal even when
   * they differ structurally (e.g. <ul><li>a</li></ul> vs <ul>\n<li>a</li>\n</ul>\n).
   */
  async function assertRoundTripStable(input: string): Promise<void> {
    const roundTripped = await to('html', await from('html', input))
    expect(normalizeHTML(roundTripped)).toBe(normalizeHTML(input))
  }

  it('paragraph', () => assertRoundTripStable('<p>Hello world</p>'))
  it('heading', () => assertRoundTripStable('<h2>Section</h2>'))
  it('bold', () => assertRoundTripStable('<p><strong>bold</strong></p>'))
  it('italic', () => assertRoundTripStable('<p><em>italic</em></p>'))
  it('inline code', () => assertRoundTripStable('<p><code>code</code></p>'))
  it('strikethrough', () => assertRoundTripStable('<p><s>struck</s></p>'))
  it('link', () => assertRoundTripStable('<p><a href="https://example.com">text</a></p>'))
  it('unordered list', () => assertRoundTripStable('<ul><li>a</li><li>b</li></ul>'))
  it('ordered list', () => assertRoundTripStable('<ol><li>first</li><li>second</li></ol>'))
  it('blockquote', () => assertRoundTripStable('<blockquote><p>quote</p></blockquote>'))
  it('code block with language', async () => {
    const roundTripped = await to('html', await from('html', '<pre><code class="language-ts">const x = 1</code></pre>'))
    expect(roundTripped).toContain('const x = 1')
    expect(roundTripped).toMatch(/<code[^>]*language-ts/)
  })
  it('horizontal rule', () => assertRoundTripStable('<hr />'))
  it('table', async () => {
    await assertRoundTripStable(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    )
  })
  it('bold wrapping italic', async () => {
    // org.w3c.html.facet#em < org.w3c.html.facet#strong alphabetically,
    // so em is the outer wrapper in the canonical normalized form.
    await assertRoundTripStable('<p><em><strong>bold italic</strong></em></p>')
  })
  it('multi-block document', async () => {
    await assertRoundTripStable('<h1>Title</h1><p>First.</p><p>Second.</p>')
  })
  it('extra whitespace between elements is absorbed', async () => {
    // Whitespace-only text between block elements: fromHTML drops it;
    // normalizeHTML (>\s+< → ><) makes both sides match.
    await assertRoundTripStable('<p>one</p>   <p>two</p>')
  })
})
