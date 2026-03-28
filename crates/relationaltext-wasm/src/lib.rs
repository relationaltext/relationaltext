//! WASM bindings for RelationalText.
//!
//! All functions take/return JSON strings for maximum interoperability.
//! The TypeScript wrapper package (`packages/relational-text`) provides ergonomic
//! typed wrappers around these raw WASM exports.
//!
//! ## Lexicon registration
//!
//! The WASM module starts with an empty registry — it has no built-in knowledge
//! of any specific format. Call the registration helpers before use:
//!
//! - `register_lexicon(json)` — bulk registration from a `org.relationaltext.format-lexicon` JSON blob
//! - `register_feature_type(json)` — register any single custom `$type` descriptor

use relationaltext_core::{
    document::{Document, Facet, Feature},
    hir, lens as lens_core,
    lexicon::{FeatureClass, LexiconBehavior, LexiconRegistry},
    normalize, position, serde_atproto,
};
use std::cell::RefCell;
use wasm_bindgen::prelude::*;

// ─── Thread-local registry ────────────────────────────────────────────────────

thread_local! {
    static REGISTRY: RefCell<LexiconRegistry> = RefCell::new(LexiconRegistry::new());
}

fn with_registry<F, R>(f: F) -> R
where
    F: FnOnce(&LexiconRegistry) -> R,
{
    REGISTRY.with(|r| f(&r.borrow()))
}

fn mutate_registry<F>(f: F)
where
    F: FnOnce(&mut LexiconRegistry),
{
    REGISTRY.with(|r| f(&mut r.borrow_mut()))
}

// ─── Lexicon registration ─────────────────────────────────────────────────────

/// Register all feature types defined in a format-lexicon JSON blob.
///
/// Accepts a `org.relationaltext.format-lexicon` JSON object (or any object with
/// a top-level `"features"` array). Each entry in the array is registered via
/// the registry's `register_from_json_array` method.
///
/// TypeIds with `@version` suffixes also register the unversioned base key.
#[wasm_bindgen]
pub fn register_lexicon(json: &str) -> Result<(), JsError> {
    let v: serde_json::Value = serde_json::from_str(json)
        .map_err(|e| JsError::new(&format!("register_lexicon parse error: {}", e)))?;
    let features = v["features"]
        .as_array()
        .ok_or_else(|| JsError::new("register_lexicon: 'features' array required"))?;
    REGISTRY.with(|r| {
        r.borrow_mut()
            .register_from_json_array(features)
            .map_err(|e| JsError::new(&e))
    })
}

/// Register a single custom feature type descriptor.
///
/// `json` shape:
/// ```json
/// {
///   "typeId": "com.example.custom#variant",
///   "featureClass": "block" | "inline" | "entity",
///   "expandStart": true,
///   "expandEnd": false
/// }
/// ```
#[wasm_bindgen]
pub fn register_feature_type(json: &str) -> Result<(), JsError> {
    let v: serde_json::Value =
        serde_json::from_str(json).map_err(|e| JsError::new(&e.to_string()))?;

    let type_id = v["typeId"]
        .as_str()
        .ok_or_else(|| JsError::new("register_feature_type: missing \"typeId\" field"))?
        .to_string();

    let feature_class = match v["featureClass"].as_str() {
        Some("block") => FeatureClass::Block,
        Some("entity") => FeatureClass::Entity,
        Some("comment") => FeatureClass::Comment,
        Some("meta") => FeatureClass::Meta,
        _ => FeatureClass::InlineMark,
    };

    let expand_start = v["expandStart"].as_bool().unwrap_or(false);
    let expand_end = v["expandEnd"].as_bool().unwrap_or(false);

    mutate_registry(|r| {
        r.register(
            type_id,
            LexiconBehavior {
                feature_class,
                expand_start,
                expand_end,
                void: v["void"].as_bool().unwrap_or(false),
            },
        );
    });

    Ok(())
}

// ─── WASM exports ─────────────────────────────────────────────────────────────

/// Parse a document from AT Protocol JSON.
///
/// Returns the document as a JSON string (normalized).
/// Throws if the input is not valid JSON or has invalid structure.
#[wasm_bindgen]
pub fn parse_document(json: &str) -> Result<String, JsError> {
    let doc = serde_atproto::from_json(json).map_err(|e| JsError::new(&e.to_string()))?;
    with_registry(|registry| {
        serde_atproto::to_json(&doc, registry).map_err(|e| JsError::new(&e.to_string()))
    })
}

/// Auto-detect @mentions, URLs, and #tags in a text string.
///
/// Returns a JSON array of facets in canonical order.
/// The caller provides the type IDs to use for each detected feature kind.
/// Mentions are stored with a `"handle"` field; links with `"uri"`; tags with `"tag"`.
#[wasm_bindgen]
pub fn detect_facets(
    text: &str,
    mention_type_id: &str,
    link_type_id: &str,
    tag_type_id: &str,
) -> Result<String, JsError> {
    let facets = auto_detect(text, mention_type_id, link_type_id, tag_type_id);
    serde_json::to_string(&facets).map_err(|e| JsError::new(&e.to_string()))
}

