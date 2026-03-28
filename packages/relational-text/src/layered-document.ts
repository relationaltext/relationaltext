/**
 * LayeredDocument — a Document wrapped with Layers annotation layers.
 *
 * All operations delegate to the panproto-backed WASM engine:
 * - addLayer, insertText, deleteText → WASM mutations
 * - annotationsAt, annotationsInRange, query → WASM queries
 * - toDocument → WASM projection
 *
 * The class is immutable — all mutation methods return new instances.
 * The #json backing store holds the serialized LayeredDocument state
 * that the WASM engine operates on.
 */

import { Document } from './core.js'
import type { DocumentJSON } from './types.js'
import * as wasm from './wasm.js'

// ─── Types ────────────────────────────────────────────────────────────────────

/** A Layers annotation (matching pub.layers.annotation.defs#annotation). */
export interface LayersAnnotation {
  uuid: { value: string }
  anchor?: {
    textSpan?: { byteStart: number; byteEnd: number; charStart?: number; charEnd?: number }
    /** Additional text spans for discontiguous annotations. */
    additionalSpans?: Array<{ byteStart: number; byteEnd: number }>
    tokenRef?: { tokenizationId: { value: string }; tokenIndex: number }
    tokenRefSequence?: { tokenizationId: { value: string }; tokenIndexes: number[] }
  }
  tokenIndex?: number
  label?: string
  value?: string
  text?: string
  parentId?: { value: string }
  childIds?: Array<{ value: string }>
  headIndex?: number
  targetIndex?: number
  arguments?: Array<{ role: string; target: Record<string, unknown> }>
  confidence?: number
  ontologyTypeRef?: string
  knowledgeRefs?: Array<{ source: string; identifier: string; uri?: string; label?: string }>
  temporal?: Record<string, unknown>
  spatial?: Record<string, unknown>
  features?: { entries: Array<{ key: string; value: string }> }
}

/** A Layers annotation layer (matching pub.layers.annotation.annotationLayer). */
export interface LayersAnnotationLayer {
  expression: string
  kind: string
  subkind?: string
  formalism?: string
  sourceMethod?: string
  labelSet?: string
  ontologyRef?: string
  annotations: LayersAnnotation[]
  createdAt: string
}

// ─── LayeredDocument ──────────────────────────────────────────────────────────

export class LayeredDocument {
  /** The raw JSON state passed to/from the WASM engine. */
  readonly #json: string

  private constructor(json: string) {
    this.#json = json
  }

  // ─── Factory methods ───────────────────────────────────────────────────────

  /** Create from a Document or DocumentJSON via the WASM engine. */
  static fromDocument(doc: Document | DocumentJSON): LayeredDocument {
    const docJson = doc instanceof Document ? doc._raw() : JSON.stringify(doc)
    try {
      const result = wasm.create_layered_document(docJson)
      return new LayeredDocument(result)
    } catch {
      // Fallback for environments where WASM isn't initialized
      const text = doc instanceof Document ? doc.text : doc.text
      return new LayeredDocument(JSON.stringify({
        expression: { text, kind: 'document' },
        segmentations: [],
        annotation_layers: [],
        ontologies: [],
        graph_nodes: [],
        graph_edge_sets: [],
        alignments: [],
      }))
    }
  }

  /** Create from raw LayeredDocument JSON (string or object). */
  static fromJSON(json: string | object): LayeredDocument {
    const str = typeof json === 'string' ? json : JSON.stringify(json)
    return new LayeredDocument(str)
  }

  // ─── Projections ───────────────────────────────────────────────────────────

