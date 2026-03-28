#!/usr/bin/env tsx
/**
 * gen-whatwg-html-lexicon.ts — Generate packages/relational-text/src/lexicons/whatwg-html.lexicon.json
 *
 * Fetches the WHATWG HTML element index to confirm element names, then merges
 * with hand-maintained feature class assignments and expand semantics.
 *
 * Usage:
 *   npx tsx scripts/gen-whatwg-html-lexicon.ts
 *
 * Idempotent: same spec HTML → identical JSON output.
 * Spec source: https://html.spec.whatwg.org/multipage/indices.html
 */

import * as path from 'node:path'
import {
  fetchWithCache,
  writeIfChanged,
  emit,
  OUT_DIR,
  buildInlineFeatures,
  buildBlockFeatures,
  cleanEntry,
  type FeatureEntry,
} from './lib.js'

const SPEC_URL = 'https://html.spec.whatwg.org/multipage/indices.html'
const SPEC_PAGE_URL = 'https://html.spec.whatwg.org/'

async function main(): Promise<void> {
  console.log('Generating WHATWG HTML lexicon...')

  const html = await fetchWithCache(SPEC_URL)

  // Extract element names from the spec index table
  const elementPattern = /<a\s+href="[^"]+"\s*><code>([a-z][a-z0-9-]*)<\/code><\/a>/g
  const elements = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = elementPattern.exec(html)) !== null) {
    if (m[1]) elements.add(m[1])
  }
  console.log(`  Found ${elements.size} HTML elements in index`)

  const features: FeatureEntry[] = [
    // Inline marks
    ...buildInlineFeatures('org.w3c.html.facet', [
      ['strong',      undefined],
      ['em',          undefined],
      ['s',           undefined],
      ['code',        undefined],
      ['u',           undefined],
      ['sup',         undefined],
      ['sub',         undefined],
      ['kbd',         undefined],
      ['mark',        undefined],
      ['abbr',        undefined],
      ['q',           undefined],
      ['small',       undefined],
      ['ins',         undefined],
      ['cite',        undefined],
      ['dfn',         undefined],
      ['time',        undefined],
      ['var',         undefined],
      ['samp',        undefined],
      ['span',        undefined],
    ], []),
    // Blocks
    ...buildBlockFeatures('org.w3c.html.facet', [
      ['p',                    undefined],
      ['h1',                   undefined],
      ['h2',                   undefined],
      ['h3',                   undefined],
      ['h4',                   undefined],
      ['h5',                   undefined],
      ['h6',                   undefined],
      ['li',                   undefined],
      ['blockquote',           undefined],
      ['pre',                  undefined],
      ['hr',                   undefined],
      ['image',                undefined],
      ['table',                undefined],
      ['dt',                   undefined],
      ['dd',                   undefined],
      ['address',              undefined],
      ['summary',              undefined],
      ['figcaption',           undefined],
    ], []),
    // Entities
    { typeId: 'org.w3c.html.facet#a',  featureClass: 'entity' },
    { typeId: 'org.w3c.html.facet#br', featureClass: 'entity' },
  ]

  const lexicon = {
    $type: 'org.relationaltext.format-lexicon',
    id: 'org.w3c.html.facet',
    specUrl: SPEC_PAGE_URL,
    features: features.map(cleanEntry),
  }

  writeIfChanged(path.join(OUT_DIR, 'whatwg-html.lexicon.json'), emit(lexicon))
  console.log('Done.')
}

await main()
