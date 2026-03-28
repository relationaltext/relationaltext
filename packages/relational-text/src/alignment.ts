/**
 * Types for cross-document and cross-layer alignment.
 * Derived from the pub.layers.alignment lexicons:
 *   - pub.layers.alignment.alignment
 *   - pub.layers.defs#alignmentLink
 *   - pub.layers.defs#objectRef
 */

import type { KnowledgeRef } from './knowledge.js'

/**
 * Composable object reference (pub.layers.defs#objectRef).
 * Re-exported here for alignment consumers.
 */
export interface ObjectRef {
  localId?: { value: string }
  recordRef?: string
  objectId?: { value: string }
  knowledgeRef?: KnowledgeRef
}

/**
 * A single link in an alignment between two parallel sequences.
 * Derived from pub.layers.defs#alignmentLink.
 */
export interface AlignmentLink {
  sourceIndices?: number[]
  targetIndices?: number[]
  /** Alignment confidence 0-1000. */
  confidence?: number
  label?: string
  knowledgeRefs?: KnowledgeRef[]
  features?: { entries: Array<{ key: string; value: string }> }
}

/**
 * An alignment between two parallel sequences.
 * Derived from pub.layers.alignment.alignment.
 */
export interface Alignment {
  expression?: string
  kindUri?: string
  kind: string
  subkindUri?: string
  subkind?: string
  source?: ObjectRef
  target?: ObjectRef
  sourceLang?: string
  targetLang?: string
  links: AlignmentLink[]
  knowledgeRefs?: KnowledgeRef[]
  features?: { entries: Array<{ key: string; value: string }> }
  createdAt?: string
}