/// Insert text at a byte position, adjusting all facet ranges.
///
/// `doc_json`: the document as a JSON string
/// `byte_pos`: the byte position to insert at (UTF-8)
/// `text`: the text to insert
///
/// Returns the updated document as a JSON string.
#[wasm_bindgen]
pub fn insert_text(doc_json: &str, byte_pos: u32, text: &str) -> Result<String, JsError> {
    let mut doc = serde_atproto::from_json(doc_json).map_err(|e| JsError::new(&e.to_string()))?;
    let byte_len = text.len() as u32;
    doc.text.insert_str(byte_pos as usize, text);
    with_registry(|registry| {
        position::adjust_facets_for_insert(&mut doc, byte_pos, byte_len, registry);
        serde_atproto::to_json(&doc, registry).map_err(|e| JsError::new(&e.to_string()))
    })
}

/// Delete a byte range from the document, adjusting all facet ranges.
///
/// `doc_json`: the document as a JSON string
/// `byte_start`: start of the range to delete (inclusive)
/// `byte_end`: end of the range to delete (exclusive)
///
/// Returns the updated document as a JSON string.
#[wasm_bindgen]
pub fn delete_text(doc_json: &str, byte_start: u32, byte_end: u32) -> Result<String, JsError> {
    let mut doc = serde_atproto::from_json(doc_json).map_err(|e| JsError::new(&e.to_string()))?;

    if byte_start < byte_end && (byte_end as usize) <= doc.text.len() {
        doc.text.drain(byte_start as usize..byte_end as usize);
        position::adjust_facets_for_delete(&mut doc, byte_start, byte_end);
    }

    with_registry(|registry| {
        serde_atproto::to_json(&doc, registry).map_err(|e| JsError::new(&e.to_string()))
    })
}

/// Build a Feature from a JSON object. Expects `$type` or `type_id`; the rest becomes data.
fn feature_from_input_json(json: &str) -> Result<Feature, String> {
    let mut data: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(json).map_err(|e| format!("invalid JSON: {e}"))?;
    let type_id = data
        .remove("$type")
        .or_else(|| data.remove("type_id"))
        .and_then(|v| v.as_str().map(String::from))
        .ok_or("feature must include $type or type_id")?;
    Ok(Feature { type_id, data })
}

/// Add an inline mark to a byte range.
///
/// `doc_json`: the document as a JSON string
/// `byte_start`, `byte_end`: the range to mark
/// `mark_json`: a full feature object including `$type` (or `type_id`), e.g.
///   `{ "$type": "org.relationaltext.facet", "name": "bold" }`. The type must be
///   registered (e.g. via `register_lexicon`) for expand semantics.
///
/// Returns the updated document as a JSON string.
#[wasm_bindgen]
pub fn add_mark(
    doc_json: &str,
    byte_start: u32,
    byte_end: u32,
    mark_json: &str,
) -> Result<String, JsError> {
    let mut doc = serde_atproto::from_json(doc_json).map_err(|e| JsError::new(&e.to_string()))?;

    let feat = feature_from_input_json(mark_json).map_err(|e| JsError::new(&e))?;

    doc.facets
        .push(Facet::new(byte_start, byte_end, vec![feat]));
    with_registry(|registry| {
        normalize::normalize(&mut doc, registry);
        serde_atproto::to_json(&doc, registry).map_err(|e| JsError::new(&e.to_string()))
    })
}

/// Add a block element facet to a byte range.
///
/// `doc_json`: the document as a JSON string
/// `byte_start`, `byte_end`: must cover exactly the marker character —
///   `\n` (U+000A, 1 byte) for non-first blocks, or `\uFFFC` (U+FFFC, 3 bytes)
///   for the first block in a document. The marker is placed BEFORE the block content.
/// `block_json`: a full feature object including `$type` (or `type_id`), e.g.
///   `{ "$type": "org.relationaltext.facet", "name": "paragraph", "parents": [] }`.
///   The type must be registered (e.g. via `register_lexicon`).
///
/// Returns the updated document as a JSON string.
#[wasm_bindgen]
pub fn add_block(
    doc_json: &str,
    byte_start: u32,
    byte_end: u32,
    block_json: &str,
) -> Result<String, JsError> {
    let mut doc = serde_atproto::from_json(doc_json).map_err(|e| JsError::new(&e.to_string()))?;

    let feat = feature_from_input_json(block_json).map_err(|e| JsError::new(&e))?;

    doc.facets
        .push(Facet::new(byte_start, byte_end, vec![feat]));
    with_registry(|registry| {
        normalize::normalize(&mut doc, registry);
        serde_atproto::to_json(&doc, registry).map_err(|e| JsError::new(&e.to_string()))
    })
}

/// Remove a mark from a byte range.
///
/// `doc_json`: the document as a JSON string
/// `byte_start`, `byte_end`: the exact byte range of the facet to modify
/// `type_key`: the compound key (`$type#name`, e.g. `"org.relationaltext.richtext.mark#bold"`)
///   or a plain `$type` (e.g. `"app.bsky.richtext.facet#mention"`). Matching tries both
///   exact `type_id` equality and split-compound-key matching against `type_id + data["name"]`.
///
/// Facets that become empty after feature removal are deleted entirely.
/// Returns the updated document as a JSON string.
#[wasm_bindgen]
pub fn remove_mark(
    doc_json: &str,
    byte_start: u32,
    byte_end: u32,
    type_key: &str,
) -> Result<String, JsError> {
    let mut doc = serde_atproto::from_json(doc_json).map_err(|e| JsError::new(&e.to_string()))?;
    normalize::remove_mark(&mut doc, byte_start, byte_end, type_key);
    with_registry(|registry| {
        serde_atproto::to_json(&doc, registry).map_err(|e| JsError::new(&e.to_string()))
    })
}

