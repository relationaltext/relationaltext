/**
 * Bridge between RelationalText and Layers annotation model.
 *
 * RelationalText and Layers share the same position model (UTF-8 byte
 * offsets) and are both ATProto applications. This module provides
 * bidirectional conversion between them.
 *
 * **RelationalText → Layers:**
 * - `Document.text` → `Expression.text` (direct copy)
 * - `Document.facets[].index` → `Annotation.anchor` (identical byte ranges)
 * - `Feature.$type#name` → `Annotation.label`
 * - `Feature.data` → `Annotation.value`
 *
 * **Layers → RelationalText:**
 * - `Expression.text` → `Document.text`
 * - `Annotation.anchor` → `Facet.index`
 * - `Annotation.label` → `Feature.$type`
 * - `Annotation.value` → `Feature.data`
 *
 * The complement captures information that Layers does not represent:
 * expand semantics (expandStart/expandEnd), facet grouping (multiple
 * features at the same byte range), and feature classes.
 */

import { Document } from './core.js'
import type { DocumentJSON, FacetJSON } from './types.js'

// Import the actual Layers ATProto lexicon schemas.
// These are the source of truth for the Layers data model — the TypeScript
// types below are derived from these lexicon definitions.
import layersDefsLexicon from '../../../lexicons/pub/layers/defs.json' with { type: 'json' }
import layersAnnotationLexicon from '../../../lexicons/pub/layers/annotation/annotationLayer.json' with { type: 'json' }
import layersExpressionLexicon from '../../../lexicons/pub/layers/expression/expression.json' with { type: 'json' }
import rtDocumentLexicon from '../../../lexicons/org/relationaltext/richtext/document.json' with { type: 'json' }

// Re-export the raw lexicon JSON for consumers that need schema-level access.
export { layersDefsLexicon, layersAnnotationLexicon, layersExpressionLexicon, rtDocumentLexicon }

// ─── Layers types (derived from ATProto lexicon schemas above) ───────────────

/**
 * A Layers expression record.
 * Derived from `pub.layers.expression.expression` lexicon.
 */
export interface Expression {
  /** Raw UTF-8 text content. */
  readonly text: string
  /** Expression granularity. */
  readonly kind: 'document' | 'transcript' | 'paragraph' | 'sentence' | string
  /** BCP-47 language tag. */
  readonly language?: string
}

/** A byte-range anchor (identical to RelationalText's ByteSlice). */
export interface SpanAnchor {
  readonly $type: 'pub.layers.defs#span'
  readonly byteStart: number
  readonly byteEnd: number
}

/** A Layers annotation. */
export interface Annotation {
  /** Byte-range anchor into the expression text. */
  readonly anchor: SpanAnchor
  /** Annotation label (maps to feature $type#name). */
  readonly label: string
  /** Annotation value (maps to feature data fields). */
  readonly value: Record<string, unknown>
  /** Tree structure: parent annotation ID. */
  readonly parentId?: string
  /** Tree structure: child annotation IDs. */
  readonly childIds?: string[]
  /** Confidence score (0–1000). */
  readonly confidence?: number
}

/** A Layers annotation layer. */
export interface AnnotationLayer {
  /** Layer kind. */
  readonly kind?: 'token-tag' | 'span' | 'relation' | 'tree' | 'graph' | string
  /** Annotations in this layer. */
  readonly annotations: Annotation[]
}

/** Data lost during RT→Layers conversion, needed for lossless round-trip. */
export interface LayersComplement {
  /** expandStart/expandEnd per feature, keyed by `byteStart:byteEnd:label`. */
  readonly expandSemantics: Record<string, { expandStart?: boolean; expandEnd?: boolean }>
  /** Original feature class per feature, keyed by `byteStart:byteEnd:label`. */
  readonly featureClasses: Record<string, string>
  /** Original facet grouping: which features shared a byte range. */
  readonly facetGroups: Array<{ byteStart: number; byteEnd: number; labels: string[] }>
}

/** Result of converting a Document to Layers representation. */
export interface LayersExport {
  /** The expression record (text + metadata). */
  readonly expression: Expression
  /** Annotation layers (one layer with all annotations). */
  readonly annotationLayers: AnnotationLayer[]
  /** Complement for lossless round-trip. */
  readonly complement: LayersComplement
}

// ─── Panproto-backed conversion ──────────────────────────────────────────────

