/**
 * Types for Layers' ontology system.
 * Derived from the pub.layers.ontology lexicons:
 *   - pub.layers.ontology.ontology
 *   - pub.layers.ontology.typeDef
 *   - pub.layers.ontology.defs#roleSlot
 */

import type { KnowledgeRef } from './knowledge.js'
import type { LayersAnnotation } from './layered-document.js'
import { ontology_to_schema, migrate_ontology_annotations } from './wasm.js'

/**
 * A constraint expression (pub.layers.defs#constraint).
 * Re-exported here for ontology consumers who don't need the
 * full experiment module.
 */
export interface Constraint {
  expression: string
  expressionFormatUri?: string
  expressionFormat?: string
  scopeUri?: string
  scope?: string
  context?: string[]
  description?: string
}

/**
 * A role/argument slot in a frame or situation type definition.
 * Derived from pub.layers.ontology.defs#roleSlot.
 */
export interface RoleSlot {
  roleName: string
  roleDescription?: string
  fillerTypeRefs?: string[]
  collectionRef?: string
  required?: boolean
  defaultValue?: string
  constraints?: Constraint[]
  knowledgeRefs?: KnowledgeRef[]
  features?: { entries: Array<{ key: string; value: string }> }
}

/**
 * A type definition within an ontology.
 * Derived from pub.layers.ontology.typeDef.
 */
export interface TypeDef {
  ontologyRef: string
  name: string
  typeKindUri?: string
  typeKind: 'entity-type' | 'situation-type' | 'role-type' | 'relation-type' | 'attribute-type' | (string & {})
  gloss?: string
  parentTypeRef?: string
  allowedRoles?: RoleSlot[]
  allowedValues?: string[]
  knowledgeRefs?: KnowledgeRef[]
  features?: { entries: Array<{ key: string; value: string }> }
  createdAt?: string
}

/**
 * An annotation ontology: a collection of typed definitions.
 * Derived from pub.layers.ontology.ontology.
 */
export interface Ontology {
  name: string
  description?: string
  version?: string
  domainUri?: string
  domain?: string
  parentRef?: string
  personaRef?: string
  knowledgeRefs?: KnowledgeRef[]
  createdAt?: string
}

// ─── Panproto schema bridge ──────────────────────────────────────────────────

/** Schema metadata returned by ontologyToSchema. */
export interface OntologySchemaMetadata {
  vertexCount: number
  edgeCount: number
  vertices: Array<{ id: string; kind: string }>
  edges: Array<{ src: string; tgt: string; kind: string; name?: string }>
}

/** Build a panproto schema from ontology type definitions. */
export async function ontologyToSchema(
  ontology: Ontology,
  typeDefs: TypeDef[],
): Promise<OntologySchemaMetadata> {
  const input = JSON.stringify({ ontology, typeDefs })
  const result = ontology_to_schema(input)
  return JSON.parse(result) as OntologySchemaMetadata
}

/** Migrate annotations after an ontology change. */
export async function migrateAnnotations(
  oldOntology: { ontology: Ontology; typeDefs: TypeDef[] },
  newOntology: { ontology: Ontology; typeDefs: TypeDef[] },
  annotations: LayersAnnotation[],
): Promise<LayersAnnotation[]> {
  const oldJson = JSON.stringify(oldOntology)
  const newJson = JSON.stringify(newOntology)
  const annJson = JSON.stringify(annotations)
  const result = migrate_ontology_annotations(oldJson, newJson, annJson)
  return JSON.parse(result) as LayersAnnotation[]
}
