import { beforeAll, describe, expect, it } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'
import type { HIRBlockNode } from '../src/types.js'

beforeAll(() => {
  registerTestFormats('html')
})

describe('fromHTML — block elements', () => {
  it('parses a paragraph', async () => {
    const doc = await from('html', '<p>Hello world</p>')
    const hir = doc.toHIR()
    expect(hir).toHaveLength(1)
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('p')
    }
  })

  it('parses a heading with level', async () => {
    const doc = await from('html', '<h2>Title</h2>')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('h2')
    }
  })

  it('parses h1 through h6', async () => {
    for (let i = 1; i <= 6; i++) {
      const doc = await from('html', `<h${i}>H${i}</h${i}>`)
      const hir = doc.toHIR()
      const block = hir[0]!
      expect(block.type).toBe('block')
      if (block.type === 'block') {
        expect(block.name).toBe(`h${i}`)
      }
    }
  })

  it('parses a horizontal rule', async () => {
    const doc = await from('html', '<hr>')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      expect(hir[0]!.name).toBe('hr')
    }
  })

  it('parses an unordered list with parents', async () => {
    const doc = await from('html', '<ul><li>a</li><li>b</li></ul>')
    const hir = doc.toHIR()
    // Should produce a container with two list items inside
    expect(hir).toHaveLength(1)
    const container = hir[0]!
    expect(container.type).toBe('container')
    if (container.type === 'container') {
      expect(container.name).toBe('ul')
      expect(container.children).toHaveLength(2)
      const item = container.children[0]!
      expect(item.type).toBe('block')
      if (item.type === 'block') {
        expect(item.name).toBe('li')
      }
    }
  })

  it('parses an ordered list', async () => {
    const doc = await from('html', '<ol><li>first</li><li>second</li></ol>')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('container')
    if (hir[0]!.type === 'container') {
      expect(hir[0]!.name).toBe('ol')
      const item = hir[0]!.children[0]!
      if (item.type === 'block') {
        expect(item.name).toBe('li')
      }
    }
  })

  it('parses blockquote wrapping a paragraph', async () => {
    const doc = await from('html', '<blockquote><p>Quote</p></blockquote>')
    const hir = doc.toHIR()
    expect(hir).toHaveLength(1)
    const container = hir[0]!
    expect(container.type).toBe('container')
    if (container.type === 'container') {
      expect(container.name).toBe('blockquote')
      expect(container.children[0]!.type).toBe('block')
    }
  })

  it('parses a fenced code block with language', async () => {
    const doc = await from('html', '<pre><code class="language-rust">fn main() {}</code></pre>')
    const hir = doc.toHIR()
    expect(hir.length).toBeGreaterThan(0)
    expect(doc.toString()).toContain('fn main()')
  })
})