/// Build the Hierarchical Intermediate Representation (HIR) from a document.
///
/// Returns the HIR as a JSON value suitable for rendering.
#[wasm_bindgen]
pub fn to_hir(doc_json: &str) -> Result<String, JsError> {
    let doc = serde_atproto::from_json(doc_json).map_err(|e| JsError::new(&e.to_string()))?;
    with_registry(|registry| {
        let hir_nodes = hir::build_hir_from_doc(&doc, registry);
        let json_nodes: Vec<serde_json::Value> = hir_nodes.iter().map(hir_node_to_json).collect();
        serde_json::to_string(&json_nodes).map_err(|e| JsError::new(&e.to_string()))
    })
}

/// Filter facets to only those containing features in the given namespace.
///
/// `namespace` is matched as a prefix against each feature's `type_id`
/// (e.g. `"app.bsky.richtext.facet"` keeps only mention/link/tag features).
/// Normalizes the document before filtering. Returns a JSON array of matching facets.
#[wasm_bindgen]
pub fn filter_facets_by_namespace(doc_json: &str, namespace: &str) -> Result<String, JsError> {
    let doc = serde_atproto::from_json(doc_json).map_err(|e| JsError::new(&e.to_string()))?;
    with_registry(|registry| {
        let mut doc = doc.clone();
        normalize::normalize(&mut doc, registry);

        let matching_facets: Vec<_> = doc
            .facets
            .iter()
            .filter_map(|f| {
                let matching_features: Vec<_> = f
                    .features
                    .iter()
                    .filter(|feat| feat.type_id.starts_with(namespace))
                    .collect();
                if matching_features.is_empty() {
                    return None;
                }
                Some(serde_json::json!({
                    "index": {
                        "byteStart": f.index.byte_start,
                        "byteEnd": f.index.byte_end,
                    },
                    "features": matching_features
                        .iter()
                        .map(|feat| serde_json::to_value(feat).unwrap())
                        .collect::<Vec<_>>(),
                }))
            })
            .collect();

        let value = serde_json::Value::Array(matching_facets);
        serde_json::to_string(&value).map_err(|e| JsError::new(&e.to_string()))
    })
}

// ─── Facet SQL ────────────────────────────────────────────────────────────────

/// Execute SQL statements against a document's facet array.
///
/// **Deprecated**: The facet-sql engine has been removed. This function now
/// returns the input document unchanged (no-op passthrough).
#[wasm_bindgen]
pub fn execute_facet_sql(doc_json: &str, _sql: &str) -> Result<String, JsError> {
    // No-op: facet-sql engine removed; return the document unchanged.
    Ok(doc_json.to_string())
}

// ─── Lens operations ──────────────────────────────────────────────────────────

/// Apply a lens to all features in a document.
///
/// Both arguments are JSON strings. Returns the transformed document as a JSON string.
///
/// Uses the panproto-backed lens engine directly (no SQL intermediate).
#[wasm_bindgen]
pub fn apply_lens(doc_json: &str, spec_json: &str) -> Result<String, JsError> {
    let doc: Document =
        serde_atproto::from_json(doc_json).map_err(|e| JsError::new(&e.to_string()))?;
    let spec: lens_core::LensSpec =
        serde_json::from_str(spec_json).map_err(|e| JsError::new(&e.to_string()))?;
    if spec.wasm_module.is_some() {
        return Err(JsError::new("WASM lens modules are not yet supported"));
    }

    // Phase 0: Collect byte ranges for deleteText rules.
    let rules = spec.rules.as_deref().unwrap_or(&[]);
    let mut delete_ranges: Vec<(u32, u32)> = Vec::new();
    for rule in rules {
        if rule.delete_text {
            if let Some(ref pattern) = rule.match_ {
                let resolved_pattern = if pattern.type_id.is_none() {
                    lens_core::FeaturePattern {
                        type_id: Some(spec.source.clone()),
                        ..pattern.clone()
                    }
                } else {
                    pattern.clone()
                };
                for facet in &doc.facets {
                    for feat in &facet.features {
                        let feat_value = serde_json::to_value(feat).unwrap_or_default();
                        if lens_core::feature_matches_pattern(&feat_value, &resolved_pattern) {
                            delete_ranges.push((facet.index.byte_start, facet.index.byte_end));
                            break;
                        }
                    }
                }
            }
        }
    }

    // Phase 1: Apply the lens using the pure-Rust engine.
    let doc_value = serde_json::to_value(&doc).map_err(|e| JsError::new(&e.to_string()))?;
    let result_value = lens_core::apply_lens_to_doc(&doc_value, &spec);
    let mut result: Document =
        serde_json::from_value(result_value).map_err(|e| JsError::new(&e.to_string()))?;

    // Phase 2: Apply text deletions back-to-front.
    if !delete_ranges.is_empty() {
        delete_ranges.sort_by(|a, b| b.0.cmp(&a.0));
        delete_ranges.dedup();
        for (del_start, del_end) in &delete_ranges {
            let start = *del_start as usize;
            let end = *del_end as usize;
            if end <= result.text.len() {
                result.text = format!("{}{}", &result.text[..start], &result.text[end..]);
            }
            relationaltext_core::position::adjust_facets_for_delete(
                &mut result,
                *del_start,
                *del_end,
            );
        }
    }

    with_registry(|registry| {
        serde_atproto::to_json(&result, registry).map_err(|e| JsError::new(&e.to_string()))
    })
}

