export { add_annotation_layer, add_block, add_mark, annotations_at_offset, annotations_in_byte_range, apply_lens, apply_lens_traced, compose_lenses, convert_via_panproto, create_layered_document, delete_text, detect_facets, execute_facet_sql, filter_facets_by_namespace, find_path_in_graph, insert_text, inverse_lens, layered_doc_delete_text, layered_doc_insert_text, layered_doc_to_document, migrate_ontology_annotations, ontology_to_schema, parse_document, parse_lexicon_schema, query_annotations, register_feature_type, register_lexicon, remove_mark, to_hir, validate_lens_sql } from './wasm/relationaltext_wasm.js';

/**
 * WASM loader for RelationalText.
 *
 * With the bundler target, wasm-bindgen generates a module that auto-initializes
 * when imported. This module re-exports all WASM functions and provides
 * `initRelationalText()` as a setup hook.
 */

/**
 * Initialize the RelationalText WASM module.
 *
 * With the bundler target, the WASM auto-initializes when first imported.
 * Call this once at application startup (e.g., in beforeAll in tests) to
 * ensure the module is loaded before any Document operations.
 *
 * Safe to call multiple times — initialization only happens once.
 */
declare function initRelationalText(): Promise<void>;

export { initRelationalText };