/**
 * Parse an ATProto lexicon JSON and return its schema metadata.
 *
 * This uses panproto's `parse_lexicon` through the WASM boundary —
 * no separate panproto dependency required.
 */
export async function parseLexiconSchema(lexiconJson: Record<string, unknown>): Promise<{
  id: string
  vertexCount: number
  edgeCount: number
}> {
  const wasm = await import('./wasm.js')
  const result = JSON.parse(
    wasm.parse_lexicon_schema(JSON.stringify(lexiconJson)) as string,
  ) as { id: string; vertexCount: number; edgeCount: number }
  return result
}

/**
 * Convert a document from one ATProto schema to another using panproto's
 * auto-generated protolens.
 *
 * This is the morphism-first conversion path: parse both lexicons,
 * auto-discover the structural alignment, and apply the derived lens.
 * No format-specific bridge code required.
 */
export async function convertViaPanproto(
  sourceLexicon: Record<string, unknown>,
  targetLexicon: Record<string, unknown>,
  doc: Document | DocumentJSON | object,
): Promise<unknown> {
  const wasm = await import('./wasm.js')
  const docJson = doc instanceof Document ? doc._raw() : JSON.stringify(doc)
  const result = wasm.convert_via_panproto(
    JSON.stringify(sourceLexicon),
    JSON.stringify(targetLexicon),
    docJson,
  )
  return JSON.parse(result as string)
}

/**
 * Convert a document between two ATProto schemas using panproto's
 * auto-generated protolens, with explicit lexicon typing.
 *
 * Wraps `convertViaPanproto` with typed lexicon parameters for callers
 * that hold arbitrary lexicon JSON and want a typed entry point without
 * importing the internal wasm module directly.
 */
export async function crossConvert(
  sourceLexicon: Record<string, unknown>,
  targetLexicon: Record<string, unknown>,
  doc: Document | DocumentJSON,
): Promise<unknown> {
  return convertViaPanproto(sourceLexicon, targetLexicon, doc)
}

/**
 * Convert a RelationalText Document to Layers representation using
 * panproto's cross-lexicon morphism discovery.
 *
 * Parses both the RT document lexicon and the Layers annotation lexicon,
 * auto-discovers the structural alignment, and applies the derived lens.
 * Falls back to the synchronous `toLayers` if panproto conversion fails.
 */
export async function toLayersViaPanproto(doc: Document | DocumentJSON): Promise<LayersExport> {
  try {
    const result = await convertViaPanproto(
      rtDocumentLexicon as Record<string, unknown>,
      layersAnnotationLexicon as Record<string, unknown>,
      doc,
    )
    return result as LayersExport
  } catch {
    return toLayers(doc)
  }
}

/**
 * Convert Layers representation back to a RelationalText Document using
 * panproto's cross-lexicon morphism discovery.
 *
 * Parses both the Layers annotation lexicon and the RT document lexicon,
 * auto-discovers the structural alignment, and applies the derived lens
 * in reverse. Falls back to the synchronous `fromLayers` if panproto
 * conversion fails.
 */
export async function fromLayersViaPanproto(
  expression: Expression,
  annotationLayers: AnnotationLayer[],
  complement?: LayersComplement,
): Promise<Document> {
  try {
    // Build a Layers export object to pass as the source document.
    const layersExport: LayersExport = {
      expression,
      annotationLayers,
      complement: complement ?? {
        expandSemantics: {},
        featureClasses: {},
        facetGroups: [],
      },
    }
    const result = await convertViaPanproto(
      layersAnnotationLexicon as Record<string, unknown>,
      rtDocumentLexicon as Record<string, unknown>,
      layersExport,
    )
    return Document.fromJSON(result as DocumentJSON)
  } catch {
    return fromLayers(expression, annotationLayers, complement)
  }
}

// ─── Direct conversion (synchronous, no panproto dependency) ─────────────────

/**
 * Convert a RelationalText Document to Layers representation.
 *
 * The complement captures expand semantics, feature classes, and facet
 * grouping — information that Layers does not represent but that is needed
 * to reconstruct the original Document via `fromLayers`.
 */