/// Apply a lens to all features in a document with execution tracing.
///
/// Returns a JSON object `{ document: DocumentJSON, trace: TraceEntry[] }` where
/// each `TraceEntry` describes how many features a rule matched.
///
/// `TraceEntry` shape:
/// ```json
/// { "ruleIndex": 0, "matched": 3, "action": "emphasis \u2192 em", "isSql": false }
/// ```
#[wasm_bindgen]
pub fn apply_lens_traced(doc_json: &str, spec_json: &str) -> Result<String, JsError> {
    // Apply the lens using the pure-Rust engine.
    let result_json = apply_lens(doc_json, spec_json)?;
    let doc_value: serde_json::Value =
        serde_json::from_str(&result_json).map_err(|e| JsError::new(&e.to_string()))?;

    // Build a simple trace (rule-level detail requires engine instrumentation).
    let spec: lens_core::LensSpec =
        serde_json::from_str(spec_json).map_err(|e| JsError::new(&e.to_string()))?;
    let trace_value: serde_json::Value = serde_json::json!(spec
        .rules
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .enumerate()
        .map(|(i, _r)| {
            serde_json::json!({
                "ruleIndex": i,
                "matched": 0,
                "action": format!("rule {}", i),
                "isSql": false,
            })
        })
        .collect::<Vec<_>>());

    let result = serde_json::json!({
        "document": doc_value,
        "trace": trace_value,
    });

    serde_json::to_string(&result).map_err(|e| JsError::new(&e.to_string()))
}

/// Validate SQL escape-hatch strings in a lens spec without executing them.
///
/// Returns a JSON array of `{ ruleIndex: number, message: string }` objects.
/// An empty array means all SQL rules are syntactically valid.
///
/// Example:
/// ```json
/// [{ "ruleIndex": 2, "message": "near 'INSRT': syntax error" }]
/// ```
#[wasm_bindgen]
pub fn validate_lens_sql(_spec_json: &str) -> Result<String, JsError> {
    // Facet-sql engine removed; always return empty validation array.
    Ok("[]".to_string())
}

/// Compute the inverse of a lens. Throws if the lens is lossy or is a WASM lens.
///
/// Takes and returns a JSON string (LensSpec).
#[wasm_bindgen]
pub fn inverse_lens(spec_json: &str) -> Result<String, JsError> {
    let spec: lens_core::LensSpec =
        serde_json::from_str(spec_json).map_err(|e| JsError::new(&e.to_string()))?;
    let inv = lens_core::inverse_lens(spec).map_err(|e| JsError::new(&e))?;
    serde_json::to_string(&inv).map_err(|e| JsError::new(&e.to_string()))
}

/// Compose two lenses A→B and B→C.
///
/// Both arguments are JSON strings (LensSpec). Returns a JSON string (LensSpec)
/// or `null` as a JsValue if the lenses are incompatible (first.target ≠ second.source).
#[wasm_bindgen]
pub fn compose_lenses(first_json: &str, second_json: &str) -> Result<JsValue, JsError> {
    let first: lens_core::LensSpec =
        serde_json::from_str(first_json).map_err(|e| JsError::new(&e.to_string()))?;
    let second: lens_core::LensSpec =
        serde_json::from_str(second_json).map_err(|e| JsError::new(&e.to_string()))?;
    match lens_core::compose_lenses(&first, &second) {
        None => Ok(JsValue::NULL),
        Some(c) => {
            let s = serde_json::to_string(&c).map_err(|e| JsError::new(&e.to_string()))?;
            Ok(JsValue::from_str(&s))
        }
    }
}

/// BFS shortest path through a list of lens specs from source to target.
///
/// `specs_json` is a JSON array of LensSpec objects. Returns a JSON string (LensSpec)
/// or `null` as a JsValue if no path exists.
#[wasm_bindgen]
pub fn find_path_in_graph(
    specs_json: &str,
    source: &str,
    target: &str,
) -> Result<JsValue, JsError> {
    let specs: Vec<lens_core::LensSpec> =
        serde_json::from_str(specs_json).map_err(|e| JsError::new(&e.to_string()))?;
    match lens_core::find_path_in_graph(&specs, source, target) {
        None => Ok(JsValue::NULL),
        Some(p) => {
            let s = serde_json::to_string(&p).map_err(|e| JsError::new(&e.to_string()))?;
            Ok(JsValue::from_str(&s))
        }
    }
}

// ─── Panproto schema operations ───────────────────────────────────────────────

/// Parse an ATProto lexicon JSON document into a schema and return
/// its metadata as a JSON string.
///
/// This exposes panproto's `parse_lexicon` through the relationaltext
/// WASM module, enabling browser-side schema operations without a
/// separate panproto WASM dependency.
///
/// Returns a JSON string with `{ id, vertexCount, edgeCount, vertices, edges }`.
#[wasm_bindgen]
pub fn parse_lexicon_schema(lexicon_json: &str) -> Result<String, JsError> {
    let json: serde_json::Value =
        serde_json::from_str(lexicon_json).map_err(|e| JsError::new(&e.to_string()))?;
    let schema = panproto_protocols::web_document::atproto::parse_lexicon(&json)
        .map_err(|e| JsError::new(&e.to_string()))?;

    let result = serde_json::json!({
        "id": json.get("id").and_then(|v| v.as_str()).unwrap_or("unknown"),
        "vertexCount": schema.vertex_count(),
        "edgeCount": schema.edge_count(),
        "vertices": schema.vertices.values().map(|v| {
            serde_json::json!({ "id": v.id.as_ref(), "kind": v.kind.as_ref() })
        }).collect::<Vec<_>>(),
        "edges": schema.edges.keys().map(|e| {
            serde_json::json!({
                "src": e.src.as_ref(), "tgt": e.tgt.as_ref(),
                "kind": e.kind.as_ref(), "name": e.name.as_deref()
            })
        }).collect::<Vec<_>>(),
    });

    serde_json::to_string(&result).map_err(|e| JsError::new(&e.to_string()))
}

