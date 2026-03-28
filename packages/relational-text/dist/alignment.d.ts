import { KnowledgeRef } from './knowledge.js';

/**
 * Types for cross-document and cross-layer alignment.
 * Derived from the pub.layers.alignment lexicons:
 *   - pub.layers.alignment.alignment
 *   - pub.layers.defs#alignmentLink
 *   - pub.layers.defs#objectRef
 */

/**
 * Composable object reference (pub.layers.defs#objectRef).
 * Re-exported here for alignment consumers.
 */
interface ObjectRef {
    localId?: {
        value: string;
    };
    recordRef?: string;
    objectId?: {
        value: string;
    };
    knowledgeRef?: KnowledgeRef;
}
/**
 * A single link in an alignment between two parallel sequences.
 * Derived from pub.layers.defs#alignmentLink.
 */
interface AlignmentLink {
    sourceIndices?: number[];
    targetIndices?: number[];
    /** Alignment confidence 0-1000. */
    confidence?: number;
    label?: string;
    knowledgeRefs?: KnowledgeRef[];
    features?: {
        entries: Array<{
            key: string;
            value: string;
        }>;
    };
}
/**
 * An alignment between two parallel sequences.
 * Derived from pub.layers.alignment.alignment.
 */
interface Alignment {
    expression?: string;
    kindUri?: string;
    kind: string;
    subkindUri?: string;
    subkind?: string;
    source?: ObjectRef;
    target?: ObjectRef;
    sourceLang?: string;
    targetLang?: string;
    links: AlignmentLink[];
    knowledgeRefs?: KnowledgeRef[];
    features?: {
        entries: Array<{
            key: string;
            value: string;
        }>;
    };
    createdAt?: string;
}

export type { Alignment, AlignmentLink, ObjectRef };