export function toLayers(doc: Document | DocumentJSON): LayersExport {
  const d = doc instanceof Document ? doc.toJSON() : doc

  const expression: Expression = {
    text: d.text,
    kind: 'document',
  }

  const annotations: Annotation[] = []
  const expandSemantics: Record<string, { expandStart?: boolean; expandEnd?: boolean }> = {}
  const featureClasses: Record<string, string> = {}
  const facetGroups: LayersComplement['facetGroups'] = []

  for (const facet of d.facets ?? []) {
    const labels: string[] = []

    for (const feature of facet.features) {
      const typeId = (feature as Record<string, unknown>)['$type'] as string | undefined
      const name = (feature as Record<string, unknown>)['name'] as string | undefined
      const label = typeId && name ? `${typeId}#${name}` : typeId ?? name ?? 'unknown'

      labels.push(label)

      // Build annotation value from feature data (everything except $type)
      const value: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(feature as Record<string, unknown>)) {
        if (k !== '$type') {
          value[k] = v
        }
      }

      annotations.push({
        anchor: {
          $type: 'pub.layers.defs#span',
          byteStart: facet.index.byteStart,
          byteEnd: facet.index.byteEnd,
        },
        label,
        value,
      })

      // Capture expand semantics in complement
      const key = `${facet.index.byteStart}:${facet.index.byteEnd}:${label}`
      const expandStart = (feature as Record<string, unknown>)['expandStart']
      const expandEnd = (feature as Record<string, unknown>)['expandEnd']
      if (expandStart !== undefined || expandEnd !== undefined) {
        expandSemantics[key] = {
          ...(expandStart !== undefined ? { expandStart: expandStart as boolean } : {}),
          ...(expandEnd !== undefined ? { expandEnd: expandEnd as boolean } : {}),
        }
      }
    }

    if (labels.length > 1) {
      facetGroups.push({
        byteStart: facet.index.byteStart,
        byteEnd: facet.index.byteEnd,
        labels,
      })
    }
  }

  return {
    expression,
    annotationLayers: [{ kind: 'span', annotations }],
    complement: { expandSemantics, featureClasses, facetGroups },
  }
}

/**
 * Convert Layers representation back to a RelationalText Document.
 *
 * If a complement from a prior `toLayers` call is provided, expand
 * semantics, feature classes, and facet grouping are restored for
 * lossless round-trip. Without a complement, default expand semantics
 * are used.
 */
export function fromLayers(
  expression: Expression,
  annotationLayers: AnnotationLayer[],
  complement?: LayersComplement,
): Document {
  // Collect all annotations across layers
  const allAnnotations: Annotation[] = annotationLayers.flatMap((l) => l.annotations)

  // Group annotations by byte range (respecting original facet grouping if complement available)
  const facetMap = new Map<string, { byteStart: number; byteEnd: number; features: Array<Record<string, unknown>> }>()

  for (const ann of allAnnotations) {
    const rangeKey = `${ann.anchor.byteStart}:${ann.anchor.byteEnd}`
    let entry = facetMap.get(rangeKey)
    if (!entry) {
      entry = { byteStart: ann.anchor.byteStart, byteEnd: ann.anchor.byteEnd, features: [] }
      facetMap.set(rangeKey, entry)
    }

    // Reconstruct feature from annotation
    const feature: Record<string, unknown> = {}

    // Parse label back to $type and name
    const hashIdx = ann.label.indexOf('#')
    if (hashIdx >= 0) {
      feature['$type'] = ann.label.substring(0, hashIdx)
      feature['name'] = ann.label.substring(hashIdx + 1)
    } else {
      feature['$type'] = ann.label
    }

    // Copy annotation value fields
    for (const [k, v] of Object.entries(ann.value)) {
      if (k !== '$type') {
        feature[k] = v
      }
    }

    // Restore expand semantics from complement
    if (complement) {
      const compKey = `${ann.anchor.byteStart}:${ann.anchor.byteEnd}:${ann.label}`
      const expand = complement.expandSemantics[compKey]
      if (expand) {
        if (expand.expandStart !== undefined) feature['expandStart'] = expand.expandStart
        if (expand.expandEnd !== undefined) feature['expandEnd'] = expand.expandEnd
      }
    }

    entry.features.push(feature)
  }

  // Build facets sorted by byte range
  const facets: FacetJSON[] = [...facetMap.values()]
    .sort((a, b) => a.byteStart - b.byteStart || b.byteEnd - a.byteEnd)
    .map((entry) => ({
      index: { byteStart: entry.byteStart, byteEnd: entry.byteEnd },
      features: entry.features as FacetJSON['features'],
    }))

  return Document.fromJSON({ text: expression.text, facets })
}
