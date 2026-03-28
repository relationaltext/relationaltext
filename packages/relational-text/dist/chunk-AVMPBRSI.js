// src/wasm.ts
import {
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
  migrate_ontology_annotations
} from "./wasm/relationaltext_wasm.js";
var initPromise = null;
async function initRelationalText() {
  if (!initPromise) {
    initPromise = import("./wasm/relationaltext_wasm.js").then(() => {
    });
  }
  return initPromise;
}

export {
  initRelationalText,
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
  migrate_ontology_annotations
};
