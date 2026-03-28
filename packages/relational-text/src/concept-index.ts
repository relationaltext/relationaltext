/**
 * Cross-document concept linking index.
 *
 * When multiple LayeredDocuments share annotations referencing the same
 * knowledge base entity (e.g. Wikidata Q14806 = flour), they share a
 * concept. This index enables:
 *
 * - Finding all documents annotating the same entity
 * - Finding all annotations of a given entity across documents
 * - Finding shared concepts between two documents
 */

import type { LayeredDocument } from './layered-document.js'

/** A reference to an annotation within a specific document. */
export interface AnnotationRef {
  documentId: string
  annotationUuid: string
  layerKind: string
  label?: string
}

/** A concept entry: an entity referenced by multiple annotations. */
export interface ConceptEntry {
  /** The knowledge reference key (source:identifier). */
  key: string
  /** All annotation references pointing to this concept. */
  refs: AnnotationRef[]
}

export class ConceptIndex {
  #index = new Map<string, AnnotationRef[]>()

  /** Add a document's annotations to the index. */
  addDocument(documentId: string, doc: LayeredDocument): void {
    for (const layer of doc.layers) {
      for (const ann of layer.annotations) {
        if (!ann.knowledgeRefs) continue
        for (const ref of ann.knowledgeRefs) {
          const key = `${ref.source}:${ref.identifier}`
          const entry: AnnotationRef = {
            documentId,
            annotationUuid: ann.uuid.value,
            layerKind: layer.kind,
            ...(ann.label !== undefined ? { label: ann.label } : {}),
          }
          const existing = this.#index.get(key)
          if (existing) {
            existing.push(entry)
          } else {
            this.#index.set(key, [entry])
          }
        }
      }
    }
  }

  /** Remove a document from the index. */
  removeDocument(documentId: string): void {
    for (const [key, refs] of this.#index) {
      const filtered = refs.filter((r) => r.documentId !== documentId)
      if (filtered.length === 0) {
        this.#index.delete(key)
      } else {
        this.#index.set(key, filtered)
      }
    }
  }

  /** Find all annotations referencing a given entity. */
  findByEntity(source: string, identifier: string): AnnotationRef[] {
    return this.#index.get(`${source}:${identifier}`) ?? []
  }

  /** Find all shared concepts between two documents. */
  sharedConcepts(docIdA: string, docIdB: string): ConceptEntry[] {
    const result: ConceptEntry[] = []
    for (const [key, refs] of this.#index) {
      const hasA = refs.some((r) => r.documentId === docIdA)
      const hasB = refs.some((r) => r.documentId === docIdB)
      if (hasA && hasB) {
        result.push({ key, refs })
      }
    }
    return result
  }

  /** Find all concepts in the index. */
  allConcepts(): ConceptEntry[] {
    return Array.from(this.#index.entries()).map(([key, refs]) => ({ key, refs }))
  }

  /** Number of unique concepts indexed. */
  get size(): number {
    return this.#index.size
  }
}
