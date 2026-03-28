import { beforeAll, describe, it, expect } from 'vitest'
import { from, to } from '../src/registry.js'
import { registerTestFormats } from './test-formats.js'

beforeAll(() => {
  registerTestFormats('html', 'markdown')
})

describe('tracked changes — HTML', () => {
  it('imports <ins> as org.w3c.html.facet#ins mark', async () => {
    const doc = await from('html', '<p>text <ins>added</ins> more</p>')
    const json = doc.toJSON()
    const insertionFacet = json.facets.find(f =>
      f.features.some(feat => feat.$type === 'org.w3c.html.facet' && (feat as Record<string, unknown>)['name'] === 'ins')
    )
    expect(insertionFacet).toBeDefined()
  })

  it('imports <del> as org.w3c.html.facet#del mark (not strikethrough)', async () => {
    const doc = await from('html', '<p>text <del>removed</del> more</p>')
    const json = doc.toJSON()
    const deletionFacet = json.facets.find(f =>
      f.features.some(feat => feat.$type === 'org.w3c.html.facet' && (feat as Record<string, unknown>)['name'] === 'del')
    )
    expect(deletionFacet).toBeDefined()
    const strikeFacet = json.facets.find(f =>
      f.features.some(feat => (feat as Record<string, unknown>)['name'] === 's' || (feat as Record<string, unknown>)['name'] === 'strikethrough')
    )
    expect(strikeFacet).toBeUndefined()
  })

  it('exports insertion as <ins>', async () => {
    const doc = await from('html', '<p>text <ins>added</ins> more</p>')
    expect(await to('html', doc)).toContain('<ins>added</ins>')
  })

  it('exports deletion as <del>', async () => {
    const doc = await from('html', '<p>text <del>removed</del> more</p>')
    expect(await to('html', doc)).toContain('<del>removed</del>')
  })

  it('preserves author/date on ins', async () => {
    const doc = await from('html', '<p><ins cite="alice" datetime="2026-01-01">new</ins></p>')
    expect(await to('html', doc)).toContain('cite="alice"')
    expect(await to('html', doc)).toContain('datetime="2026-01-01"')
  })

  it('<del> and <s> are distinct', async () => {
    const doc = await from('html', '<p><del>deleted</del> and <s>struck</s></p>')
    const html = await to('html', doc)
    expect(html).toContain('<del>deleted</del>')
    expect(html).toContain('<s>struck</s>')
  })
})

describe('tracked changes — Markdown CriticMarkup', () => {
  it('imports {++ insertion ++}', async () => {
    const doc = await from('markdown', 'text {++added++} more')
    const json = doc.toJSON()
    const insertionFacet = json.facets.find(f =>
      f.features.some(feat => feat.$type === 'org.commonmark.facet' && (feat as Record<string, unknown>)['name'] === 'insertion')
    )
    expect(insertionFacet).toBeDefined()
    expect(json.text).toContain('added')
  })

  it('imports {-- deletion --}', async () => {
    const doc = await from('markdown', 'text {--removed--} more')
    const json = doc.toJSON()
    const deletionFacet = json.facets.find(f =>
      f.features.some(feat => feat.$type === 'org.commonmark.facet' && (feat as Record<string, unknown>)['name'] === 'deletion')
    )
    expect(deletionFacet).toBeDefined()
    expect(json.text).toContain('removed')
  })

  it('exports insertion as {++ ++}', async () => {
    const doc = await from('markdown', '{++added++}')
    expect(await to('markdown', doc)).toContain('{++added++}')
  })

  it('exports deletion as {-- --}', async () => {
    const doc = await from('markdown', '{--removed--}')
    expect(await to('markdown', doc)).toContain('{--removed--}')
  })
})
