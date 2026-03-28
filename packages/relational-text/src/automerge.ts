/**
 * Automerge rich text importer and exporter for RelationalText documents.
 *
 * Import: `from('automerge', doc)` → Document  (or directly: `fromAutomerge(doc, path)`)
 * Export: `to('automerge', rtDoc)` → updated AM.Doc  (or directly: `toAutomerge(rtDoc, doc, path)`)
 *
 * Both formats use the same theoretical model (Peritext for marks,
 * Kleppmann blocks for block elements), so the mapping is structural.
 *
 * Automerge marks become `org.automerge.richtext.facet#<name>` features.
 * Automerge block spans become block facets covering the RelationalText
 * block marker byte (`\uFFFC` for the first block, `\n` for subsequent ones).
 *
 * @automerge/automerge is a peer dependency — install it in your project:
 *   npm install @automerge/automerge
 *
 * Call `ensureAutomergeLexicon()` once at application startup to register
 * expand semantics for Automerge-native feature types.
 */

// Peer dependency — not bundled. Users must install @automerge/automerge.
import * as AM from '@automerge/automerge'

import { Document, registerFeatureType } from './core.js'
import type { DocumentJSON, FacetJSON } from './types.js'

// ─── Lexicon registration ─────────────────────────────────────────────────────

const AUTOMERGE_NAMESPACE = 'org.automerge.richtext.facet'

// Lazy-once guard
let _automergeLexiconRegistered = false
export function ensureAutomergeLexicon(): void {
  if (_automergeLexiconRegistered) return
  _automergeLexiconRegistered = true

  const expandingMarks = ['bold', 'italic', 'strikethrough', 'underline']
  const nonExpandingMarks = ['link', 'code', 'comment']

  for (const name of expandingMarks) {
    registerFeatureType({
      typeId: `${AUTOMERGE_NAMESPACE}#${name}`,
      featureClass: 'inline',
      expandStart: true,
      expandEnd: true,
    })
  }
  for (const name of nonExpandingMarks) {
    registerFeatureType({
      typeId: `${AUTOMERGE_NAMESPACE}#${name}`,
      featureClass: 'inline',
      expandStart: false,
      expandEnd: false,
    })
  }

  // Block types
  for (const name of ['paragraph', 'heading', 'code-block']) {
    registerFeatureType({
      typeId: `${AUTOMERGE_NAMESPACE}#${name}`,
      featureClass: 'block',
      expandStart: false,
      expandEnd: false,
    })
  }
}

// ─── UTF-8 helpers ────────────────────────────────────────────────────────────

const _encoder = new TextEncoder()
const _decoder = new TextDecoder()

/** Count UTF-8 bytes for a string. */
function byteLength(str: string): number {
  return _encoder.encode(str).length
}

// ─── Block value field readers ────────────────────────────────────────────────

/** Safely read the `type` field of an Automerge block value as a string. */
function blockTypeName(value: Record<string, AM.MaterializeValue>): string {
  const t = value['type']
  if (t == null) return 'paragraph'
  // Automerge RawString has a .val property; plain strings are also fine.
  if (typeof t === 'object' && !Array.isArray(t) && 'val' in t) {
    return String((t as { val: unknown }).val)
  }
  return String(t)
}

/** Safely read the `parents` field of an Automerge block value as string[]. */
function blockParents(value: Record<string, AM.MaterializeValue>): string[] {
  const p = value['parents']
  if (!Array.isArray(p)) return []
  return p.map((item: AM.MaterializeValue) => {
    if (typeof item === 'object' && item !== null && !Array.isArray(item) && 'val' in item) {
      return String((item as { val: unknown }).val)
    }
    return String(item)
  })
}

/** Safely read the `attrs` field of an Automerge block value. */
function blockAttrs(value: Record<string, AM.MaterializeValue>): Record<string, unknown> {
  const a = value['attrs']
  if (a != null && typeof a === 'object' && !Array.isArray(a) && !('val' in a)) {
    return a as Record<string, unknown>
  }
  return {}
}

// ─── Importer ─────────────────────────────────────────────────────────────────

/**
 * Convert an Automerge document's rich text field at `path` into a
 * RelationalText Document.
 *
 * @param doc  - An Automerge document.
 * @param path - Property path to the text field, e.g. `['content']`.
 */