describe('fromHTML — inline elements', () => {
  it('parses bold text', async () => {
    const doc = await from('html', '<p>Hello <strong>world</strong></p>')
    const hir = doc.toHIR()
    expect(hir[0]!.type).toBe('block')
    if (hir[0]!.type === 'block') {
      const boldSegment = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.w3c.html.facet#strong'),
      )
      expect(boldSegment).toBeDefined()
    }
  })

  it('parses italic text', async () => {
    const doc = await from('html', '<p><em>italic</em></p>')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.w3c.html.facet#em'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses a link facet', async () => {
    const doc = await from('html', '<p><a href="https://example.com">link</a></p>')
    const linkFacet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.w3c.html.facet' && (feat as Record<string, unknown>)['name'] === 'a'),
    )
    expect(linkFacet).toBeDefined()
    if (linkFacet) {
      const feat = linkFacet.features[0]!
      expect((feat as Record<string, unknown>)['href']).toBe('https://example.com')
    }
  })

  it('preserves class attribute on <a> elements', async () => {
    const doc = await from('html', '<a href="x" class="foo">t</a>')
    const linkFacet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.w3c.html.facet' && (feat as Record<string, unknown>)['name'] === 'a'),
    )
    expect(linkFacet).toBeDefined()
    const feat = linkFacet!.features[0] as Record<string, unknown>
    expect(feat['class']).toEqual(['foo'])
  })

  it('parses code inline', async () => {
    const doc = await from('html', '<p><code>const x = 1</code></p>')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.w3c.html.facet#code'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('parses strikethrough', async () => {
    const doc = await from('html', '<p><s>deleted</s></p>')
    const hir = doc.toHIR()
    if (hir[0]!.type === 'block') {
      const seg = hir[0]!.children.find(
        (c) => c.type === 'text' && c.marks.some((m) => m.kind === 'org.w3c.html.facet#s'),
      )
      expect(seg).toBeDefined()
    }
  })

  it('captures class and id attrs on <strong>', async () => {
    const doc = await from('html', '<strong class="highlight" id="key">text</strong>')
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.w3c.html.facet' && (feat as Record<string, unknown>)['name'] === 'strong'),
    )
    expect(facet).toBeDefined()
    const feat = facet!.features[0] as Record<string, unknown>
    const attrs = feat['attrs'] as Record<string, unknown> | undefined
    const classVal = attrs?.['class'] ?? feat['class']
    const idVal = attrs?.['id'] ?? feat['id']
    expect(classVal).toEqual(['highlight'])
    expect(idVal).toBe('key')
  })

  it('captures href, target, and rel attrs on <a>', async () => {
    const doc = await from('html', '<a href="https://example.com" target="_blank" rel="noopener">link</a>')
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.w3c.html.facet' && (feat as Record<string, unknown>)['name'] === 'a'),
    )
    expect(facet).toBeDefined()
    const feat = facet!.features[0] as Record<string, unknown>
    expect(feat['href']).toBe('https://example.com')
    expect(feat['target']).toBe('_blank')
    expect(feat['rel']).toBe('noopener')
  })
})

describe('toHTML — renderer', () => {
  it('renders a paragraph', async () => {
    const doc = await from('html', '<p>Hello world</p>')
    const html = await to('html', doc)
    expect(html).toContain('<p>')
    expect(html).toContain('Hello world')
  })

  it('renders heading with correct level', async () => {
    const doc = await from('html', '<h3>Hello</h3>')
    const html = await to('html', doc)
    expect(html).toContain('<h3>Hello</h3>')
  })

  it('renders a bold mark', async () => {
    const doc = await from('html', '<p>Hello <strong>world</strong></p>')
    const html = await to('html', doc)
    expect(html).toContain('<strong>world</strong>')
  })

  it('renders an unordered list', async () => {
    const doc = await from('html', '<ul><li>a</li><li>b</li></ul>')
    const html = await to('html', doc)
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
  })

  it('renders a code block with language class', async () => {
    const doc = await from('html', '<pre><code class="language-rust">fn main() {}</code></pre>')
    const html = await to('html', doc)
    expect(html).toContain('class="language-rust"')
  })

  it('HTML-escapes text content', async () => {
    const doc = await from('html', '<p>&lt;script&gt;</p>')
    const html = await to('html', doc)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;')
  })
})

describe('round-trip HTML', () => {
  it('paragraph with bold survives a round-trip', async () => {
    const original = '<p>Hello <strong>world</strong></p>'
    const doc = await from('html', original)
    const html = await to('html', doc)
    // Should contain the same semantic content
    expect(html).toContain('<p>')
    expect(html).toContain('<strong>world</strong>')
  })
})

describe('fromHTML — <br> hard line break', () => {
  it('produces a br facet for <br>', async () => {
    const doc = await from('html', '<p>Hello<br>World</p>')
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.w3c.html.facet' && (feat as Record<string, unknown>)['name'] === 'br'),
    )
    expect(facet).toBeDefined()
  })

  it('renders <br> back as <br> in toHTML', async () => {
    const doc = await from('html', '<p>Hello<br>World</p>')
    const html = await to('html', doc)
    expect(html).toContain('<br />')
    expect(html).toContain('World')
  })
})

describe('fromHTML — comments', () => {
  it('produces a comment facet for <!-- ... -->', async () => {
    const doc = await from('html', '<p>Hello<!-- comment -->World</p>')
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.w3c.html.facet' && (feat as Record<string, unknown>)['name'] === 'comment'),
    )
    expect(facet).toBeDefined()
    expect((facet!.features[0] as Record<string, unknown>).data).toBe(' comment ')
  })

  it('round-trips comments in toHTML', async () => {
    const doc = await from('html', '<p>a<!-- x -->b</p>')
    const html = await to('html', doc)
    expect(html).toContain('<!-- x -->')
    expect(html).toContain('a')
    expect(html).toContain('b')
  })
})