/// Convert a document from one ATProto schema to another using
/// panproto's auto-generated protolens.
///
/// Takes the source lexicon JSON, target lexicon JSON, and a document
/// JSON string. Returns the converted document as a JSON string.
///
/// This is the morphism-first conversion path: parse both lexicons,
/// auto-discover the structural alignment, and apply the derived lens.
#[wasm_bindgen]
pub fn convert_via_panproto(
    source_lexicon_json: &str,
    target_lexicon_json: &str,
    doc_json: &str,
) -> Result<String, JsError> {
    use panproto_protocols::web_document::atproto;

    let src_lex: serde_json::Value =
        serde_json::from_str(source_lexicon_json).map_err(|e| JsError::new(&e.to_string()))?;
    let tgt_lex: serde_json::Value =
        serde_json::from_str(target_lexicon_json).map_err(|e| JsError::new(&e.to_string()))?;
    let doc_value: serde_json::Value =
        serde_json::from_str(doc_json).map_err(|e| JsError::new(&e.to_string()))?;

    let protocol = atproto::protocol();

    // Auto-detect lexicon format: ATProto (lexicon: 1) or format-lexicon
    let src_lex_atproto = relationaltext_core::panproto_bridge::ensure_atproto_lexicon(&src_lex);
    let tgt_lex_atproto = relationaltext_core::panproto_bridge::ensure_atproto_lexicon(&tgt_lex);

    // Parse schemas — try parse_lexicon, fall back to instance-derived schema
    let src_schema = atproto::parse_lexicon(&src_lex_atproto)
        .or_else(|_| {
            // For RT Documents: derive schema from the document instance
            let doc: relationaltext_core::document::Document =
                serde_json::from_value(doc_value.clone())
                    .map_err(|e| e.to_string())?;
            let instance = relationaltext_core::panproto_bridge::document_to_winstance(&doc);
            Ok(relationaltext_core::panproto_bridge::build_instance_schema(&instance, &protocol))
        })
        .map_err(|e: String| JsError::new(&e))?;

    let tgt_schema = atproto::parse_lexicon(&tgt_lex_atproto)
        .map_err(|e| JsError::new(&e.to_string()))?;

    let config = panproto_lens::AutoLensConfig {
        try_overlap: true,
        ..Default::default()
    };

    let result = panproto_lens::auto_generate(&src_schema, &tgt_schema, &protocol, &config)
        .map_err(|e| JsError::new(&e.to_string()))?;

    // Build instance — try parse_json with schema, fall back to document_to_winstance
    let instance = {
        let src_root = src_lex.get("id").and_then(|v| v.as_str()).unwrap_or("main");
        panproto_inst::parse_json(&src_schema, src_root, &doc_value)
            .or_else(|_| {
                let doc: relationaltext_core::document::Document =
                    serde_json::from_value(doc_value.clone())
                        .map_err(|e| e.to_string())?;
                Ok(relationaltext_core::panproto_bridge::document_to_winstance(&doc))
            })
            .map_err(|e: String| JsError::new(&e))?
    };

    // Apply the lens
    let (view, _complement) =
        panproto_lens::get(&result.lens, &instance).map_err(|e| JsError::new(&e.to_string()))?;

    // Serialize back to JSON using the target schema
    let output = panproto_inst::to_json(&tgt_schema, &view);

    serde_json::to_string(&output).map_err(|e| JsError::new(&e.to_string()))
}

// ─── Layered document operations ──────────────────────────────────────────────

/// Create a [`LayeredDocument`] from a [`Document`] JSON string.
///
/// Wraps the document text as an [`Expression`] with an empty set of annotation
/// layers. The returned JSON can be passed to the other `layered_doc_*` helpers.
///
/// Returns the [`LayeredDocument`] as a JSON string.
#[wasm_bindgen]
pub fn create_layered_document(doc_json: &str) -> Result<String, JsError> {
    let doc: relationaltext_core::document::Document =
        serde_atproto::from_json(doc_json).map_err(|e| JsError::new(&e.to_string()))?;
    let layered = relationaltext_core::layers::LayeredDocument::from_document(&doc);
    serde_json::to_string(&layered).map_err(|e| JsError::new(&e.to_string()))
}

/// Add an [`AnnotationLayer`] to an existing [`LayeredDocument`].
///
/// `layered_doc_json`: a JSON string produced by `create_layered_document` or a
/// prior call to this function.
/// `layer_json`: a JSON object matching the `AnnotationLayer` schema.
///
/// Returns the updated [`LayeredDocument`] as a JSON string.
#[wasm_bindgen]
pub fn add_annotation_layer(layered_doc_json: &str, layer_json: &str) -> Result<String, JsError> {
    let mut layered: relationaltext_core::layers::LayeredDocument =
        serde_json::from_str(layered_doc_json).map_err(|e| JsError::new(&e.to_string()))?;
    let layer: relationaltext_core::layers::AnnotationLayer =
        serde_json::from_str(layer_json).map_err(|e| JsError::new(&e.to_string()))?;
    layered.add_layer(layer);
    serde_json::to_string(&layered).map_err(|e| JsError::new(&e.to_string()))
}

