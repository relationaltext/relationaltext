/**
 * WASM loader for RelationalText.
 *
 * With the bundler target, wasm-bindgen generates a module that auto-initializes
 * when imported. This module re-exports all WASM functions and provides
 * `initRelationalText()` as a setup hook.
 */

export {
  parse_document,
  detect_facets,
  insert_text,
  delete_text,
  add_mark,
  remove_mark,
  add_block,
  to_hir,
  filter_facets_by_namespace,
  register_feature_type,
  register_lexicon,
  apply_lens,
  inverse_lens,
  compose_lenses,
  find_path_in_graph,
  execute_facet_sql,
  apply_lens_traced,
  validate_lens_sql,
  parse_lexicon_schema,
  convert_via_panproto,
  create_layered_document,
  add_annotation_layer,
  query_annotations,
  annotations_at_offset,
  annotations_in_byte_range,
  layered_doc_to_document,
  layered_doc_insert_text,
  layered_doc_delete_text,
  ontology_to_schema,
  migrate_ontology_annotations,
} from './wasm/relationaltext_wasm.js'

let initPromise: Promise<void> | null = null

/**
 * Initialize the RelationalText WASM module.
 *
 * With the bundler target, the WASM auto-initializes when first imported.
 * Call this once at application startup (e.g., in beforeAll in tests) to
 * ensure the module is loaded before any Document operations.
 *
 * Safe to call multiple times — initialization only happens once.
 */
export async function initRelationalText(): Promise<void> {
  if (!initPromise) {
    initPromise = import('./wasm/relationaltext_wasm.js').then(() => {})
  }
  return initPromise
}