describe('fromHTML — new semantic inline marks', () => {
  it('parses <mark>', async () => {
    const doc = await from('html', '<p><mark>hi</mark></p>')
    const html = await to('html', doc)
    expect(html).toContain('<mark>hi</mark>')
  })

  it('parses <abbr title="...">', async () => {
    const doc = await from('html', '<p><abbr title="HyperText Markup Language">HTML</abbr></p>')
    const html = await to('html', doc)
    expect(html).toContain('<abbr title="HyperText Markup Language">HTML</abbr>')
  })

  it('parses <abbr> without title', async () => {
    const doc = await from('html', '<p><abbr>HTML</abbr></p>')
    const html = await to('html', doc)
    expect(html).toContain('<abbr>HTML</abbr>')
  })

  it('parses <q>', async () => {
    const doc = await from('html', '<p><q>quoted</q></p>')
    const html = await to('html', doc)
    expect(html).toContain('<q>quoted</q>')
  })

  it('parses <small>', async () => {
    const doc = await from('html', '<p><small>small</small></p>')
    const html = await to('html', doc)
    expect(html).toContain('<small>small</small>')
  })

  it('parses <ins>', async () => {
    const doc = await from('html', '<p><ins>inserted</ins></p>')
    const html = await to('html', doc)
    expect(html).toContain('<ins>inserted</ins>')
  })

  it('parses <cite>', async () => {
    const doc = await from('html', '<p><cite>source</cite></p>')
    const html = await to('html', doc)
    expect(html).toContain('<cite>source</cite>')
  })

  it('parses <dfn>', async () => {
    const doc = await from('html', '<p><dfn>term</dfn></p>')
    const html = await to('html', doc)
    expect(html).toContain('<dfn>term</dfn>')
  })

  it('parses <time datetime="...">', async () => {
    const doc = await from('html', '<p><time datetime="2026-02-22">today</time></p>')
    const html = await to('html', doc)
    expect(html).toContain('<time datetime="2026-02-22">today</time>')
  })

  it('parses <var>', async () => {
    const doc = await from('html', '<p><var>x</var></p>')
    const html = await to('html', doc)
    expect(html).toContain('<var>x</var>')
  })

  it('parses <samp>', async () => {
    const doc = await from('html', '<p><samp>output</samp></p>')
    const html = await to('html', doc)
    expect(html).toContain('<samp>output</samp>')
  })
})

describe('fromHTML — definition lists', () => {
  it('parses <dl><dt><dd> structure', async () => {
    const doc = await from('html', '<dl><dt>Term</dt><dd>Detail</dd></dl>')
    const hir = doc.toHIR()
    expect(hir).toHaveLength(1)
    expect(hir[0]!.type).toBe('container')
    if (hir[0]!.type === 'container') {
      expect(hir[0]!.name).toBe('dl')
      const term = hir[0]!.children.find((c) => c.type === 'block' && c.name === 'dt')
      const detail = hir[0]!.children.find((c) => c.type === 'block' && c.name === 'dd')
      expect(term).toBeDefined()
      expect(detail).toBeDefined()
    }
  })

  it('renders <dl> back as <dl><dt><dd>', async () => {
    const doc = await from('html', '<dl><dt>Term</dt><dd>Detail</dd></dl>')
    const html = await to('html', doc)
    expect(html).toContain('<dl>')
    expect(html).toContain('<dt>Term</dt>')
    expect(html).toContain('<dd>Detail</dd>')
  })
})

describe('fromHTML — figcaption', () => {
  it('parses img in figure as img entity with flat attrs', async () => {
    const doc = await from('html', '<figure><img src="img.png" alt="photo"><figcaption>A photo</figcaption></figure>')
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.w3c.html.facet' && (feat as Record<string, unknown>)['name'] === 'img'),
    )
    expect(facet).toBeDefined()
    if (facet) {
      // img is featureClass: entity — attrs are stored flat on the feature, not nested under 'attrs'
      const feat = facet.features[0]! as Record<string, unknown>
      expect(feat['src']).toBe('img.png')
      expect(feat['alt']).toBe('photo')
    }
  })

  it('renders figcaption back as <figure><figcaption>', async () => {
    const doc = await from('html', '<figure><img src="img.png" alt="photo"><figcaption>A photo</figcaption></figure>')
    const html = await to('html', doc)
    expect(html).toContain('<figure>')
    expect(html).toContain('<figcaption>A photo</figcaption>')
  })
})