/// Query annotations on a [`LayeredDocument`] by kind, subkind, and label.
///
/// Empty strings are treated as "no filter" for each parameter. Pass an empty
/// string `""` for any parameter you want to leave unconstrained.
///
/// Returns a JSON array of matching [`Annotation`] objects.
#[wasm_bindgen]
pub fn query_annotations(
    layered_doc_json: &str,
    kind: &str,
    subkind: &str,
    label: &str,
) -> Result<String, JsError> {
    let layered: relationaltext_core::layers::LayeredDocument =
        serde_json::from_str(layered_doc_json).map_err(|e| JsError::new(&e.to_string()))?;
    let kind_opt = if kind.is_empty() { None } else { Some(kind) };
    let subkind_opt = if subkind.is_empty() {
        None
    } else {
        Some(subkind)
    };
    let label_opt = if label.is_empty() { None } else { Some(label) };
    let annotations = layered.query(kind_opt, subkind_opt, label_opt);
    serde_json::to_string(&annotations).map_err(|e| JsError::new(&e.to_string()))
}

/// Get all annotations that contain the given byte offset.
///
/// `byte_offset`: a UTF-8 byte position within the expression text.
///
/// Returns a JSON array of matching [`Annotation`] objects.
#[wasm_bindgen]
pub fn annotations_at_offset(layered_doc_json: &str, byte_offset: u32) -> Result<String, JsError> {
    let layered: relationaltext_core::layers::LayeredDocument =
        serde_json::from_str(layered_doc_json).map_err(|e| JsError::new(&e.to_string()))?;
    let annotations = layered.annotations_at(byte_offset);
    serde_json::to_string(&annotations).map_err(|e| JsError::new(&e.to_string()))
}

/// Get all annotations whose span overlaps with the given byte range `[start, end)`.
///
/// `start`: inclusive start of the byte range (UTF-8).
/// `end`: exclusive end of the byte range (UTF-8).
///
/// Returns a JSON array of matching [`Annotation`] objects.
#[wasm_bindgen]
pub fn annotations_in_byte_range(
    layered_doc_json: &str,
    start: u32,
    end: u32,
) -> Result<String, JsError> {
    let layered: relationaltext_core::layers::LayeredDocument =
        serde_json::from_str(layered_doc_json).map_err(|e| JsError::new(&e.to_string()))?;
    let annotations = layered.annotations_in_range(start, end);
    serde_json::to_string(&annotations).map_err(|e| JsError::new(&e.to_string()))
}

/// Project a [`LayeredDocument`] back to a [`Document`] with facets.
///
/// Returns the projected [`Document`] as a JSON string.
#[wasm_bindgen]
pub fn layered_doc_to_document(layered_doc_json: &str) -> Result<String, JsError> {
    let layered: relationaltext_core::layers::LayeredDocument =
        serde_json::from_str(layered_doc_json).map_err(|e| JsError::new(&e.to_string()))?;
    let doc = layered.to_document();
    with_registry(|registry| {
        serde_atproto::to_json(&doc, registry).map_err(|e| JsError::new(&e.to_string()))
    })
}

/// Insert text into the expression and adjust all annotation anchors.
///
/// `byte_pos`: the UTF-8 byte position at which to insert.
/// `text`: the text to insert.
///
/// Annotation spans starting at or after `byte_pos` are shifted right;
/// spans containing `byte_pos` have their end extended.
///
/// Returns the updated [`LayeredDocument`] as a JSON string.
#[wasm_bindgen]
pub fn layered_doc_insert_text(
    layered_doc_json: &str,
    byte_pos: u32,
    text: &str,
) -> Result<String, JsError> {
    let mut layered: relationaltext_core::layers::LayeredDocument =
        serde_json::from_str(layered_doc_json).map_err(|e| JsError::new(&e.to_string()))?;
    let inserted_len = text.len() as u32;
    if let Some(ref mut expr_text) = layered.expression.text {
        expr_text.insert_str(byte_pos as usize, text);
    }
    layered.adjust_for_insert(byte_pos, inserted_len);
    serde_json::to_string(&layered).map_err(|e| JsError::new(&e.to_string()))
}

/// Delete a byte range from the expression and adjust all annotation anchors.
///
/// `byte_start`: inclusive start of the range to delete (UTF-8).
/// `byte_end`: exclusive end of the range to delete (UTF-8).
///
/// Spans fully within the deleted range are collapsed to a zero-width point.
/// Spans partially overlapping are shrunk. Spans after the deletion are shifted left.
///
/// Returns the updated [`LayeredDocument`] as a JSON string.
#[wasm_bindgen]
pub fn layered_doc_delete_text(
    layered_doc_json: &str,
    byte_start: u32,
    byte_end: u32,
) -> Result<String, JsError> {
    let mut layered: relationaltext_core::layers::LayeredDocument =
        serde_json::from_str(layered_doc_json).map_err(|e| JsError::new(&e.to_string()))?;
    if byte_start < byte_end {
        if let Some(ref mut expr_text) = layered.expression.text {
            if (byte_end as usize) <= expr_text.len() {
                expr_text.drain(byte_start as usize..byte_end as usize);
            }
        }
        layered.adjust_for_delete(byte_start, byte_end);
    }
    serde_json::to_string(&layered).map_err(|e| JsError::new(&e.to_string()))
}

