/* @ts-self-types="./relationaltext_wasm.d.ts" */

import * as wasm from "./relationaltext_wasm_bg.wasm";
import { __wbg_set_wasm } from "./relationaltext_wasm_bg.js";
__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    add_annotation_layer, add_block, add_mark, annotations_at_offset, annotations_in_byte_range, apply_lens, apply_lens_traced, compose_lenses, convert_via_panproto, create_layered_document, delete_text, detect_facets, execute_facet_sql, filter_facets_by_namespace, find_path_in_graph, insert_text, inverse_lens, layered_doc_delete_text, layered_doc_insert_text, layered_doc_to_document, migrate_ontology_annotations, ontology_to_schema, parse_document, parse_lexicon_schema, project_annotations_by_type, query_annotations, register_feature_type, register_lexicon, remove_mark, to_hir, validate_lens_sql
} from "./relationaltext_wasm_bg.js";
