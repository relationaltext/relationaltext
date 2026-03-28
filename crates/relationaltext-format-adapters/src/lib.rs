//! Shared helpers for RelationalText WASM format adapters.
//!
//! Each format example (`quill`, `prosemirror`, `slate`) links against this
//! `rlib` for common utilities.

pub mod md_shared;

/// UTF-8 byte length of U+FFFC (OBJECT REPLACEMENT CHARACTER) — the first block marker.
pub const FIRST_MARKER_BYTES: usize = 3; // 0xEF 0xBF 0xBC

/// Build a facet JSON object covering `[byte_start, byte_end)` with one feature.
///
/// The feature is an `org.quilljs.delta.facet`-style object with `$type`, `name`,
/// optional `parents`, and optional `attrs`.
pub fn facet_json(
    byte_start: usize,
    byte_end: usize,
    type_id: &str,
    name: &str,
    parents: &[&str],
    attrs: Option<&serde_json::Value>,
) -> serde_json::Value {
    let mut feature = serde_json::json!({
        "$type": type_id,
        "name": name,
        "parents": parents,
    });
    if let Some(a) = attrs {
        feature["attrs"] = a.clone();
    }
    serde_json::json!({
        "index": { "byteStart": byte_start, "byteEnd": byte_end },
        "features": [feature],
    })
}

/// Build a facet JSON object covering `[byte_start, byte_end)` with one feature
/// and no parents (used for inline marks).
pub fn inline_facet_json(
    byte_start: usize,
    byte_end: usize,
    type_id: &str,
    name: &str,
    extra_fields: serde_json::Map<String, serde_json::Value>,
) -> serde_json::Value {
    let mut feature = serde_json::json!({
        "$type": type_id,
        "name": name,
    });
    for (k, v) in extra_fields {
        feature[k] = v;
    }
    serde_json::json!({
        "index": { "byteStart": byte_start, "byteEnd": byte_end },
        "features": [feature],
    })
}

/// Extract the `text` field from a DocumentJSON string, falling back to the
/// raw string itself if parsing fails (so adapters can accept either format).
pub fn extract_doc_text(doc_json: &str) -> String {
    let parsed: serde_json::Value =
        serde_json::from_str(doc_json).unwrap_or(serde_json::Value::Null);
    parsed["text"]
        .as_str()
        .map(|s| s.to_owned())
        .unwrap_or_else(|| doc_json.to_owned())
}

/// Wrap a raw-format string in a DocumentJSON `{ "text": <s>, "facets": [] }`.
pub fn wrap_raw(s: &str) -> String {
    serde_json::json!({ "text": s, "facets": [] }).to_string()
}