// ─── Ontology schema operations ───────────────────────────────────────────────

/// Build a panproto schema from ontology TypeDef records (JSON).
///
/// Input: JSON object with `ontology` and `typeDefs` fields matching the
/// Layers ontology types.
/// Returns: schema metadata as JSON with `vertexCount`, `edgeCount`,
/// `vertices`, and `edges` fields.
#[wasm_bindgen]
pub fn ontology_to_schema(ontology_json: &str) -> Result<String, JsError> {
    let input: serde_json::Value =
        serde_json::from_str(ontology_json).map_err(|e| JsError::new(&e.to_string()))?;

    let ontology: relationaltext_core::layers::ontology::Ontology =
        serde_json::from_value(input["ontology"].clone())
            .map_err(|e| JsError::new(&format!("invalid ontology: {e}")))?;
    let type_defs: Vec<relationaltext_core::layers::ontology::TypeDef> =
        serde_json::from_value(input["typeDefs"].clone())
            .map_err(|e| JsError::new(&format!("invalid typeDefs: {e}")))?;

    let schema =
        relationaltext_core::panproto_bridge::ontology::typedef_to_schema(&ontology, &type_defs);

    let result = serde_json::json!({
        "vertexCount": schema.vertex_count(),
        "edgeCount": schema.edge_count(),
        "vertices": schema.vertices.values().map(|v| {
            serde_json::json!({ "id": v.id.as_ref(), "kind": v.kind.as_ref() })
        }).collect::<Vec<_>>(),
        "edges": schema.edges.keys().map(|e| {
            serde_json::json!({
                "src": e.src.as_ref(), "tgt": e.tgt.as_ref(),
                "kind": e.kind.as_ref(), "name": e.name.as_deref()
            })
        }).collect::<Vec<_>>(),
    });

    serde_json::to_string(&result).map_err(|e| JsError::new(&e.to_string()))
}

/// Migrate annotations after an ontology change.
///
/// Input: old ontology JSON, new ontology JSON (both with `ontology` and
/// `typeDefs` fields), and annotations JSON array.
/// Returns: migrated annotations JSON array.
#[wasm_bindgen]
pub fn migrate_ontology_annotations(
    old_ontology_json: &str,
    new_ontology_json: &str,
    annotations_json: &str,
) -> Result<String, JsError> {
    let old_input: serde_json::Value =
        serde_json::from_str(old_ontology_json).map_err(|e| JsError::new(&e.to_string()))?;
    let new_input: serde_json::Value =
        serde_json::from_str(new_ontology_json).map_err(|e| JsError::new(&e.to_string()))?;

    let old_ont: relationaltext_core::layers::ontology::Ontology =
        serde_json::from_value(old_input["ontology"].clone())
            .map_err(|e| JsError::new(&format!("invalid old ontology: {e}")))?;
    let old_defs: Vec<relationaltext_core::layers::ontology::TypeDef> =
        serde_json::from_value(old_input["typeDefs"].clone())
            .map_err(|e| JsError::new(&format!("invalid old typeDefs: {e}")))?;

    let new_ont: relationaltext_core::layers::ontology::Ontology =
        serde_json::from_value(new_input["ontology"].clone())
            .map_err(|e| JsError::new(&format!("invalid new ontology: {e}")))?;
    let new_defs: Vec<relationaltext_core::layers::ontology::TypeDef> =
        serde_json::from_value(new_input["typeDefs"].clone())
            .map_err(|e| JsError::new(&format!("invalid new typeDefs: {e}")))?;

    let old_schema =
        relationaltext_core::panproto_bridge::ontology::typedef_to_schema(&old_ont, &old_defs);
    let new_schema =
        relationaltext_core::panproto_bridge::ontology::typedef_to_schema(&new_ont, &new_defs);

    let annotations: serde_json::Value =
        serde_json::from_str(annotations_json).map_err(|e| JsError::new(&e.to_string()))?;

    let migrated = relationaltext_core::panproto_bridge::ontology::migrate_annotations(
        &old_schema,
        &new_schema,
        &annotations,
    )
    .map_err(|e| JsError::new(&e.to_string()))?;

    serde_json::to_string(&migrated).map_err(|e| JsError::new(&e.to_string()))
}

// ─── Auto-detection ───────────────────────────────────────────────────────────