export function fromAutomerge(doc: AM.Doc<unknown>, path: string[]): Document {
  ensureAutomergeLexicon()

  const spans = AM.spans(doc, path)

  let text = ''
  let byteOffset = 0
  const facets: FacetJSON[] = []

  // Track open marks: name → { byteStart, value }
  const openMarks = new Map<string, { byteStart: number; value: AM.ScalarValue }>()

  // Mark set from the previous text span (for diffing)
  let prevMarks: AM.MarkSet = {}

  let isFirstBlock = true

  for (const span of spans) {
    if (span.type === 'block') {
      const blockValue = span.value as Record<string, AM.MaterializeValue>
      const typeName = blockTypeName(blockValue)
      const parents = blockParents(blockValue)
      const attrs = blockAttrs(blockValue)

      let markerChar: string
      let markerByteLen: number

      if (isFirstBlock) {
        markerChar = '\uFFFC'
        markerByteLen = 3 // U+FFFC encodes to 3 bytes in UTF-8
        isFirstBlock = false
      } else {
        markerChar = '\n'
        markerByteLen = 1
      }

      const markerByteStart = byteOffset
      const markerByteEnd = byteOffset + markerByteLen

      text += markerChar
      byteOffset += markerByteLen

      // Build block feature
      const blockFeature: Record<string, unknown> = {
        $type: AUTOMERGE_NAMESPACE,
        name: typeName,
        parents,
      }
      if (Object.keys(attrs).length > 0) {
        blockFeature['attrs'] = attrs
      }

      facets.push({
        index: { byteStart: markerByteStart, byteEnd: markerByteEnd },
        features: [blockFeature as FacetJSON['features'][number]],
      })
    } else {
      // type === 'text'
      const spanText = span.value
      const currentMarks: AM.MarkSet = span.marks ?? {}

      // Close marks no longer present in this span
      for (const [name, openMark] of openMarks) {
        if (!(name in currentMarks)) {
          const markFeature: Record<string, unknown> = {
            $type: AUTOMERGE_NAMESPACE,
            name,
          }
          if (typeof openMark.value === 'string' && name === 'link') {
            markFeature['attrs'] = { href: openMark.value }
          } else if (openMark.value !== true && openMark.value != null) {
            markFeature['attrs'] = { value: openMark.value }
          }

          facets.push({
            index: { byteStart: openMark.byteStart, byteEnd: byteOffset },
            features: [markFeature as FacetJSON['features'][number]],
          })
          openMarks.delete(name)
        }
      }

      // Open newly-appearing marks
      for (const [name, value] of Object.entries(currentMarks)) {
        if (!(name in prevMarks)) {
          openMarks.set(name, { byteStart: byteOffset, value: value as AM.ScalarValue })
        }
      }

      text += spanText
      byteOffset += byteLength(spanText)
      prevMarks = currentMarks
    }
  }

  // Close any still-open marks at end of document
  for (const [name, openMark] of openMarks) {
    const markFeature: Record<string, unknown> = {
      $type: AUTOMERGE_NAMESPACE,
      name,
    }
    if (typeof openMark.value === 'string' && name === 'link') {
      markFeature['attrs'] = { href: openMark.value }
    } else if (openMark.value !== true && openMark.value != null) {
      markFeature['attrs'] = { value: openMark.value }
    }

    facets.push({
      index: { byteStart: openMark.byteStart, byteEnd: byteOffset },
      features: [markFeature as FacetJSON['features'][number]],
    })
  }

  const docJson: DocumentJSON = { text, facets }
  return Document.fromJSON(docJson)
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

/**
 * Write the content of a RelationalText Document into an Automerge document's
 * rich text field at `path`.
 *
 * Returns the new Automerge document (Automerge documents are immutable;
 * `AM.change()` produces a new version).
 *
 * @param rtDoc - The RelationalText document to export.
 * @param doc   - The Automerge document to update.
 * @param path  - Property path to the text field, e.g. `['content']`.
 */
export function toAutomerge<T>(rtDoc: Document, doc: AM.Doc<T>, path: string[]): AM.Doc<T> {
  ensureAutomergeLexicon()

  const fullText = rtDoc.text
  const facets = rtDoc.facets

  // ─── Separate block and mark facets ───────────────────────────────────────

  interface BlockFacetInfo {
    byteStart: number
    byteEnd: number
    name: string
    parents: string[]
    attrs: Record<string, unknown>
  }
  interface MarkFacetInfo {
    byteStart: number
    byteEnd: number
    name: string
    value: AM.MarkValue
    expand: 'before' | 'after' | 'both' | 'none'
  }

  const blockFacets: BlockFacetInfo[] = []
  const markFacets: MarkFacetInfo[] = []

  for (const facet of facets) {
    for (const feature of facet.features) {
      const f = feature as Record<string, unknown>
      if (f['$type'] !== AUTOMERGE_NAMESPACE) continue

      const name = String(f['name'] ?? '')
      const byteStart = facet.index.byteStart
      const byteEnd = facet.index.byteEnd
      const rangeWidth = byteEnd - byteStart

      // Block markers are exactly 3 bytes (\uFFFC) or 1 byte (\n)
      // and the feature class is 'block' for paragraph/heading/code-block.
      const knownBlockNames = new Set(['paragraph', 'heading', 'code-block'])
      const looksLikeBlockMarker = rangeWidth === 3 || rangeWidth === 1

      if (knownBlockNames.has(name) && looksLikeBlockMarker) {
        const attrs = (typeof f['attrs'] === 'object' && f['attrs'] !== null && !Array.isArray(f['attrs']))
          ? (f['attrs'] as Record<string, unknown>)
          : {}
        const parents = Array.isArray(f['parents'])
          ? (f['parents'] as unknown[]).map(String)
          : []
        blockFacets.push({ byteStart, byteEnd, name, parents, attrs })
      } else {
        // Inline mark
        const attrs = (typeof f['attrs'] === 'object' && f['attrs'] !== null && !Array.isArray(f['attrs']))
          ? (f['attrs'] as Record<string, unknown>)
          : {}

        let markValue: AM.MarkValue = true
        if (name === 'link' && typeof attrs['href'] === 'string') {
          markValue = attrs['href']
        } else if (typeof attrs['value'] !== 'undefined') {
          markValue = attrs['value'] as AM.MarkValue
        }

        // Expand semantics from the registered lexicon
        const expandingMarks = new Set(['bold', 'italic', 'strikethrough', 'underline'])
        const expand: 'before' | 'after' | 'both' | 'none' = expandingMarks.has(name) ? 'both' : 'none'

        markFacets.push({ byteStart, byteEnd, name, value: markValue, expand })
      }
    }
  }

  // ─── Strip block markers and build byte-offset remapping ─────────────────

  const fullTextBytes = _encoder.encode(fullText)

  // Marker byte ranges to strip (sorted by start)
  const markerRanges = blockFacets
    .map(b => ({ start: b.byteStart, end: b.byteEnd }))
    .sort((a, b) => a.start - b.start)

  // Build stripped bytes and origToStripped[i] = stripped byte index for original byte i
  const strippedBytes: number[] = []
  const origToStripped = new Uint32Array(fullTextBytes.length + 1)
  let strippedIdx = 0
  let rangePtr = 0

  for (let i = 0; i < fullTextBytes.length; i++) {
    // Advance past fully-expired ranges
    while (rangePtr < markerRanges.length && markerRanges[rangePtr]!.end <= i) {
      rangePtr++
    }
    const inMarker =
      rangePtr < markerRanges.length &&
      i >= markerRanges[rangePtr]!.start &&
      i < markerRanges[rangePtr]!.end

    origToStripped[i] = strippedIdx
    if (!inMarker) {
      strippedBytes.push(fullTextBytes[i]!)
      strippedIdx++
    }
  }
  origToStripped[fullTextBytes.length] = strippedIdx

  const strippedText = _decoder.decode(new Uint8Array(strippedBytes))

  /** Map original byte offset → Unicode char index in the stripped text. */
  function origByteToStrippedChar(origByte: number): number {
    const clampedByte = Math.min(origByte, fullTextBytes.length)
    const strippedByte = origToStripped[clampedByte]!
    const slice = new Uint8Array(strippedBytes.slice(0, strippedByte))
    return _decoder.decode(slice).length
  }

  // ─── Build split positions for blocks ────────────────────────────────────

  // A split at charIndex N means: the block boundary is BEFORE char N.
  // The block's content starts at byteEnd (after the marker).
  interface BlockSplit {
    charIndex: number
    name: string
    parents: string[]
    attrs: Record<string, unknown>
  }

  const blockSplits: BlockSplit[] = blockFacets.map(b => ({
    charIndex: origByteToStrippedChar(b.byteEnd),
    name: b.name,
    parents: b.parents,
    attrs: b.attrs,
  }))

  // Apply splits from end to start so earlier positions are not shifted by later insertions
  blockSplits.sort((a, b) => b.charIndex - a.charIndex)

  // ─── Apply changes to Automerge document ─────────────────────────────────

  return AM.change(doc, (d: T) => {
    // Write the stripped text (no block markers)
    AM.updateText(d as AM.Doc<unknown>, path, strippedText)

    // Create block structure via splitBlock (applied back to front)
    for (const split of blockSplits) {
      AM.splitBlock(d as AM.Doc<unknown>, path, split.charIndex, {
        type: new AM.RawString(split.name),
        parents: split.parents.map(p => new AM.RawString(p)),
        isEmbed: false,
        ...(Object.keys(split.attrs).length > 0 ? { attrs: split.attrs } : {}),
      })
    }

    // Apply inline marks
    for (const mf of markFacets) {
      const startChar = origByteToStrippedChar(mf.byteStart)
      const endChar = origByteToStrippedChar(mf.byteEnd)
      if (startChar >= endChar) continue

      AM.mark(d as AM.Doc<unknown>, path, {
        start: startChar,
        end: endChar,
        expand: mf.expand,
      }, mf.name, mf.value)
    }
  })
}