import { normalizeHTML } from './test-utils.js'

describe('fromHTML/toHTML — structural containers', () => {
  async function roundtrip(html: string): Promise<string> {
    return normalizeHTML(await to('html', await from('html', html)))
  }

  it('round-trips a <div> container', async () => {
    const input = '<div><p>text</p></div>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips a <section> container', async () => {
    const input = '<section><p>text</p></section>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips an <article> container', async () => {
    const input = '<article><h1>Title</h1><p>body</p></article>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips a <nav> container', async () => {
    const input = '<nav><p>link</p></nav>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips a <header> container', async () => {
    const input = '<header><p>site header</p></header>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips a <footer> container', async () => {
    const input = '<footer><p>site footer</p></footer>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips a <main> container', async () => {
    const input = '<main><p>main content</p></main>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips an <aside> container', async () => {
    const input = '<aside><p>sidebar</p></aside>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('preserves id attr on <div>', async () => {
    const input = '<div id="foo"><p>text</p></div>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('preserves class attr on <div>', async () => {
    const input = '<div class="card"><p>text</p></div>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('adjacent same-class divs stay separate', async () => {
    const input = '<div class="card"><p>A</p></div><div class="card"><p>B</p></div>'
    const out = await roundtrip(input)
    // Should contain two separate <div class="card"> elements
    const matches = out.match(/<div class="card">/g)
    expect(matches).toHaveLength(2)
    expect(out).toContain('<p>A</p>')
    expect(out).toContain('<p>B</p>')
  })

  it('preserves multiple attrs on <section>', async () => {
    const input = '<section class="featured" id="hero"><p>content</p></section>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips nested containers', async () => {
    const input = '<section><div><p>text</p></div></section>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips <details> with <summary>', async () => {
    const input = '<details><summary>Title</summary><p>content</p></details>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips an <address> block', async () => {
    const input = '<address>contact info</address>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips a <span> inline', async () => {
    const input = '<p><span>text</span></p>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('preserves class attr on <span>', async () => {
    const input = '<p><span class="highlight">important</span></p>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips a standalone <figcaption> block', async () => {
    const input = '<figcaption>A caption</figcaption>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })
})

describe('HTML round-trip fidelity — attrs on block elements', () => {
  // Note: WASM serializes feature data through BTreeMap (Rust), so attribute order in
  // output is always alphabetical regardless of input order. Tests use alphabetical input
  // order so normalizeHTML(input) === normalizeHTML(roundtrip(input)).
  async function roundtrip(html: string): Promise<string> {
    return normalizeHTML(await to('html', await from('html', html)))
  }

  it('round-trips <p> with class attr', async () => {
    const input = '<p class="intro">Hello</p>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips <h2> with class and id (alphabetical order)', async () => {
    // 'class' < 'id' alphabetically — matches WASM BTreeMap output order
    const input = '<h2 class="title" id="main">Title</h2>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips <li> with data attr (synthetic list attr excluded)', async () => {
    const input = '<ul><li data-order="1">item</li></ul>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips <hr> with class attr', async () => {
    const input = '<hr class="divider" />'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips <img> with all attrs (alphabetical order)', async () => {
    // WASM BTreeMap order: alt, height, src, title, width
    const input = '<img alt="a photo" height="600" src="photo.jpg" title="My Photo" width="800" />'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips <figure><img><figcaption> with extra attrs on img', async () => {
    // alt < src < title alphabetically
    const input = '<figure><img alt="x" src="x.jpg" title="X" /><figcaption>caption</figcaption></figure>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })
})

describe('HTML round-trip fidelity — attrs on inline marks', () => {
  async function roundtrip(html: string): Promise<string> {
    return normalizeHTML(await to('html', await from('html', html)))
  }

  it('round-trips <strong> with class attr', async () => {
    const input = '<p><strong class="highlight">bold</strong></p>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips <em> with lang attr', async () => {
    const input = '<p><em lang="fr">italique</em></p>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips <abbr> with class and title (alphabetical order)', async () => {
    // 'class' < 'title' alphabetically
    const input = '<p><abbr class="tech" title="HyperText Markup Language">HTML</abbr></p>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips <a> with href, rel, target (alphabetical order)', async () => {
    // href < rel < target alphabetically
    const input = '<p><a href="https://example.com" rel="noopener" target="_blank">link</a></p>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('captures <a> with id attr (named anchor pattern — id preferred over deprecated name)', async () => {
    // HTML 'name' attr on <a> collides with the feature's internal name field; use id instead.
    const doc = await from('html', '<a href="#" id="section1">anchor</a>')
    const html = await to('html', doc)
    expect(html).toContain('<a')
    expect(html).toContain('id="section1"')
    expect(html).toContain('anchor')
  })

  it('round-trips <time> with class and datetime (alphabetical order)', async () => {
    // 'class' < 'datetime' alphabetically
    const input = '<p><time class="date" datetime="2026-02-26">today</time></p>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips <ins> with cite and datetime (alphabetical order)', async () => {
    // 'cite' < 'datetime' alphabetically
    const input = '<p><ins cite="change.html" datetime="2026-01-01">added</ins></p>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })

  it('round-trips <del> with cite', async () => {
    const input = '<p><del cite="http://example.com/log">removed</del></p>'
    expect(await roundtrip(input)).toBe(normalizeHTML(input))
  })
})

describe('fromHTML — b/i/strike separate from strong/em/s (transliteration principle)', () => {
  it('<b> round-trips as <b>', async () => {
    const doc = await from('html', '<b>text</b>')
    const html = await to('html', doc)
    expect(html).toContain('<b>text</b>')
  })

  it('<i> round-trips as <i>', async () => {
    const doc = await from('html', '<i>text</i>')
    const html = await to('html', doc)
    expect(html).toContain('<i>text</i>')
  })

  it('<strike> round-trips as <strike>', async () => {
    const doc = await from('html', '<strike>text</strike>')
    const html = await to('html', doc)
    expect(html).toContain('<strike>text</strike>')
  })

  it('<del> with cite attr round-trips with cite', async () => {
    const doc = await from('html', '<del cite="source.html">removed</del>')
    const html = await to('html', doc)
    expect(html).toContain('<del cite="source.html">removed</del>')
  })

  it('<ins> with datetime attr round-trips with datetime', async () => {
    const doc = await from('html', '<ins datetime="2024-01-01">added</ins>')
    const html = await to('html', doc)
    expect(html).toContain('<ins datetime="2024-01-01">added</ins>')
  })

  it('<b> is stored as org.w3c.html.facet#b (not #strong)', async () => {
    const doc = await from('html', '<p><b>bold</b></p>')
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.w3c.html.facet' && (feat as Record<string, unknown>)['name'] === 'b'),
    )
    expect(facet).toBeDefined()
  })

  it('<i> is stored as org.w3c.html.facet#i (not #em)', async () => {
    const doc = await from('html', '<p><i>italic</i></p>')
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.w3c.html.facet' && (feat as Record<string, unknown>)['name'] === 'i'),
    )
    expect(facet).toBeDefined()
  })

  it('<strike> is stored as org.w3c.html.facet#strike (not #s)', async () => {
    const doc = await from('html', '<p><strike>struck</strike></p>')
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.w3c.html.facet' && (feat as Record<string, unknown>)['name'] === 'strike'),
    )
    expect(facet).toBeDefined()
  })

  it('<del> with cite attr stores cite correctly (not author)', async () => {
    const doc = await from('html', '<del cite="source.html">removed</del>')
    const facet = doc.facets.find((f) =>
      f.features.some((feat) => feat.$type === 'org.w3c.html.facet' && (feat as Record<string, unknown>)['name'] === 'del'),
    )
    expect(facet).toBeDefined()
    if (facet) {
      const feat = facet.features[0]! as Record<string, unknown>
      const attrs = feat['attrs'] as Record<string, unknown> | undefined
      // cite may be in attrs or at flat level depending on how feature is stored
      const citeVal = attrs?.['cite'] ?? feat['cite']
      expect(citeVal).toBe('source.html')
    }
  })
})
