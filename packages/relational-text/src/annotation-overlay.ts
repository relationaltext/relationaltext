/**
 * Annotation overlay computation for rendering Layers annotations
 * on top of document text.
 *
 * Framework-agnostic: computes annotation positions and overlap
 * resolution, leaving actual rendering to the consumer.
 */

import type { KnowledgeRef } from './knowledge.js'

/** A flattened annotation range ready for rendering. */
export interface AnnotationRange {
  /** The annotation UUID. */
  uuid: string
  /** Byte start in the document text. */
  byteStart: number
  /** Byte end in the document text. */
  byteEnd: number
  /** The annotation label. */
  label: string
  /** The layer kind (token-tag, span, relation, tree, graph, tier, document-tag). */
  layerKind: string
  /** The layer subkind (ner, pos, dependency, etc.). */
  layerSubkind?: string | undefined
  /** Optional color/style hint for the layer. */
  color?: string | undefined
  /** Knowledge references for entity cards. */
  knowledgeRefs?: KnowledgeRef[] | undefined
}

/**
 * Compute flattened annotation ranges from multiple layers.
 * Resolves overlaps by stacking layers in order.
 *
 * The input shape mirrors the pub.layers.annotation.annotationLayer
 * and pub.layers.annotation.defs#annotation lexicons. The anchor
 * field is the polymorphic pub.layers.defs#anchor; we extract
 * textSpan (pub.layers.defs#span) for byte-offset positioning.
 */
export function computeAnnotationRanges(
  layers: Array<{
    kind: string
    subkind?: string
    annotations: Array<{
      uuid: string
      anchor?: { textSpan?: { byteStart: number; byteEnd: number } }
      label?: string
      knowledgeRefs?: KnowledgeRef[]
    }>
  }>,
  options?: { layerColors?: Record<string, string> },
): AnnotationRange[] {
  const ranges: AnnotationRange[] = []
  for (const layer of layers) {
    for (const ann of layer.annotations) {
      if (!ann.anchor?.textSpan) continue
      ranges.push({
        uuid: ann.uuid,
        byteStart: ann.anchor.textSpan.byteStart,
        byteEnd: ann.anchor.textSpan.byteEnd,
        label: ann.label ?? '',
        layerKind: layer.kind,
        layerSubkind: layer.subkind,
        color: options?.layerColors?.[layer.kind],
        knowledgeRefs: ann.knowledgeRefs,
      })
    }
  }
  // Sort by start position, then by end position descending (wider first)
  ranges.sort((a, b) => a.byteStart - b.byteStart || b.byteEnd - a.byteEnd)
  return ranges
}

/**
 * Find all annotations at a given byte offset.
 */
export function annotationsAt(ranges: AnnotationRange[], byteOffset: number): AnnotationRange[] {
  return ranges.filter((r) => r.byteStart <= byteOffset && byteOffset < r.byteEnd)
}

/**
 * Find all annotations overlapping a byte range.
 */
export function annotationsInRange(
  ranges: AnnotationRange[],
  start: number,
  end: number,
): AnnotationRange[] {
  return ranges.filter((r) => r.byteStart < end && r.byteEnd > start)
}
