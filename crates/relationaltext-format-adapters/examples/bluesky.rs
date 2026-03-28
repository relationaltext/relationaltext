//! Bluesky / ATProto rich text adapter: import and export for RelationalText documents.
//!
//! Format namespace: `app.bsky.richtext.facet`
//!
//! WASM interface:
//!   alloc / dealloc / result_len — memory boilerplate (from wasm-format-adapter)
//!   import(ptr, len) -> ptr     — Bluesky JSON (in "text" field) → DocumentJSON
//!   export(ptr, len) -> ptr     — DocumentJSON → Bluesky-filtered DocumentJSON (in "text" field)

use relationaltext_core::LexiconRegistry;
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "app.bsky.richtext.facet";

// ─── Lexicon registry ─────────────────────────────────────────────────────────

const LEXICON_JSON: &[u8] =
    include_bytes!("../../../formats/app.bsky.richtext/bluesky.lexicon.json");

static REGISTRY: OnceLock<LexiconRegistry> = OnceLock::new();

fn registry() -> &'static LexiconRegistry {
    REGISTRY.get_or_init(|| {
        let lexicon: Value = serde_json::from_slice(LEXICON_JSON).unwrap_or(Value::Null);
        let empty = Vec::new();
        let features = lexicon["features"].as_array().unwrap_or(&empty).to_vec();
        let mut r = LexiconRegistry::new();
        let _ = r.register_from_json_array(&features);
        r
    })
}

// ─── WASM exports ─────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn import(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_import(input);
    write_result(result)
}

#[no_mangle]
pub extern "C" fn export(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_export(input);
    write_result(result)
}

// ─── Import: Bluesky JSON → DocumentJSON ──────────────────────────────────────
//
// Bluesky wire format IS DocumentJSON — `{ text, facets[] }` with $type values
// in the `app.bsky.richtext.facet#*` namespace. Import is a passthrough that
// ensures the outer wrapper is stripped.

fn do_import(raw: &str) -> String {
    let _ = registry(); // ensure lexicon is registered
    let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    // The input arrives as { "text": "<bluesky-json>", "facets": [] }.
    // The bluesky-json is itself a DocumentJSON { text, facets }.
    let bsky_str = outer["text"].as_str().unwrap_or(raw);
    // If the inner value parses as a valid DocumentJSON, return it directly.
    if let Ok(inner) = serde_json::from_str::<Value>(bsky_str) {
        if inner["text"].is_string() {
            return inner.to_string();
        }
    }
    // Fallback: treat the whole input as the document
    outer.to_string()
}

// ─── Export: DocumentJSON → Bluesky-filtered JSON ────────────────────────────
//
// Export filters all facets to only `app.bsky.richtext.facet#*` features,
// dropping any cross-format features that don't belong on the Bluesky wire.

fn do_export(doc_json: &str) -> String {
    let doc: Value = serde_json::from_str(doc_json).unwrap_or(Value::Null);
    let text = doc["text"].clone();
    let empty = Vec::new();
    let facets = doc["facets"].as_array().unwrap_or(&empty);

    let filtered: Vec<Value> = facets
        .iter()
        .filter_map(|facet| {
            let features = facet["features"].as_array()?;
            // Keep only features in the Bluesky namespace
            let kept: Vec<Value> = features
                .iter()
                .filter(|f| {
                    f["$type"]
                        .as_str()
                        .map_or(false, |t| t.starts_with(TYPE_ID))
                })
                .cloned()
                .collect();
            if kept.is_empty() {
                None
            } else {
                Some(json!({
                    "index": facet["index"],
                    "features": kept,
                }))
            }
        })
        .collect();

    json!({ "text": text, "facets": filtered }).to_string()
}