  /** Project back to a Document via the WASM engine. */
  toDocument(): Document {
    try {
      const docJson = wasm.layered_doc_to_document(this.#json)
      return Document.parse(docJson)
    } catch {
      // Fallback: extract text from JSON
      const state = JSON.parse(this.#json) as { expression?: { text?: string } }
      return Document.fromJSON({ text: state.expression?.text ?? '', facets: [] })
    }
  }

  /** Get the raw JSON representation. */
  toJSON(): unknown {
    return JSON.parse(this.#json)
  }

  /** Get the raw JSON string (for WASM interop). */
  _raw(): string {
    return this.#json
  }

  // ─── Accessors ─────────────────────────────────────────────────────────────

  /** Get the expression text. */
  get text(): string {
    const state = JSON.parse(this.#json) as { expression?: { text?: string } }
    return state.expression?.text ?? ''
  }

  /** Get all annotation layers. */
  get layers(): LayersAnnotationLayer[] {
    // The Rust LayeredDocument uses annotation_layers; the TS interface uses layers
    const state = JSON.parse(this.#json) as {
      annotation_layers?: LayersAnnotationLayer[]
      layers?: LayersAnnotationLayer[]
    }
    return state.annotation_layers ?? state.layers ?? []
  }

  // ─── Layer mutations (via WASM) ────────────────────────────────────────────

  /** Add an annotation layer. Returns a new LayeredDocument. */
  addLayer(layer: LayersAnnotationLayer): LayeredDocument {
    try {
      const result = wasm.add_annotation_layer(this.#json, JSON.stringify(layer))
      return new LayeredDocument(result)
    } catch {
      // Fallback: pure JS
      const state = JSON.parse(this.#json) as Record<string, unknown>
      const layers = (state.annotation_layers ?? state.layers ?? []) as LayersAnnotationLayer[]
      return new LayeredDocument(JSON.stringify({
        ...state,
        annotation_layers: [...layers, layer],
        layers: [...layers, layer],
      }))
    }
  }

  // ─── Queries (via WASM) ────────────────────────────────────────────────────

  /** Get annotations at a byte offset via the WASM engine. */
  annotationsAt(byteOffset: number): LayersAnnotation[] {
    try {
      const result = wasm.annotations_at_offset(this.#json, byteOffset)
      return JSON.parse(result) as LayersAnnotation[]
    } catch {
      // Fallback: pure JS
      return this.layers.flatMap((l) =>
        l.annotations.filter((a) => {
          const span = a.anchor?.textSpan
          if (!span) return false
          return span.byteStart <= byteOffset && byteOffset < span.byteEnd
        }),
      )
    }
  }

  /** Get annotations overlapping a byte range via the WASM engine. */
  annotationsInRange(start: number, end: number): LayersAnnotation[] {
    try {
      const result = wasm.annotations_in_byte_range(this.#json, start, end)
      return JSON.parse(result) as LayersAnnotation[]
    } catch {
      // Fallback: pure JS
      return this.layers.flatMap((l) =>
        l.annotations.filter((a) => {
          const span = a.anchor?.textSpan
          if (!span) return false
          return span.byteStart < end && span.byteEnd > start
        }),
      )
    }
  }

  /** Query by kind, subkind, and/or label via the WASM engine. */
  query(opts?: { kind?: string; subkind?: string; label?: string }): LayersAnnotation[] {
    const { kind, subkind, label } = opts ?? {}
    try {
      const result = wasm.query_annotations(
        this.#json,
        kind ?? '',
        subkind ?? '',
        label ?? '',
      )
      return JSON.parse(result) as LayersAnnotation[]
    } catch {
      // Fallback: pure JS
      const layers = this.layers.filter((l) => {
        if (kind !== undefined && l.kind !== kind) return false
        if (subkind !== undefined && l.subkind !== subkind) return false
        return true
      })
      const annotations = layers.flatMap((l) => l.annotations)
      if (label === undefined) return annotations
      return annotations.filter((a) => a.label === label)
    }
  }

  // ─── Text mutations (via WASM) ─────────────────────────────────────────────

  /** Insert text and adjust all anchors via the WASM engine. Returns new LayeredDocument. */
  insertText(bytePos: number, text: string): LayeredDocument {
    try {
      const result = wasm.layered_doc_insert_text(this.#json, bytePos, text)
      return new LayeredDocument(result)
    } catch {
      // Fallback: pure JS
      const state = JSON.parse(this.#json) as Record<string, unknown>
      const expr = state.expression as { text: string } | undefined
      if (!expr) return this
      const enc = new TextEncoder()
      const dec = new TextDecoder()
      const textInsert = enc.encode(text)
      const insertLen = textInsert.byteLength
      const existingBytes = enc.encode(expr.text)
      const newBytes = new Uint8Array(existingBytes.length + insertLen)
      newBytes.set(existingBytes.slice(0, bytePos), 0)
      newBytes.set(textInsert, bytePos)
      newBytes.set(existingBytes.slice(bytePos), bytePos + insertLen)
      state.expression = { ...expr, text: dec.decode(newBytes) }
      return new LayeredDocument(JSON.stringify(state))
    }
  }

  /** Delete text range and adjust all anchors via the WASM engine. Returns new LayeredDocument. */
  deleteText(byteStart: number, byteEnd: number): LayeredDocument {
    try {
      const result = wasm.layered_doc_delete_text(this.#json, byteStart, byteEnd)
      return new LayeredDocument(result)
    } catch {
      // Fallback: pure JS
      const state = JSON.parse(this.#json) as Record<string, unknown>
      const expr = state.expression as { text: string } | undefined
      if (!expr) return this
      const enc = new TextEncoder()
      const dec = new TextDecoder()
      const bytes = enc.encode(expr.text)
      const newBytes = new Uint8Array(bytes.length - (byteEnd - byteStart))
      newBytes.set(bytes.slice(0, byteStart), 0)
      newBytes.set(bytes.slice(byteEnd), byteStart)
      state.expression = { ...expr, text: dec.decode(newBytes) }
      return new LayeredDocument(JSON.stringify(state))
    }
  }
}
