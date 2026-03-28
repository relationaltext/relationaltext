import { KnowledgeRef } from './knowledge.js';
import { LayersAnnotation } from './layered-document.js';
import './core.js';
import './types.js';
import './wasm.js';
import './wasm/relationaltext_wasm.js';

/**
 * Types for Layers' ontology system.
 * Derived from the pub.layers.ontology lexicons:
 *   - pub.layers.ontology.ontology
 *   - pub.layers.ontology.typeDef
 *   - pub.layers.ontology.defs#roleSlot
 */

/**
 * A constraint expression (pub.layers.defs#constraint).
 * Re-exported here for ontology consumers who don't need the
 * full experiment module.
 */
interface Constraint {
    expression: string;
    expressionFormatUri?: string;
    expressionFormat?: string;
    scopeUri?: string;
    scope?: string;
    context?: string[];
    description?: string;
}
/**
 * A role/argument slot in a frame or situation type definition.
 * Derived from pub.layers.ontology.defs#roleSlot.
 */
interface RoleSlot {
    roleName: string;
    roleDescription?: string;
    fillerTypeRefs?: string[];
    collectionRef?: string;
    required?: boolean;
    defaultValue?: string;
    constraints?: Constraint[];
    knowledgeRefs?: KnowledgeRef[];
    features?: {
        entries: Array<{
            key: string;
            value: string;
        }>;
    };
}
/**
 * A type definition within an ontology.
 * Derived from pub.layers.ontology.typeDef.
 */
interface TypeDef {
    ontologyRef: string;
    name: string;
    typeKindUri?: string;
    typeKind: 'entity-type' | 'situation-type' | 'role-type' | 'relation-type' | 'attribute-type' | (string & {});
    gloss?: string;
    parentTypeRef?: string;
    allowedRoles?: RoleSlot[];
    allowedValues?: string[];
    knowledgeRefs?: KnowledgeRef[];
    features?: {
        entries: Array<{
            key: string;
            value: string;
        }>;
    };
    createdAt?: string;
}
/**
 * An annotation ontology: a collection of typed definitions.
 * Derived from pub.layers.ontology.ontology.
 */
interface Ontology {
    name: string;
    description?: string;
    version?: string;
    domainUri?: string;
    domain?: string;
    parentRef?: string;
    personaRef?: string;
    knowledgeRefs?: KnowledgeRef[];
    createdAt?: string;
}
/** Schema metadata returned by ontologyToSchema. */
interface OntologySchemaMetadata {
    vertexCount: number;
    edgeCount: number;
    vertices: Array<{
        id: string;
        kind: string;
    }>;
    edges: Array<{
        src: string;
        tgt: string;
        kind: string;
        name?: string;
    }>;
}
/** Build a panproto schema from ontology type definitions. */
declare function ontologyToSchema(ontology: Ontology, typeDefs: TypeDef[]): Promise<OntologySchemaMetadata>;
/** Migrate annotations after an ontology change. */
declare function migrateAnnotations(oldOntology: {
    ontology: Ontology;
    typeDefs: TypeDef[];
}, newOntology: {
    ontology: Ontology;
    typeDefs: TypeDef[];
}, annotations: LayersAnnotation[]): Promise<LayersAnnotation[]>;

export { type Constraint, type Ontology, type OntologySchemaMetadata, type RoleSlot, type TypeDef, migrateAnnotations, ontologyToSchema };