/// Auto-detect @mentions, URLs, and #tags in plain text.
///
/// The caller provides the type IDs to use for each detected feature kind.
/// Mentions are stored with a `"handle"` field; links with `"uri"`; tags with `"tag"`.
fn auto_detect(
    text: &str,
    mention_type_id: &str,
    link_type_id: &str,
    tag_type_id: &str,
) -> Vec<Facet> {
    let mut facets = Vec::new();

    let bytes = text.as_bytes();
    let mut i = 0;
    while i < text.len() {
        if bytes[i] == b'@' {
            let start = i;
            i += 1;
            while i < text.len()
                && (bytes[i].is_ascii_alphanumeric()
                    || bytes[i] == b'.'
                    || bytes[i] == b'-'
                    || bytes[i] == b'_')
            {
                i += 1;
            }
            if i > start + 1 {
                let handle = &text[start + 1..i];
                if !handle.ends_with('.') {
                    let feat = Feature::new(mention_type_id)
                        .with_data("handle", serde_json::Value::String(handle.to_string()));
                    facets.push(Facet::new(start as u32, i as u32, vec![feat]));
                }
            }
        } else if bytes[i] == b'#' {
            let start = i;
            i += 1;
            while i < text.len()
                && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_' || bytes[i] == b'-')
            {
                i += 1;
            }
            if i > start + 1 {
                let tag = &text[start + 1..i];
                let feat = Feature::new(tag_type_id)
                    .with_data("tag", serde_json::Value::String(tag.to_string()));
                facets.push(Facet::new(start as u32, i as u32, vec![feat]));
            }
        } else if text[i..].starts_with("https://") || text[i..].starts_with("http://") {
            let start = i;
            while i < text.len()
                && !bytes[i].is_ascii_whitespace()
                && bytes[i] != b','
                && bytes[i] != b'"'
                && bytes[i] != b'\''
            {
                i += 1;
            }
            while i > start
                && (bytes[i - 1] == b'.'
                    || bytes[i - 1] == b'!'
                    || bytes[i - 1] == b'?'
                    || bytes[i - 1] == b')')
            {
                i -= 1;
            }
            if i > start {
                let uri = text[start..i].to_string();
                let feat =
                    Feature::new(link_type_id).with_data("uri", serde_json::Value::String(uri));
                facets.push(Facet::new(start as u32, i as u32, vec![feat]));
            }
        } else {
            let ch_len = text[i..].chars().next().map(|c| c.len_utf8()).unwrap_or(1);
            i += ch_len;
        }
    }

    normalize::sort_facets(&mut facets);
    facets
}

// ─── HIR → JSON ──────────────────────────────────────────────────────────────

fn hir_node_to_json(node: &hir::HirNode) -> serde_json::Value {
    match node {
        hir::HirNode::Block {
            name,
            attrs,
            children,
        } => {
            serde_json::json!({
                "type": "block",
                "name": name,
                "attrs": attrs,
                "children": children.iter().map(hir_node_to_json).collect::<Vec<_>>(),
            })
        }
        hir::HirNode::Container {
            name,
            attrs,
            children,
        } => {
            serde_json::json!({
                "type": "container",
                "name": name,
                "attrs": attrs,
                "children": children.iter().map(hir_node_to_json).collect::<Vec<_>>(),
            })
        }
        hir::HirNode::Text { content, marks } => {
            serde_json::json!({
                "type": "text",
                "content": content,
                "marks": marks.iter().map(|m| serde_json::json!({"kind": m.kind, "attrs": m.attrs})).collect::<Vec<_>>(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MENTION: &str = "test.facet#mention";
    const LINK: &str = "test.facet#link";
    const TAG: &str = "test.facet#tag";

    #[test]
    fn detect_mention() {
        let facets = auto_detect("Hello @alice.bsky.social world", MENTION, LINK, TAG);
        assert_eq!(facets.len(), 1);
        assert_eq!(facets[0].features[0].type_id, MENTION);
        assert_eq!(facets[0].index.byte_start, 6);
    }

    #[test]
    fn detect_hashtag() {
        let facets = auto_detect("Check out #rust", MENTION, LINK, TAG);
        assert_eq!(facets.len(), 1);
        assert_eq!(facets[0].features[0].type_id, TAG);
    }

    #[test]
    fn detect_url() {
        let facets = auto_detect("Visit https://example.com today", MENTION, LINK, TAG);
        assert_eq!(facets.len(), 1);
        assert_eq!(facets[0].features[0].type_id, LINK);
    }

    #[test]
    fn detect_url_strips_trailing_period() {
        let facets = auto_detect("See https://example.com.", MENTION, LINK, TAG);
        assert_eq!(facets.len(), 1);
        let feat = &facets[0].features[0];
        if let Some(uri) = feat.get_str("uri") {
            assert!(!uri.ends_with('.'));
        }
    }

    #[test]
    fn detect_multiple() {
        let facets = auto_detect("@alice #rust https://example.com", MENTION, LINK, TAG);
        assert_eq!(facets.len(), 3);
    }

    #[test]
    fn detect_mention_stores_handle() {
        let facets = auto_detect("Hello @alice.bsky.social", MENTION, LINK, TAG);
        assert_eq!(facets.len(), 1);
        assert_eq!(
            facets[0].features[0].get_str("handle"),
            Some("alice.bsky.social")
        );
    }
}

// ─── Annotation projection ───────────────────────────────────────────────────

/// Project annotations from a LayeredDocument by type names.
///
/// Given a LayeredDocument JSON and a JSON array of annotation labels,
/// returns only the annotations matching those labels across all layers.
///
/// This provides schema-driven filtering as an alternative to manual
/// iteration over annotation layers.
#[wasm_bindgen]
pub fn project_annotations_by_type(
    layered_doc_json: &str,
    type_names_json: &str,
) -> Result<String, JsError> {
    let layered: relationaltext_core::layers::LayeredDocument =
        serde_json::from_str(layered_doc_json).map_err(|e| JsError::new(&e.to_string()))?;
    let type_names: Vec<String> =
        serde_json::from_str(type_names_json).map_err(|e| JsError::new(&e.to_string()))?;

    let type_set: std::collections::HashSet<&str> =
        type_names.iter().map(String::as_str).collect();

    let mut matching = Vec::new();
    for layer in &layered.annotation_layers {
        for ann in &layer.annotations {
            if let Some(ref label) = ann.label {
                if type_set.contains(label.as_str()) {
                    matching.push(ann);
                }
            }
        }
    }

    serde_json::to_string(&matching).map_err(|e| JsError::new(&e.to_string()))
}
