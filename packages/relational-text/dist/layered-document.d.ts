import { Document } from './core.js';
import { DocumentJSON } from './types.js';
import './wasm.js';
import './wasm/relationaltext_wasm.js';

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

/** A Layers annotation (matching pub.layers.annotation.defs#annotation). */
interface LayersAnnotation {
    uuid: {
        value: string;
    };
    anchor?: {
        textSpan?: {
            byteStart: number;
            byteEnd: number;
            charStart?: number;
            charEnd?: number;
        };
        /** Additional text spans for discontiguous annotations. */
        additionalSpans?: Array<{
            byteStart: number;
            byteEnd: number;
        }>;
        tokenRef?: {
            tokenizationId: {
                value: string;
            };
            tokenIndex: number;
        };
        tokenRefSequence?: {
            tokenizationId: {
                value: string;
            };
            tokenIndexes: number[];
        };
    };
    tokenIndex?: number;
    label?: string;
    value?: string;
    text?: string;
    parentId?: {
        value: string;
    };
    childIds?: Array<{
        value: string;
    }>;
    headIndex?: number;
    targetIndex?: number;
    arguments?: Array<{
        role: string;
        target: Record<string, unknown>;
    }>;
    confidence?: number;
    ontologyTypeRef?: string;
    knowledgeRefs?: Array<{
        source: string;
        identifier: string;
        uri?: string;
        label?: string;
    }>;
    temporal?: Record<string, unknown>;
    spatial?: Record<string, unknown>;
    features?: {
        entries: Array<{
            key: string;
            value: string;
        }>;
    };
}
/** A Layers annotation layer (matching pub.layers.annotation.annotationLayer). */
interface LayersAnnotationLayer {
    expression: string;
    kind: string;
    subkind?: string;
    formalism?: string;
    sourceMethod?: string;
    labelSet?: string;
    ontologyRef?: string;
    annotations: LayersAnnotation[];
    createdAt: string;
}
declare class LayeredDocument {
    #private;
    private constructor();
    /** Create from a Document or DocumentJSON via the WASM engine. */
    static fromDocument(doc: Document | DocumentJSON): LayeredDocument;
    /** Create from raw LayeredDocument JSON (string or object). */
    static fromJSON(json: string | object): LayeredDocument;
    /** Project back to a Document via the WASM engine. */
    toDocument(): Document;
    /** Get the raw JSON representation. */
    toJSON(): unknown;
    /** Get the raw JSON string (for WASM interop). */
    _raw(): string;
    /** Get the expression text. */
    get text(): string;
    /** Get all annotation layers. */
    get layers(): LayersAnnotationLayer[];
    /** Add an annotation layer. Returns a new LayeredDocument. */
    addLayer(layer: LayersAnnotationLayer): LayeredDocument;
    /** Get annotations at a byte offset via the WASM engine. */
    annotationsAt(byteOffset: number): LayersAnnotation[];
    /** Get annotations overlapping a byte range via the WASM engine. */
    annotationsInRange(start: number, end: number): LayersAnnotation[];
    /** Query by kind, subkind, and/or label via the WASM engine. */
    query(opts?: {
        kind?: string;
        subkind?: string;
        label?: string;
    }): LayersAnnotation[];
    /** Insert text and adjust all anchors via the WASM engine. Returns new LayeredDocument. */
    insertText(bytePos: number, text: string): LayeredDocument;
    /** Delete text range and adjust all anchors via the WASM engine. Returns new LayeredDocument. */
    deleteText(byteStart: number, byteEnd: number): LayeredDocument;
}

export { LayeredDocument, type LayersAnnotation, type LayersAnnotationLayer };
