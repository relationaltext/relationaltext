import { LayeredDocument } from './layered-document.js';
import './core.js';
import './types.js';
import './wasm.js';
import './wasm/relationaltext_wasm.js';

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

/** A reference to an annotation within a specific document. */
interface AnnotationRef {
    documentId: string;
    annotationUuid: string;
    layerKind: string;
    label?: string;
}
/** A concept entry: an entity referenced by multiple annotations. */
interface ConceptEntry {
    /** The knowledge reference key (source:identifier). */
    key: string;
    /** All annotation references pointing to this concept. */
    refs: AnnotationRef[];
}
declare class ConceptIndex {
    #private;
    /** Add a document's annotations to the index. */
    addDocument(documentId: string, doc: LayeredDocument): void;
    /** Remove a document from the index. */
    removeDocument(documentId: string): void;
    /** Find all annotations referencing a given entity. */
    findByEntity(source: string, identifier: string): AnnotationRef[];
    /** Find all shared concepts between two documents. */
    sharedConcepts(docIdA: string, docIdB: string): ConceptEntry[];
    /** Find all concepts in the index. */
    allConcepts(): ConceptEntry[];
    /** Number of unique concepts indexed. */
    get size(): number;
}

export { type AnnotationRef, type ConceptEntry, ConceptIndex };
