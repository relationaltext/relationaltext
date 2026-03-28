#!/usr/bin/env tsx
/**
 * gen-commonmark-lexicon.ts — Generate packages/relational-text/src/lexicons/commonmark.lexicon.json
 *
 * Fetches the authoritative CommonMark spec JSON to discover section names,
 * then merges with hand-maintained expand semantics to produce the lexicon.
 *
 * Usage:
 *   npx tsx scripts/gen-commonmark-lexicon.ts
 *
 * Idempotent: same spec version → identical JSON output.
 * Spec source: https://spec.commonmark.org/0.31.2/spec.json
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
  findSection,
  type FeatureEntry,
} from './lib.js'

const SPEC_URL = 'https://spec.commonmark.org/0.31.2/spec.json'
const VERSION = '0.31'
const SPEC_PAGE_URL = 'https://spec.commonmark.org/0.31.2/'

async function main(): Promise<void> {
  console.log('Generating CommonMark lexicon...')

  const specJson = await fetchWithCache(SPEC_URL)
  const spec = JSON.parse(specJson) as { section: string; example: number }[]
  const sections = [...new Set(spec.map((e) => e.section))]
  console.log(`  Found ${sections.length} spec sections`)

  const features: FeatureEntry[] = [
    // Inline marks
    ...buildInlineFeatures('org.commonmark.facet', [
      ['strong',        'Emphasis and strong emphasis'],
      ['emphasis',      'Emphasis and strong emphasis'],
      ['strikethrough', 'Strikethrough'],
      ['code-span',     'Code spans'],
      ['underline',     undefined],
      ['superscript',   undefined],
      ['subscript',     undefined],
      ['keyboard',      undefined],
    ], sections),
    // Entities
    { typeId: 'org.commonmark.facet#link',       featureClass: 'entity', specSection: findSection('Links', sections) },
    { typeId: 'org.commonmark.facet#image',      featureClass: 'entity', specSection: findSection('Images', sections) },
    { typeId: 'org.commonmark.facet#line-break', featureClass: 'entity', specSection: findSection('Hard line breaks', sections) },
    // Blocks
    ...buildBlockFeatures('org.commonmark.facet', [
      ['paragraph',            'Paragraphs'],
      ['heading',              'ATX headings'],
      ['unordered-list-item',  'Lists'],
      ['ordered-list-item',    'Lists'],
      ['blockquote',           'Block quotes'],
      ['code-block',           'Indented code blocks'],
      ['horizontal-rule',      'Thematic breaks'],
      ['table',                'Tables'],
      ['definition-term',      'Definition lists'],
      ['definition-detail',    'Definition lists'],
    ], sections),
  ]

  const lexicon = {
    $type: 'org.relationaltext.format-lexicon',
    id: 'org.commonmark.facet',
    version: VERSION,
    specUrl: SPEC_PAGE_URL,
    features: features.map(cleanEntry),
  }

  writeIfChanged(path.join(OUT_DIR, 'commonmark.lexicon.json'), emit(lexicon))
  console.log('Done.')
}

await main()
