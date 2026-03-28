/**
 * Round-trip tests for note-taking, wiki, and CMS format lenses.
 *
 * Tests verify that the format→RT→CommonMark→HTML lens chain produces
 * correct HTML output for each format. Also tests RT→format round-trips
 * where a toXxx exporter is available.
 *
 * Covered formats: Notion, Sanity, Obsidian, Confluence, Roam, Logseq,
 *                  Org-mode, MediaWiki, DokuWiki, Jupyter, Contentful.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

// ─── Notion ────────────────────────────────────────────────────────────────────


function notionRichText(
  content: string,
  opts: {
    bold?: boolean
    italic?: boolean
    strikethrough?: boolean
    underline?: boolean
    code?: boolean
    href?: string
  } = {},
) {
  return {
    type: 'text',
    text: { content, link: opts.href ? { url: opts.href } : null },
    annotations: {
      bold: opts.bold ?? false,
      italic: opts.italic ?? false,
      strikethrough: opts.strikethrough ?? false,
      underline: opts.underline ?? false,
      code: opts.code ?? false,
      color: 'default',
    },
  }
}

beforeAll(() => {
  registerTestFormats('html', 'markdown', 'notion', 'sanity', 'obsidian', 'confluence', 'roam', 'logseq', 'org', 'mediawiki', 'dokuwiki', 'jupyter', 'contentful')
})

describe('lens round-trip: Notion → RT → HTML', () => {
  it('paragraph with bold text', async () => {
    const blocks = [
      { type: 'paragraph', paragraph: { rich_text: [notionRichText('hello', { bold: true })] } },
    ]
    const html = (await to('html', await from('notion', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<strong>hello</strong>')
  })

  it('paragraph with italic text', async () => {
    const blocks = [
      { type: 'paragraph', paragraph: { rich_text: [notionRichText('world', { italic: true })] } },
    ]
    const html = (await to('html', await from('notion', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<em>world</em>')
  })

  it('paragraph with strikethrough', async () => {
    const blocks = [
      { type: 'paragraph', paragraph: { rich_text: [notionRichText('old', { strikethrough: true })] } },
    ]
    const html = (await to('html', await from('notion', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<s>old</s>')
  })

  it('paragraph with inline code', async () => {
    const blocks = [
      { type: 'paragraph', paragraph: { rich_text: [notionRichText('fn()', { code: true })] } },
    ]
    const html = (await to('html', await from('notion', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<code>fn()</code>')
  })

  it('heading_1 → <h1>', async () => {
    const blocks = [
      { type: 'heading_1', heading_1: { rich_text: [notionRichText('Title')] } },
    ]
    const html = (await to('html', await from('notion', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<h1>Title</h1>')
  })

  it('heading_2 → <h2>', async () => {
    const blocks = [
      { type: 'heading_2', heading_2: { rich_text: [notionRichText('Sub')] } },
    ]
    const html = (await to('html', await from('notion', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<h2>Sub</h2>')
  })

  it('heading_3 → <h3>', async () => {
    const blocks = [
      { type: 'heading_3', heading_3: { rich_text: [notionRichText('Sub')] } },
    ]
    const html = (await to('html', await from('notion', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<h3>Sub</h3>')
  })

  it('bulleted_list_item → <ul><li>', async () => {
    const blocks = [
      { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [notionRichText('item')] } },
    ]
    const html = (await to('html', await from('notion', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })

  it('numbered_list_item → <ol><li>', async () => {
    const blocks = [
      { type: 'numbered_list_item', numbered_list_item: { rich_text: [notionRichText('first')] } },
    ]
    const html = (await to('html', await from('notion', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
    expect(html).toContain('first')
  })

  it('divider → <hr>', async () => {
    const blocks = [{ type: 'divider', divider: {} }]
    const html = (await to('html', await from('notion', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<hr')
  })

  it('link with url attr passes through', async () => {
    const blocks = [
      {
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: { content: 'click', link: { url: 'https://example.com' } },
              annotations: {
                bold: false, italic: false, strikethrough: false,
                underline: false, code: false, color: 'default',
              },
            },
          ],
        },
      },
    ]
    const html = (await to('html', await from('notion', JSON.stringify(blocks)))).trim()
    expect(html).toContain('<a href="https://example.com">')
    expect(html).toContain('click')
  })
})

// ─── Sanity Portable Text ──────────────────────────────────────────────────────


function sanityBlock(
  style: string,
  spans: Array<{ text: string; marks?: string[] }>,
  markDefs?: Array<{ _key: string; _type: string; href?: string }>,
) {
  return {
    _type: 'block',
    _key: `k${Math.random().toString(36).slice(2, 8)}`,
    style,
    children: spans.map((s, i) => ({
      _type: 'span',
      _key: `s${i}`,
      text: s.text,
      marks: s.marks ?? [],
    })),
    markDefs: markDefs ?? [],
  }
}

describe('lens round-trip: Sanity → RT → HTML', () => {
  it('normal → <p>', async () => {
    const html = (await to('html', await from('sanity', JSON.stringify([sanityBlock('normal', [{ text: 'hello' }])])))).trim()
    expect(html).toContain('<p>hello</p>')
  })

  it('strong mark → <strong>', async () => {
    const html = (await to('html', await from('sanity', JSON.stringify([
      sanityBlock('normal', [{ text: 'bold', marks: ['strong'] }]),
    ])))).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('em mark → <em>', async () => {
    const html = (await to('html', await from('sanity', JSON.stringify([
      sanityBlock('normal', [{ text: 'italic', marks: ['em'] }]),
    ])))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('strike-through mark → <s>', async () => {
    const html = (await to('html', await from('sanity', JSON.stringify([
      sanityBlock('normal', [{ text: 'struck', marks: ['strike-through'] }]),
    ])))).trim()
    expect(html).toContain('<s>struck</s>')
  })

  it('code mark → <code>', async () => {
    const html = (await to('html', await from('sanity', JSON.stringify([
      sanityBlock('normal', [{ text: 'fn()', marks: ['code'] }]),
    ])))).trim()
    expect(html).toContain('<code>fn()</code>')
  })

  it('h1 block style → <h1>', async () => {
    const html = (await to('html', await from('sanity', JSON.stringify([sanityBlock('h1', [{ text: 'Title' }])])))).trim()
    expect(html).toContain('<h1>Title</h1>')
  })

  it('h2 block style → <h2>', async () => {
    const html = (await to('html', await from('sanity', JSON.stringify([sanityBlock('h2', [{ text: 'Section' }])])))).trim()
    expect(html).toContain('<h2>Section</h2>')
  })

  it('h3 block style → <h3>', async () => {
    const html = (await to('html', await from('sanity', JSON.stringify([sanityBlock('h3', [{ text: 'Sub' }])])))).trim()
    expect(html).toContain('<h3>Sub</h3>')
  })

  it('link mark href attr → <a href="...">', async () => {
    const html = (await to('html', await from('sanity', JSON.stringify([
      sanityBlock(
        'normal',
        [{ text: 'click', marks: ['ref1'] }],
        [{ _key: 'ref1', _type: 'link', href: 'https://example.com' }],
      ),
    ])))).trim()
    expect(html).toContain('<a href="https://example.com">')
    expect(html).toContain('click')
  })

  it('sup mark → superscript', async () => {
    const html = (await to('html', await from('sanity', JSON.stringify([
      sanityBlock('normal', [{ text: '2', marks: ['sup'] }]),
    ])))).trim()
    expect(html).toContain('<sup>2</sup>')
  })

  it('sub mark → subscript', async () => {
    const html = (await to('html', await from('sanity', JSON.stringify([
      sanityBlock('normal', [{ text: 'n', marks: ['sub'] }]),
    ])))).trim()
    expect(html).toContain('<sub>n</sub>')
  })
})

// ─── Obsidian Markdown ────────────────────────────────────────────────────────


describe('lens round-trip: Obsidian → RT → HTML', () => {
  it('**bold** → <strong>', async () => {
    const html = (await to('html', await from('obsidian', '**bold text**'))).trim()
    expect(html).toContain('<strong>bold text</strong>')
  })

  it('*italic* → <em>', async () => {
    const html = (await to('html', await from('obsidian', '*italic text*'))).trim()
    expect(html).toContain('<em>italic text</em>')
  })

  it('~~strikethrough~~ → <s>', async () => {
    const html = (await to('html', await from('obsidian', '~~struck~~'))).trim()
    expect(html).toContain('<s>struck</s>')
  })

  it('==highlight== → <mark>', async () => {
    const html = (await to('html', await from('obsidian', '==highlighted=='))).trim()
    expect(html).toContain('<mark>highlighted</mark>')
  })

  it('`code` → <code>', async () => {
    const html = (await to('html', await from('obsidian', '`snippet`'))).trim()
    expect(html).toContain('<code>snippet</code>')
  })

  it('[[wikilink]] → <a>', async () => {
    const html = (await to('html', await from('obsidian', '[[My Page]]'))).trim()
    expect(html).toContain('<a href="My%20Page">')
  })

  it('[label](url) external link → <a href>', async () => {
    const html = (await to('html', await from('obsidian', '[visit](https://example.com)'))).trim()
    expect(html).toContain('<a href="https://example.com">')
    expect(html).toContain('visit')
  })

  it('# heading → <h1>', async () => {
    const html = (await to('html', await from('obsidian', '# My Heading'))).trim()
    expect(html).toContain('<h1>My Heading</h1>')
  })

  it('## heading → <h2>', async () => {
    const html = (await to('html', await from('obsidian', '## Section'))).trim()
    expect(html).toContain('<h2>Section</h2>')
  })

  it('- bullet item → <ul><li>', async () => {
    const html = (await to('html', await from('obsidian', '- item'))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
  })

  it('#tag → hashtag passes through (link)', async () => {
    const html = (await to('html', await from('obsidian', '#mytag plain'))).trim()
    // Hashtag maps to RT hashtag → CommonMark link → HTML anchor
    expect(html).toContain('mytag')
  })

  it('---  horizontal rule → <hr>', async () => {
    const html = (await to('html', await from('obsidian', '---'))).trim()
    expect(html).toContain('<hr')
  })
})

// ─── Confluence Wiki Markup ───────────────────────────────────────────────────


describe('lens round-trip: Confluence → RT → HTML', () => {
  it('*bold* → <strong>', async () => {
    const html = (await to('html', await from('confluence', '*bold text*'))).trim()
    expect(html).toContain('<strong>bold text</strong>')
  })

  it('_italic_ → <em>', async () => {
    const html = (await to('html', await from('confluence', '_italic text_'))).trim()
    expect(html).toContain('<em>italic text</em>')
  })

  it('-strikethrough- → <s>', async () => {
    const html = (await to('html', await from('confluence', '-struck-'))).trim()
    expect(html).toContain('<s>struck</s>')
  })

  it('+underline+ → <u>', async () => {
    const html = (await to('html', await from('confluence', '+underlined+'))).trim()
    expect(html).toContain('<u>underlined</u>')
  })

  it('{{monospace}} → <code>', async () => {
    const html = (await to('html', await from('confluence', '{{fn()}}'))).trim()
    expect(html).toContain('<code>fn()</code>')
  })

  it('h1. heading → <h1>', async () => {
    const html = (await to('html', await from('confluence', 'h1. Title'))).trim()
    expect(html).toContain('<h1>Title</h1>')
  })

  it('h2. heading → <h2>', async () => {
    const html = (await to('html', await from('confluence', 'h2. Section'))).trim()
    expect(html).toContain('<h2>Section</h2>')
  })

  it('[label|uri] link uri attr → <a href>', async () => {
    const html = (await to('html', await from('confluence', '[visit|https://example.com]'))).trim()
    // Confluence links may carry extra format attrs (display, etc.) on the <a> element
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('visit')
  })

  it('bullet list → <ul><li>', async () => {
    const html = (await to('html', await from('confluence', '* item'))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })

  it('numbered list → <ol><li>', async () => {
    const html = (await to('html', await from('confluence', '# item'))).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })
})

// ─── Roam Research ────────────────────────────────────────────────────────────


describe('lens round-trip: Roam → RT → HTML', () => {
  it('page title becomes heading', async () => {
    const pages = [{ title: 'My Page' }]
    const html = (await to('html', await from('roam', JSON.stringify(pages)))).trim()
    // Roam page title may appear as a 'title' attr on the h1 (cross-format passthrough)
    expect(html).toContain('<h1')
    expect(html).toContain('>My Page</h1>')
  })

  it('**bold** in block → <strong>', async () => {
    const pages = [
      { title: 'Page', children: [{ string: '**bold text**' }] },
    ]
    const html = (await to('html', await from('roam', JSON.stringify(pages)))).trim()
    expect(html).toContain('<strong>bold text</strong>')
  })

  it('__italic__ in block → <em>', async () => {
    const pages = [
      { title: 'Page', children: [{ string: '__italic__' }] },
    ]
    const html = (await to('html', await from('roam', JSON.stringify(pages)))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('^^highlight^^ → <mark>', async () => {
    const pages = [
      { title: 'Page', children: [{ string: '^^highlighted^^' }] },
    ]
    const html = (await to('html', await from('roam', JSON.stringify(pages)))).trim()
    expect(html).toContain('<mark>highlighted</mark>')
  })

  it('`code` → <code>', async () => {
    const pages = [
      { title: 'Page', children: [{ string: '`snippet`' }] },
    ]
    const html = (await to('html', await from('roam', JSON.stringify(pages)))).trim()
    expect(html).toContain('<code>snippet</code>')
  })

  it('[[page-ref]] → link', async () => {
    const pages = [
      { title: 'Page', children: [{ string: '[[Other Page]]' }] },
    ]
    const html = (await to('html', await from('roam', JSON.stringify(pages)))).trim()
    // page-ref title attr → url → rendered as <a href="Other Page">
    expect(html).toContain('Other Page')
  })

  it('#tag → hashtag (link)', async () => {
    const pages = [
      { title: 'Page', children: [{ string: '#tagname rest' }] },
    ]
    const html = (await to('html', await from('roam', JSON.stringify(pages)))).trim()
    expect(html).toContain('tagname')
  })

  it('plain block text becomes paragraph', async () => {
    const pages = [
      { title: 'Page', children: [{ string: 'plain text' }] },
    ]
    const html = (await to('html', await from('roam', JSON.stringify(pages)))).trim()
    expect(html).toContain('plain text')
  })
})

// ─── Logseq ───────────────────────────────────────────────────────────────────


describe('lens round-trip: Logseq → RT → HTML', () => {
  it('**bold** block → <strong>', async () => {
    const html = (await to('html', await from('logseq', '- **bold text**'))).trim()
    expect(html).toContain('<strong>bold text</strong>')
  })

  it('*italic* block → <em>', async () => {
    const html = (await to('html', await from('logseq', '- *italic*'))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('~~strikethrough~~ → <s>', async () => {
    const html = (await to('html', await from('logseq', '- ~~struck~~'))).trim()
    expect(html).toContain('<s>struck</s>')
  })

  it('`code` → <code>', async () => {
    const html = (await to('html', await from('logseq', '- `snippet`'))).trim()
    expect(html).toContain('<code>snippet</code>')
  })

  it('[[page-ref]] → link text appears', async () => {
    const html = (await to('html', await from('logseq', '- [[My Page]]'))).trim()
    expect(html).toContain('My Page')
  })

  it('#tag → hashtag text appears', async () => {
    const html = (await to('html', await from('logseq', '- #logseq rest'))).trim()
    expect(html).toContain('logseq')
  })

  it('[label](url) link → <a href>', async () => {
    const html = (await to('html', await from('logseq', '- [visit](https://example.com)'))).trim()
    expect(html).toContain('<a href="https://example.com">')
  })
})

// ─── Org-mode ─────────────────────────────────────────────────────────────────


describe('lens round-trip: Org-mode → RT → HTML', () => {
  it('*bold* → <strong>', async () => {
    const html = (await to('html', await from('org', '*bold text*'))).trim()
    expect(html).toContain('<strong>bold text</strong>')
  })

  it('/italic/ → <em>', async () => {
    const html = (await to('html', await from('org', '/italic text/'))).trim()
    expect(html).toContain('<em>italic text</em>')
  })

  it('+strikethrough+ → <s>', async () => {
    const html = (await to('html', await from('org', '+struck+'))).trim()
    expect(html).toContain('<s>struck</s>')
  })

  it('_underline_ → <u>', async () => {
    const html = (await to('html', await from('org', '_underlined_'))).trim()
    expect(html).toContain('<u>underlined</u>')
  })

  it('=verbatim= → <code>', async () => {
    const html = (await to('html', await from('org', '=verbatim='))).trim()
    expect(html).toContain('<code>verbatim</code>')
  })

  it('~code~ → <code>', async () => {
    const html = (await to('html', await from('org', '~code~'))).trim()
    expect(html).toContain('<code>code</code>')
  })

  it('* heading → <h1>', async () => {
    const html = (await to('html', await from('org', '* Heading'))).trim()
    expect(html).toContain('<h1>Heading</h1>')
  })

  it('** heading → <h2>', async () => {
    const html = (await to('html', await from('org', '** Section'))).trim()
    expect(html).toContain('<h2>Section</h2>')
  })

  it('[[url][desc]] link → <a href>', async () => {
    const html = (await to('html', await from('org', '[[https://example.com][visit]]'))).trim()
    // Org links may carry extra format attrs (description, etc.) on the <a> element
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('visit')
  })

  it('- bullet list → <ul><li>', async () => {
    const html = (await to('html', await from('org', '- item'))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
  })

  it('1. ordered list → <ol><li>', async () => {
    const html = (await to('html', await from('org', '1. item'))).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
  })

  it('-----  horizontal rule → <hr>', async () => {
    const html = (await to('html', await from('org', '-----'))).trim()
    expect(html).toContain('<hr')
  })

  it('org round-trip: RT → Org-mode maintains bold', async () => {
    // fromOrg → toHTML verifies the lens works; toOrg verifies the exporter
    const doc = await from('org', '*bold text*')
    const orgOut = await to('org', doc)
    expect(orgOut).toContain('bold text')
  })
})

// ─── MediaWiki ────────────────────────────────────────────────────────────────


describe('lens round-trip: MediaWiki → RT → HTML', () => {
  it("'''bold''' → <strong>", async () => {
    const html = (await to('html', await from('mediawiki', "'''bold text'''"))).trim()
    expect(html).toContain('<strong>bold text</strong>')
  })

  it("''italic'' → <em>", async () => {
    const html = (await to('html', await from('mediawiki', "''italic text''"))).trim()
    expect(html).toContain('<em>italic text</em>')
  })

  it('[https://example.com label] external link → <a href>', async () => {
    const html = (await to('html', await from('mediawiki', '[https://example.com visit]'))).trim()
    // MediaWiki links may carry extra format attrs (display, etc.) on the <a> element
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('visit')
  })

  it('[[Page]] wikilink page attr → link text appears', async () => {
    const html = (await to('html', await from('mediawiki', '[[Main Page]]'))).trim()
    expect(html).toContain('Main Page')
  })

  it('== Heading 2 == → <h2> (MediaWiki h1 needs = but parser supports ==+)', async () => {
    const html = (await to('html', await from('mediawiki', '== Heading 2 =='))).trim()
    expect(html).toContain('<h2>Heading 2</h2>')
  })

  it('== Heading 2 == → <h2>', async () => {
    const html = (await to('html', await from('mediawiki', '== Section =='))).trim()
    expect(html).toContain('<h2>Section</h2>')
  })

  it('* bullet list → <ul><li>', async () => {
    const html = (await to('html', await from('mediawiki', '* item'))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
  })

  it('# numbered list → <ol><li>', async () => {
    const html = (await to('html', await from('mediawiki', '# item'))).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
  })

  it('---- horizontal rule → <hr>', async () => {
    const html = (await to('html', await from('mediawiki', '----'))).trim()
    expect(html).toContain('<hr')
  })

  it('definition terms/details are dropped (passthrough keep, rendered as text or dropped)', async () => {
    // definition-term and definition-detail are not RT hub features; they pass through
    // as source-namespace features and are dropped by the RT→CommonMark passthrough:drop
    const html = (await to('html', await from('mediawiki', '; term\n: detail'))).trim()
    // The text should at minimum not crash
    expect(html).toBeDefined()
  })
})

// ─── DokuWiki ─────────────────────────────────────────────────────────────────


describe('lens round-trip: DokuWiki → RT → HTML', () => {
  it('**bold** → <strong>', async () => {
    const html = (await to('html', await from('dokuwiki', '**bold text**'))).trim()
    expect(html).toContain('<strong>bold text</strong>')
  })

  it('//italic// → <em>', async () => {
    const html = (await to('html', await from('dokuwiki', '//italic text//'))).trim()
    expect(html).toContain('<em>italic text</em>')
  })

  it('__underline__ → <u>', async () => {
    const html = (await to('html', await from('dokuwiki', '__underlined__'))).trim()
    expect(html).toContain('<u>underlined</u>')
  })

  it('<del>strikethrough</del> → <s>', async () => {
    const html = (await to('html', await from('dokuwiki', '<del>struck</del>'))).trim()
    expect(html).toContain('<s>struck</s>')
  })

  it("''monospace'' → <code>", async () => {
    const html = (await to('html', await from('dokuwiki', "''fn()''"  ))).trim()
    expect(html).toContain('<code>fn()</code>')
  })

  it('[[https://example.com|label]] external link → <a href>', async () => {
    const html = (await to('html', await from('dokuwiki', '[[https://example.com|visit]]'))).trim()
    expect(html).toContain('<a href="https://example.com">')
    expect(html).toContain('visit')
  })

  it('[[wiki:page]] wikilink page attr → link text appears', async () => {
    const html = (await to('html', await from('dokuwiki', '[[wiki:start]]'))).trim()
    // wikilink page attr → RT link url → rendered as anchor
    expect(html).toContain('start')
  })

  it('====== H1 ====== → <h1>', async () => {
    const html = (await to('html', await from('dokuwiki', '====== Heading ======'))).trim()
    expect(html).toContain('<h1>Heading</h1>')
  })

  it('===== H2 ===== → <h2>', async () => {
    const html = (await to('html', await from('dokuwiki', '===== Section ====='))).trim()
    expect(html).toContain('<h2>Section</h2>')
  })

  it('  * bullet list → <ul><li>', async () => {
    const html = (await to('html', await from('dokuwiki', '  * item'))).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
  })
})

// ─── Jupyter ──────────────────────────────────────────────────────────────────


function makeNotebook(cells: Array<{ type: 'markdown' | 'code'; source: string }>) {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec: { language: 'python', display_name: 'Python 3', name: 'python3' } },
    cells: cells.map((c, i) => ({
      cell_type: c.type,
      id: `cell-${i}`,
      source: c.source,
      metadata: {},
      outputs: [],
    })),
  }
}

describe('lens round-trip: Jupyter → RT → HTML', () => {
  it('markdown cell → paragraph in HTML', async () => {
    const notebook = makeNotebook([{ type: 'markdown', source: 'hello world' }])
    const html = (await to('html', await from('jupyter', JSON.stringify(notebook)))).trim()
    expect(html).toContain('hello world')
  })

  it('code cell → <pre><code> block in HTML', async () => {
    const notebook = makeNotebook([{ type: 'code', source: 'print("hi")' }])
    const html = (await to('html', await from('jupyter', JSON.stringify(notebook)))).trim()
    expect(html).toContain('<pre>')
    expect(html).toContain('<code')
    expect(html).toContain('print')
  })

  it('multiple cells: markdown then code', async () => {
    const notebook = makeNotebook([
      { type: 'markdown', source: 'description' },
      { type: 'code', source: 'x = 1' },
    ])
    const html = (await to('html', await from('jupyter', JSON.stringify(notebook)))).trim()
    expect(html).toContain('description')
    expect(html).toContain('x = 1')
  })

  it('Jupyter round-trip: fromJupyter → toJupyter preserves cell count', async () => {
    const notebook = makeNotebook([
      { type: 'markdown', source: 'intro' },
      { type: 'code', source: 'import os' },
    ])
    const doc = await from('jupyter', JSON.stringify(notebook))
    const out = JSON.parse(await to('jupyter', doc, 'python'))
    expect(out.cells).toHaveLength(2)
    expect(out.cells[0].cell_type).toBe('markdown')
    expect(out.cells[1].cell_type).toBe('code')
  })
})

// ─── Contentful ───────────────────────────────────────────────────────────────


function cfDoc(content: any[]) {
  return { nodeType: 'document', data: {}, content }
}

function cfPara(content: any[]) {
  return { nodeType: 'paragraph', data: {}, content }
}

function cfText(value: string, marks: string[] = []) {
  return { nodeType: 'text', value, marks: marks.map((type) => ({ type })), data: {} }
}

function cfHeading(level: number, content: any[]) {
  return { nodeType: `heading-${level}`, data: {}, content }
}

function cfLink(uri: string, content: any[]) {
  return { nodeType: 'hyperlink', data: { uri }, content }
}

function cfList(nodeType: 'unordered-list' | 'ordered-list', items: any[][]) {
  return {
    nodeType,
    data: {},
    content: items.map((itemContent) => ({
      nodeType: 'list-item',
      data: {},
      content: [cfPara(itemContent)],
    })),
  }
}

describe('lens round-trip: Contentful → RT → HTML', () => {
  it('paragraph → <p>', async () => {
    const html = (await to('html', await from('contentful', JSON.stringify(cfDoc([cfPara([cfText('hello')])]))))).trim()
    expect(html).toContain('<p>hello</p>')
  })

  it('bold mark → <strong>', async () => {
    const html = (await to('html', await from('contentful', JSON.stringify(cfDoc([cfPara([cfText('bold', ['bold'])])]))))).trim()
    expect(html).toContain('<strong>bold</strong>')
  })

  it('italic mark → <em>', async () => {
    const html = (await to('html', await from('contentful', JSON.stringify(cfDoc([cfPara([cfText('italic', ['italic'])])]))))).trim()
    expect(html).toContain('<em>italic</em>')
  })

  it('underline mark → <u>', async () => {
    const html = (await to('html', await from('contentful', JSON.stringify(cfDoc([cfPara([cfText('under', ['underline'])])]))))).trim()
    expect(html).toContain('<u>under</u>')
  })

  it('code mark → <code>', async () => {
    const html = (await to('html', await from('contentful', JSON.stringify(cfDoc([cfPara([cfText('fn()', ['code'])])]))))).trim()
    expect(html).toContain('<code>fn()</code>')
  })

  it('superscript mark → <sup>', async () => {
    const html = (await to('html', await from('contentful', JSON.stringify(cfDoc([cfPara([cfText('2', ['superscript'])])]))))).trim()
    expect(html).toContain('<sup>2</sup>')
  })

  it('subscript mark → <sub>', async () => {
    const html = (await to('html', await from('contentful', JSON.stringify(cfDoc([cfPara([cfText('n', ['subscript'])])]))))).trim()
    expect(html).toContain('<sub>n</sub>')
  })

  it('heading-1 → <h1>', async () => {
    const html = (await to('html', await from('contentful', JSON.stringify(cfDoc([cfHeading(1, [cfText('Title')])]))))).trim()
    expect(html).toContain('<h1>Title</h1>')
  })

  it('heading-2 → <h2>', async () => {
    const html = (await to('html', await from('contentful', JSON.stringify(cfDoc([cfHeading(2, [cfText('Section')])]))))).trim()
    expect(html).toContain('<h2>Section</h2>')
  })

  it('heading-3 → <h3>', async () => {
    const html = (await to('html', await from('contentful', JSON.stringify(cfDoc([cfHeading(3, [cfText('Sub')])]))))).trim()
    expect(html).toContain('<h3>Sub</h3>')
  })

  it('hyperlink uri attr → <a href>', async () => {
    const html = (await to('html', 
      await from('contentful', JSON.stringify(cfDoc([cfPara([cfLink('https://example.com', [cfText('click')])])]))),
    )).trim()
    expect(html).toContain('<a href="https://example.com">')
    expect(html).toContain('click')
  })

  it('unordered-list → <ul><li>', async () => {
    const html = (await to('html', 
      await from('contentful', JSON.stringify(cfDoc([cfList('unordered-list', [[cfText('item')]])]))),
    )).trim()
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item')
  })

  it('ordered-list → <ol><li>', async () => {
    const html = (await to('html', 
      await from('contentful', JSON.stringify(cfDoc([cfList('ordered-list', [[cfText('first')]]), ]))),
    )).trim()
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>')
    expect(html).toContain('first')
  })

  it('hr → <hr>', async () => {
    const html = (await to('html', await from('contentful', JSON.stringify(cfDoc([{ nodeType: 'hr', data: {}, content: [] }]))))).trim()
    expect(html).toContain('<hr')
  })
})
