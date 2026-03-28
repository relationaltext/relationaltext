/**
 * Add an [`AnnotationLayer`] to an existing [`LayeredDocument`].
 *
 * `layered_doc_json`: a JSON string produced by `create_layered_document` or a
 * prior call to this function.
 * `layer_json`: a JSON object matching the `AnnotationLayer` schema.
 *
 * Returns the updated [`LayeredDocument`] as a JSON string.
 * @param {string} layered_doc_json
 * @param {string} layer_json
 * @returns {string}
 */
export function add_annotation_layer(layered_doc_json, layer_json) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(layered_doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(layer_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.add_annotation_layer(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Add a block element facet to a byte range.
 *
 * `doc_json`: the document as a JSON string
 * `byte_start`, `byte_end`: must cover exactly the marker character —
 *   `\n` (U+000A, 1 byte) for non-first blocks, or `\uFFFC` (U+FFFC, 3 bytes)
 *   for the first block in a document. The marker is placed BEFORE the block content.
 * `block_json`: a full feature object including `$type` (or `type_id`), e.g.
 *   `{ "$type": "org.relationaltext.facet", "name": "paragraph", "parents": [] }`.
 *   The type must be registered (e.g. via `register_lexicon`).
 *
 * Returns the updated document as a JSON string.
 * @param {string} doc_json
 * @param {number} byte_start
 * @param {number} byte_end
 * @param {string} block_json
 * @returns {string}
 */
export function add_block(doc_json, byte_start, byte_end, block_json) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(block_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.add_block(ptr0, len0, byte_start, byte_end, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Add an inline mark to a byte range.
 *
 * `doc_json`: the document as a JSON string
 * `byte_start`, `byte_end`: the range to mark
 * `mark_json`: a full feature object including `$type` (or `type_id`), e.g.
 *   `{ "$type": "org.relationaltext.facet", "name": "bold" }`. The type must be
 *   registered (e.g. via `register_lexicon`) for expand semantics.
 *
 * Returns the updated document as a JSON string.
 * @param {string} doc_json
 * @param {number} byte_start
 * @param {number} byte_end
 * @param {string} mark_json
 * @returns {string}
 */
export function add_mark(doc_json, byte_start, byte_end, mark_json) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(mark_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.add_mark(ptr0, len0, byte_start, byte_end, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Get all annotations that contain the given byte offset.
 *
 * `byte_offset`: a UTF-8 byte position within the expression text.
 *
 * Returns a JSON array of matching [`Annotation`] objects.
 * @param {string} layered_doc_json
 * @param {number} byte_offset
 * @returns {string}
 */
export function annotations_at_offset(layered_doc_json, byte_offset) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(layered_doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.annotations_at_offset(ptr0, len0, byte_offset);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Get all annotations whose span overlaps with the given byte range `[start, end)`.
 *
 * `start`: inclusive start of the byte range (UTF-8).
 * `end`: exclusive end of the byte range (UTF-8).
 *
 * Returns a JSON array of matching [`Annotation`] objects.
 * @param {string} layered_doc_json
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
export function annotations_in_byte_range(layered_doc_json, start, end) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(layered_doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.annotations_in_byte_range(ptr0, len0, start, end);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Apply a lens to all features in a document.
 *
 * Both arguments are JSON strings. Returns the transformed document as a JSON string.
 *
 * Uses the panproto-backed lens engine directly (no SQL intermediate).
 * @param {string} doc_json
 * @param {string} spec_json
 * @returns {string}
 */
export function apply_lens(doc_json, spec_json) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(spec_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.apply_lens(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Apply a lens to all features in a document with execution tracing.
 *
 * Returns a JSON object `{ document: DocumentJSON, trace: TraceEntry[] }` where
 * each `TraceEntry` describes how many features a rule matched.
 *
 * `TraceEntry` shape:
 * ```json
 * { "ruleIndex": 0, "matched": 3, "action": "emphasis \u2192 em", "isSql": false }
 * ```
 * @param {string} doc_json
 * @param {string} spec_json
 * @returns {string}
 */
export function apply_lens_traced(doc_json, spec_json) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(spec_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.apply_lens_traced(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Compose two lenses A→B and B→C.
 *
 * Both arguments are JSON strings (LensSpec). Returns a JSON string (LensSpec)
 * or `null` as a JsValue if the lenses are incompatible (first.target ≠ second.source).
 * @param {string} first_json
 * @param {string} second_json
 * @returns {any}
 */
export function compose_lenses(first_json, second_json) {
    const ptr0 = passStringToWasm0(first_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(second_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compose_lenses(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Convert a document from one ATProto schema to another using
 * panproto's auto-generated protolens.
 *
 * Takes the source lexicon JSON, target lexicon JSON, and a document
 * JSON string. Returns the converted document as a JSON string.
 *
 * This is the morphism-first conversion path: parse both lexicons,
 * auto-discover the structural alignment, and apply the derived lens.
 * @param {string} source_lexicon_json
 * @param {string} target_lexicon_json
 * @param {string} doc_json
 * @returns {string}
 */
export function convert_via_panproto(source_lexicon_json, target_lexicon_json, doc_json) {
    let deferred5_0;
    let deferred5_1;
    try {
        const ptr0 = passStringToWasm0(source_lexicon_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(target_lexicon_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.convert_via_panproto(ptr0, len0, ptr1, len1, ptr2, len2);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

/**
 * Create a [`LayeredDocument`] from a [`Document`] JSON string.
 *
 * Wraps the document text as an [`Expression`] with an empty set of annotation
 * layers. The returned JSON can be passed to the other `layered_doc_*` helpers.
 *
 * Returns the [`LayeredDocument`] as a JSON string.
 * @param {string} doc_json
 * @returns {string}
 */
export function create_layered_document(doc_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.create_layered_document(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Delete a byte range from the document, adjusting all facet ranges.
 *
 * `doc_json`: the document as a JSON string
 * `byte_start`: start of the range to delete (inclusive)
 * `byte_end`: end of the range to delete (exclusive)
 *
 * Returns the updated document as a JSON string.
 * @param {string} doc_json
 * @param {number} byte_start
 * @param {number} byte_end
 * @returns {string}
 */
export function delete_text(doc_json, byte_start, byte_end) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.delete_text(ptr0, len0, byte_start, byte_end);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Auto-detect @mentions, URLs, and #tags in a text string.
 *
 * Returns a JSON array of facets in canonical order.
 * The caller provides the type IDs to use for each detected feature kind.
 * Mentions are stored with a `"handle"` field; links with `"uri"`; tags with `"tag"`.
 * @param {string} text
 * @param {string} mention_type_id
 * @param {string} link_type_id
 * @param {string} tag_type_id
 * @returns {string}
 */
export function detect_facets(text, mention_type_id, link_type_id, tag_type_id) {
    let deferred6_0;
    let deferred6_1;
    try {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(mention_type_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(link_type_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(tag_type_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.detect_facets(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        var ptr5 = ret[0];
        var len5 = ret[1];
        if (ret[3]) {
            ptr5 = 0; len5 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred6_0 = ptr5;
        deferred6_1 = len5;
        return getStringFromWasm0(ptr5, len5);
    } finally {
        wasm.__wbindgen_free(deferred6_0, deferred6_1, 1);
    }
}

/**
 * Execute SQL statements against a document's facet array.
 *
 * **Deprecated**: The facet-sql engine has been removed. This function now
 * returns the input document unchanged (no-op passthrough).
 * @param {string} doc_json
 * @param {string} _sql
 * @returns {string}
 */
export function execute_facet_sql(doc_json, _sql) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(_sql, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.execute_facet_sql(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Filter facets to only those containing features in the given namespace.
 *
 * `namespace` is matched as a prefix against each feature's `type_id`
 * (e.g. `"app.bsky.richtext.facet"` keeps only mention/link/tag features).
 * Normalizes the document before filtering. Returns a JSON array of matching facets.
 * @param {string} doc_json
 * @param {string} namespace
 * @returns {string}
 */
export function filter_facets_by_namespace(doc_json, namespace) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(namespace, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.filter_facets_by_namespace(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * BFS shortest path through a list of lens specs from source to target.
 *
 * `specs_json` is a JSON array of LensSpec objects. Returns a JSON string (LensSpec)
 * or `null` as a JsValue if no path exists.
 * @param {string} specs_json
 * @param {string} source
 * @param {string} target
 * @returns {any}
 */
export function find_path_in_graph(specs_json, source, target) {
    const ptr0 = passStringToWasm0(specs_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(source, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(target, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.find_path_in_graph(ptr0, len0, ptr1, len1, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Insert text at a byte position, adjusting all facet ranges.
 *
 * `doc_json`: the document as a JSON string
 * `byte_pos`: the byte position to insert at (UTF-8)
 * `text`: the text to insert
 *
 * Returns the updated document as a JSON string.
 * @param {string} doc_json
 * @param {number} byte_pos
 * @param {string} text
 * @returns {string}
 */
export function insert_text(doc_json, byte_pos, text) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.insert_text(ptr0, len0, byte_pos, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Compute the inverse of a lens. Throws if the lens is lossy or is a WASM lens.
 *
 * Takes and returns a JSON string (LensSpec).
 * @param {string} spec_json
 * @returns {string}
 */
export function inverse_lens(spec_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(spec_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.inverse_lens(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Delete a byte range from the expression and adjust all annotation anchors.
 *
 * `byte_start`: inclusive start of the range to delete (UTF-8).
 * `byte_end`: exclusive end of the range to delete (UTF-8).
 *
 * Spans fully within the deleted range are collapsed to a zero-width point.
 * Spans partially overlapping are shrunk. Spans after the deletion are shifted left.
 *
 * Returns the updated [`LayeredDocument`] as a JSON string.
 * @param {string} layered_doc_json
 * @param {number} byte_start
 * @param {number} byte_end
 * @returns {string}
 */
export function layered_doc_delete_text(layered_doc_json, byte_start, byte_end) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(layered_doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.layered_doc_delete_text(ptr0, len0, byte_start, byte_end);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Insert text into the expression and adjust all annotation anchors.
 *
 * `byte_pos`: the UTF-8 byte position at which to insert.
 * `text`: the text to insert.
 *
 * Annotation spans starting at or after `byte_pos` are shifted right;
 * spans containing `byte_pos` have their end extended.
 *
 * Returns the updated [`LayeredDocument`] as a JSON string.
 * @param {string} layered_doc_json
 * @param {number} byte_pos
 * @param {string} text
 * @returns {string}
 */
export function layered_doc_insert_text(layered_doc_json, byte_pos, text) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(layered_doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.layered_doc_insert_text(ptr0, len0, byte_pos, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Project a [`LayeredDocument`] back to a [`Document`] with facets.
 *
 * Returns the projected [`Document`] as a JSON string.
 * @param {string} layered_doc_json
 * @returns {string}
 */
export function layered_doc_to_document(layered_doc_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(layered_doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.layered_doc_to_document(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Migrate annotations after an ontology change.
 *
 * Input: old ontology JSON, new ontology JSON (both with `ontology` and
 * `typeDefs` fields), and annotations JSON array.
 * Returns: migrated annotations JSON array.
 * @param {string} old_ontology_json
 * @param {string} new_ontology_json
 * @param {string} annotations_json
 * @returns {string}
 */
export function migrate_ontology_annotations(old_ontology_json, new_ontology_json, annotations_json) {
    let deferred5_0;
    let deferred5_1;
    try {
        const ptr0 = passStringToWasm0(old_ontology_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(new_ontology_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(annotations_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.migrate_ontology_annotations(ptr0, len0, ptr1, len1, ptr2, len2);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

/**
 * Build a panproto schema from ontology TypeDef records (JSON).
 *
 * Input: JSON object with `ontology` and `typeDefs` fields matching the
 * Layers ontology types.
 * Returns: schema metadata as JSON with `vertexCount`, `edgeCount`,
 * `vertices`, and `edges` fields.
 * @param {string} ontology_json
 * @returns {string}
 */
export function ontology_to_schema(ontology_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(ontology_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ontology_to_schema(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Parse a document from AT Protocol JSON.
 *
 * Returns the document as a JSON string (normalized).
 * Throws if the input is not valid JSON or has invalid structure.
 * @param {string} json
 * @returns {string}
 */
export function parse_document(json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.parse_document(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Parse an ATProto lexicon JSON document into a schema and return
 * its metadata as a JSON string.
 *
 * This exposes panproto's `parse_lexicon` through the relationaltext
 * WASM module, enabling browser-side schema operations without a
 * separate panproto WASM dependency.
 *
 * Returns a JSON string with `{ id, vertexCount, edgeCount, vertices, edges }`.
 * @param {string} lexicon_json
 * @returns {string}
 */
export function parse_lexicon_schema(lexicon_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(lexicon_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.parse_lexicon_schema(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Project annotations from a LayeredDocument by type names.
 *
 * Given a LayeredDocument JSON and a JSON array of annotation labels,
 * returns only the annotations matching those labels across all layers.
 *
 * This provides schema-driven filtering as an alternative to manual
 * iteration over annotation layers.
 * @param {string} layered_doc_json
 * @param {string} type_names_json
 * @returns {string}
 */
export function project_annotations_by_type(layered_doc_json, type_names_json) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(layered_doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(type_names_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.project_annotations_by_type(ptr0, len0, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Query annotations on a [`LayeredDocument`] by kind, subkind, and label.
 *
 * Empty strings are treated as "no filter" for each parameter. Pass an empty
 * string `""` for any parameter you want to leave unconstrained.
 *
 * Returns a JSON array of matching [`Annotation`] objects.
 * @param {string} layered_doc_json
 * @param {string} kind
 * @param {string} subkind
 * @param {string} label
 * @returns {string}
 */
export function query_annotations(layered_doc_json, kind, subkind, label) {
    let deferred6_0;
    let deferred6_1;
    try {
        const ptr0 = passStringToWasm0(layered_doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(kind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(subkind, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(label, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.query_annotations(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        var ptr5 = ret[0];
        var len5 = ret[1];
        if (ret[3]) {
            ptr5 = 0; len5 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred6_0 = ptr5;
        deferred6_1 = len5;
        return getStringFromWasm0(ptr5, len5);
    } finally {
        wasm.__wbindgen_free(deferred6_0, deferred6_1, 1);
    }
}

/**
 * Register a single custom feature type descriptor.
 *
 * `json` shape:
 * ```json
 * {
 *   "typeId": "com.example.custom#variant",
 *   "featureClass": "block" | "inline" | "entity",
 *   "expandStart": true,
 *   "expandEnd": false
 * }
 * ```
 * @param {string} json
 */
export function register_feature_type(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.register_feature_type(ptr0, len0);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Register all feature types defined in a format-lexicon JSON blob.
 *
 * Accepts a `org.relationaltext.format-lexicon` JSON object (or any object with
 * a top-level `"features"` array). Each entry in the array is registered via
 * the registry's `register_from_json_array` method.
 *
 * TypeIds with `@version` suffixes also register the unversioned base key.
 * @param {string} json
 */
export function register_lexicon(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.register_lexicon(ptr0, len0);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Remove a mark from a byte range.
 *
 * `doc_json`: the document as a JSON string
 * `byte_start`, `byte_end`: the exact byte range of the facet to modify
 * `type_key`: the compound key (`$type#name`, e.g. `"org.relationaltext.richtext.mark#bold"`)
 *   or a plain `$type` (e.g. `"app.bsky.richtext.facet#mention"`). Matching tries both
 *   exact `type_id` equality and split-compound-key matching against `type_id + data["name"]`.
 *
 * Facets that become empty after feature removal are deleted entirely.
 * Returns the updated document as a JSON string.
 * @param {string} doc_json
 * @param {number} byte_start
 * @param {number} byte_end
 * @param {string} type_key
 * @returns {string}
 */
export function remove_mark(doc_json, byte_start, byte_end, type_key) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(type_key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.remove_mark(ptr0, len0, byte_start, byte_end, ptr1, len1);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Build the Hierarchical Intermediate Representation (HIR) from a document.
 *
 * Returns the HIR as a JSON value suitable for rendering.
 * @param {string} doc_json
 * @returns {string}
 */
export function to_hir(doc_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(doc_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.to_hir(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Validate SQL escape-hatch strings in a lens spec without executing them.
 *
 * Returns a JSON array of `{ ruleIndex: number, message: string }` objects.
 * An empty array means all SQL rules are syntactically valid.
 *
 * Example:
 * ```json
 * [{ "ruleIndex": 2, "message": "near 'INSRT': syntax error" }]
 * ```
 * @param {string} _spec_json
 * @returns {string}
 */
export function validate_lens_sql(_spec_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(_spec_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.validate_lens_sql(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}
export function __wbg_Error_fe3709820da6d9f4(arg0, arg1) {
    const ret = Error(getStringFromWasm0(arg0, arg1));
    return ret;
}
export function __wbindgen_cast_0000000000000001(arg0, arg1) {
    // Cast intrinsic for `Ref(String) -> Externref`.
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
}
export function __wbindgen_init_externref_table() {
    const table = wasm.__wbindgen_externrefs;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
}
function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;


let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}
