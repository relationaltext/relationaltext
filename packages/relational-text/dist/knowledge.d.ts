/**
 * Knowledge reference resolution service.
 *
 * Resolves Layers knowledgeRef entries to external data from
 * Wikidata, chive.pub, FrameNet, and custom sources.
 *
 * The KnowledgeRef interface matches the pub.layers.defs#knowledgeRef
 * lexicon definition exactly.
 */
/**
 * A reference to an external knowledge base entry.
 * Derived from pub.layers.defs#knowledgeRef.
 */
interface KnowledgeRef {
    /** Knowledge base source slug. Known values: chive.pub, wikidata, wordnet, framenet, propbank, verbnet, unimorph, glottolog, cldr, custom. */
    source: string;
    /** AT-URI of the knowledge base type definition node. */
    sourceUri?: string;
    /** The identifier within the knowledge base (e.g., Wikidata QID, chive.pub node URI, Glottolog languoid ID). */
    identifier: string;
    /** Optional full URI for the knowledge base entry. */
    uri?: string;
    /** Human-readable label for the referenced entity. */
    label?: string;
}
/** A resolved knowledge entity with display-ready metadata. */
interface KnowledgeEntity {
    /** The original knowledge reference. */
    ref: KnowledgeRef;
    /** Human-readable label. */
    label: string;
    /** Short description of the entity. */
    description?: string;
    /** URL of a representative image. */
    imageUrl?: string;
    /** Arbitrary resolved properties from the knowledge base. */
    properties?: Record<string, unknown>;
    /** Canonical web URL for the entity. */
    url?: string;
}
declare class KnowledgeResolver {
    #private;
    /** Register a custom resolver for a knowledge source. */
    registerSource(name: string, resolver: (id: string) => Promise<KnowledgeEntity | null>): void;
    /** Resolve a single knowledge reference. */
    resolve(ref: KnowledgeRef): Promise<KnowledgeEntity | null>;
    /** Resolve multiple references in parallel. */
    resolveAll(refs: KnowledgeRef[]): Promise<Map<string, KnowledgeEntity>>;
}
/** Create a KnowledgeResolver with built-in Wikidata support. */
declare function createDefaultResolver(): KnowledgeResolver;

export { type KnowledgeEntity, type KnowledgeRef, KnowledgeResolver, createDefaultResolver };
