//! Quill Delta format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `org.quilljs.delta.facet`
//!
//! WASM interface:
//!   alloc / dealloc / result_len — memory boilerplate (from wasm-format-adapter)
//!   import(ptr, len) -> ptr     — Quill Delta JSON (in "text" field of DocumentJSON) → DocumentJSON
//!   export(ptr, len) -> ptr     — DocumentJSON (Quill facets) → raw Quill Delta JSON (in "text" field)

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Map, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "org.quilljs.delta.facet";

// ─── Lexicon registry ─────────────────────────────────────────────────────────

const LEXICON_JSON: &[u8] =
    include_bytes!("../../../formats/org.quilljs.delta/quill-delta.lexicon.json");

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

// ─── Import: Quill Delta → DocumentJSON ───────────────────────────────────────

struct ImportState {
    text: String,
    facets: Vec<Value>,
    line_text: String,
    line_facets: Vec<(usize, usize, Value)>, // (rel_start, rel_end, attrs_obj)
    code_block_lines: Vec<String>,
    code_block_lang: Option<String>,
    prev_list_type: Option<String>, // "bullet" | "ordered"
}

impl ImportState {
    fn new() -> Self {
        Self {
            text: String::new(),
            facets: Vec::new(),
            line_text: String::new(),
            line_facets: Vec::new(),
            code_block_lines: Vec::new(),
            code_block_lang: None,
            prev_list_type: None,
        }
    }
}

fn do_import(raw: &str) -> String {
    // Handle double-stringified input: unwrap if raw is a JSON string value
    let effective_input = match serde_json::from_str::<serde_json::Value>(raw) {
        Ok(serde_json::Value::String(s)) => s,
        _ => raw.to_string(),
    };
    let raw = effective_input.as_str();
    // Input is DocumentJSON where text = Quill Delta JSON string
    let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let quill_str = outer["text"].as_str().unwrap_or(raw);

    let delta: Value = serde_json::from_str(quill_str).unwrap_or(Value::Null);
    let empty_ops = Vec::new();
    let ops = delta["ops"].as_array().unwrap_or(&empty_ops);

    let mut state = ImportState::new();

    for op in ops {
        if let Some(insert_str) = op["insert"].as_str() {
            let attrs = &op["attributes"];
            let segments: Vec<&str> = insert_str.split('\n').collect();
            for (i, seg) in segments.iter().enumerate() {
                if !seg.is_empty() {
                    let rel_start = state.line_text.len();
                    state.line_text.push_str(seg);
                    let rel_end = state.line_text.len();
                    if !attrs.is_null() {
                        if let Some(obj) = attrs.as_object() {
                            if !obj.is_empty() {
                                state.line_facets.push((rel_start, rel_end, attrs.clone()));
                            }
                        }
                    }
                }
                if i < segments.len() - 1 {
                    flush_line(&mut state, attrs);
                }
            }
        } else if op["insert"].is_object() {
            // Embed op
            let embed = &op["insert"];
            let rel_start = state.line_text.len();
            state.line_text.push(' '); // placeholder
            let rel_end = state.line_text.len();
            if embed.get("image").is_some() {
                let src = embed["image"].clone();
                state
                    .line_facets
                    .push((rel_start, rel_end, json!({ "image": src })));
            } else if embed.get("video").is_some() {
                let src = embed["video"].clone();
                state
                    .line_facets
                    .push((rel_start, rel_end, json!({ "video": src })));
            } else if embed.get("formula").is_some() {
                let val = embed["formula"].clone();
                state
                    .line_facets
                    .push((rel_start, rel_end, json!({ "formula": val })));
            }
        }
    }

    // Flush remaining content
    if !state.line_text.is_empty() || !state.code_block_lines.is_empty() {
        flush_line(&mut state, &Value::Null);
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

/// Emit a block marker into the document state.
fn open_block(state: &mut ImportState, name: &str, parents: Vec<String>, attrs: Option<Value>) {
    let marker_char = if state.text.is_empty() {
        '\u{FFFC}'
    } else {
        '\n'
    };
    let marker_start = state.text.len();
    state.text.push(marker_char);
    let marker_end = state.text.len();

    let mut feature = json!({
        "$type": TYPE_ID,
        "name": name,
        "parents": parents,
    });
    if let Some(a) = attrs {
        feature["attrs"] = a;
    }
    state.facets.push(json!({
        "index": { "byteStart": marker_start, "byteEnd": marker_end },
        "features": [feature],
    }));
}

/// Flush the current line accumulator as a block.
fn flush_line(state: &mut ImportState, block_attrs: &Value) {
    let code_block_val = &block_attrs["code-block"];

    // ── Code block accumulation ──────────────────────────────────────────────
    if !code_block_val.is_null() && code_block_val != &Value::Bool(false) {
        state.code_block_lines.push(state.line_text.clone());
        if state.code_block_lang.is_none() {
            if let Some(lang) = code_block_val.as_str() {
                state.code_block_lang = Some(lang.to_owned());
            }
        }
        state.line_text.clear();
        state.line_facets.clear();
        return;
    }

    // ── Drain accumulated code block ─────────────────────────────────────────
    if !state.code_block_lines.is_empty() {
        let code_content = state.code_block_lines.join("\n") + "\n";
        let lang = state.code_block_lang.take();
        let code_attrs = if let Some(ref l) = lang {
            Some(json!({ "language": l }))
        } else {
            None
        };
        state.code_block_lines.clear();
        open_block(state, "code-block", vec![], code_attrs);
        state.text.push_str(&code_content);
        if state.line_text.is_empty() {
            return;
        }
    }

    // ── Determine block type ─────────────────────────────────────────────────
    let list_val = block_attrs["list"].as_str();
    let header_val = block_attrs["header"].as_u64();
    let blockquote_val = block_attrs
        .get("blockquote")
        .map(|v| v != &Value::Bool(false) && !v.is_null())
        .unwrap_or(false);

    let block_name: &str;
    let parents: Vec<String>;
    let mut attrs: Option<Value> = None;

    if let Some(level) = header_val {
        block_name = "header";
        parents = vec![];
        attrs = Some(json!({ "level": level }));
    } else if list_val == Some("bullet") {
        block_name = "list-item-text";
        parents = vec!["ul".to_owned(), "unordered-list-item".to_owned()];
        if state.prev_list_type.as_deref() != Some("bullet") {
            open_block(state, "bullet-list-marker", vec![], None);
        }
        open_block(state, "list-item-marker", vec!["ul".to_owned()], None);
    } else if list_val == Some("ordered") {
        block_name = "list-item-text";
        parents = vec!["ol".to_owned(), "ordered-list-item".to_owned()];
        if state.prev_list_type.as_deref() != Some("ordered") {
            open_block(state, "ordered-list-marker", vec![], None);
        }
        open_block(state, "list-item-marker", vec!["ol".to_owned()], None);
    } else if blockquote_val {
        block_name = "paragraph";
        parents = vec!["blockquote".to_owned()];
    } else {
        block_name = "paragraph";
        parents = vec![];
    }

    state.prev_list_type = list_val.map(|s| s.to_owned());

    // ── Emit block marker ────────────────────────────────────────────────────
    open_block(state, block_name, parents, attrs);

    // ── Copy inline content into main text ───────────────────────────────────
    let line_byte_start = state.text.len();
    state.text.push_str(&state.line_text);

    // ── Emit inline facets ───────────────────────────────────────────────────
    for (rel_start, rel_end, attrs_obj) in std::mem::take(&mut state.line_facets) {
        let abs_start = line_byte_start + rel_start;
        let abs_end = line_byte_start + rel_end;
        if abs_start >= abs_end {
            continue;
        }
        let features = attrs_to_features(&attrs_obj);
        if !features.is_empty() {
            state.facets.push(json!({
                "index": { "byteStart": abs_start, "byteEnd": abs_end },
                "features": features,
            }));
        }
    }

    state.line_text.clear();
}

/// Convert Quill inline attributes to RelationalText feature objects.
fn attrs_to_features(attrs: &Value) -> Vec<Value> {
    let mut features = Vec::new();

    // Embed types
    if let Some(src) = attrs.get("image") {
        features.push(json!({ "$type": TYPE_ID, "name": "image", "src": src }));
        return features;
    }
    if let Some(src) = attrs.get("video") {
        features.push(json!({ "$type": TYPE_ID, "name": "video", "src": src }));
        return features;
    }
    if let Some(val) = attrs.get("formula") {
        features.push(json!({ "$type": TYPE_ID, "name": "formula", "value": val }));
        return features;
    }

    let obj = match attrs.as_object() {
        Some(o) => o,
        None => return features,
    };

    for (key, val) in obj {
        match key.as_str() {
            "bold" if truthy(val) => {
                features.push(json!({ "$type": TYPE_ID, "name": "bold" }));
            }
            "italic" if truthy(val) => {
                features.push(json!({ "$type": TYPE_ID, "name": "italic" }));
            }
            "underline" if truthy(val) => {
                features.push(json!({ "$type": TYPE_ID, "name": "underline" }));
            }
            "strike" if truthy(val) => {
                features.push(json!({ "$type": TYPE_ID, "name": "strike" }));
            }
            "code" if truthy(val) => {
                features.push(json!({ "$type": TYPE_ID, "name": "code" }));
            }
            "script" => {
                if val.as_str() == Some("super") {
                    features.push(json!({ "$type": TYPE_ID, "name": "superscript" }));
                } else if val.as_str() == Some("sub") {
                    features.push(json!({ "$type": TYPE_ID, "name": "subscript" }));
                }
            }
            "link" => {
                let url = if let Some(s) = val.as_str() {
                    s.to_owned()
                } else if let Some(href) = val["href"].as_str() {
                    href.to_owned()
                } else {
                    String::new()
                };
                features.push(json!({ "$type": TYPE_ID, "name": "link", "url": url }));
            }
            "color" => {
                features.push(json!({ "$type": TYPE_ID, "name": "color", "value": val }));
            }
            "background" => {
                features.push(json!({ "$type": TYPE_ID, "name": "background", "value": val }));
            }
            "font" => {
                features.push(json!({ "$type": TYPE_ID, "name": "font", "value": val }));
            }
            "size" => {
                features.push(json!({ "$type": TYPE_ID, "name": "size", "value": val }));
            }
            _ => {}
        }
    }

    features
}

fn truthy(v: &Value) -> bool {
    v == &Value::Bool(true) || (v.is_string() && !v.as_str().unwrap_or("").is_empty())
}

// ─── Export: DocumentJSON → Quill Delta JSON ──────────────────────────────────

#[derive(Default, Clone)]
struct QuillCtx {
    list_type: Option<String>, // "bullet" | "ordered"
    in_blockquote: bool,
}

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => {
            return json!({"ops": [{"insert": "\n"}]}).to_string();
        }
    };

    let nodes = build_hir_from_doc(&doc, registry());
    let mut ops: Vec<Value> = Vec::new();
    walk_nodes(&nodes, &mut ops, &QuillCtx::default());

    // Always end with a terminal newline if not already present
    if ops.last().and_then(|op| op["insert"].as_str()) != Some("\n") {
        ops.push(json!({ "insert": "\n" }));
    }

    json!({ "ops": ops }).to_string()
}

fn walk_nodes(nodes: &[HirNode], ops: &mut Vec<Value>, ctx: &QuillCtx) {
    for node in nodes {
        walk_node(node, ops, ctx);
    }
}

fn walk_node(node: &HirNode, ops: &mut Vec<Value>, ctx: &QuillCtx) {
    match node {
        HirNode::Text { content, marks } => {
            emit_text_ops(content, marks, ops);
        }
        HirNode::Container { name, children, .. } => {
            walk_container(name, children, ops, ctx);
        }
        HirNode::Block {
            name,
            attrs,
            children,
        } => {
            walk_block(name, attrs, children, ops, ctx);
        }
    }
}

fn walk_container(name: &str, children: &[HirNode], ops: &mut Vec<Value>, ctx: &QuillCtx) {
    let child_ctx = match name {
        "ul" => QuillCtx {
            list_type: Some("bullet".into()),
            in_blockquote: ctx.in_blockquote,
        },
        "ol" => QuillCtx {
            list_type: Some("ordered".into()),
            in_blockquote: ctx.in_blockquote,
        },
        "blockquote" => QuillCtx {
            list_type: ctx.list_type.clone(),
            in_blockquote: true,
        },
        _ => ctx.clone(),
    };
    walk_nodes(children, ops, &child_ctx);
}

fn walk_block(
    name: &str,
    attrs: &std::collections::HashMap<String, Value>,
    children: &[HirNode],
    ops: &mut Vec<Value>,
    ctx: &QuillCtx,
) {
    match name {
        "bullet-list-marker" | "ordered-list-marker" | "list-item-marker" | "blockquote-marker" => {
            // Structural markers — produce no ops
        }
        "paragraph" => {
            let text_ops = block_children_to_ops(children);
            ops.extend(text_ops);
            let mut block_attrs = Map::new();
            if ctx.in_blockquote {
                block_attrs.insert("blockquote".into(), Value::Bool(true));
            }
            let mut newline_op = json!({ "insert": "\n" });
            if !block_attrs.is_empty() {
                newline_op["attributes"] = Value::Object(block_attrs);
            }
            ops.push(newline_op);
        }
        "header" => {
            let text_ops = block_children_to_ops(children);
            ops.extend(text_ops);
            let level = attrs.get("level").and_then(|v| v.as_u64()).unwrap_or(1);
            ops.push(json!({ "insert": "\n", "attributes": { "header": level } }));
        }
        "list-item-text" => {
            let text_ops = block_children_to_ops(children);
            ops.extend(text_ops);
            let list_type = ctx.list_type.as_deref().unwrap_or("bullet");
            ops.push(json!({ "insert": "\n", "attributes": { "list": list_type } }));
        }
        "code-block" => {
            // Extract text content (ignore marks in code blocks)
            let code: String = children
                .iter()
                .filter_map(|c| {
                    if let HirNode::Text { content, .. } = c {
                        Some(content.as_str())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join("");
            let lang = attrs.get("language").and_then(|v| v.as_str());
            let code_block_attr = if let Some(l) = lang {
                json!({ "code-block": l })
            } else {
                json!({ "code-block": true })
            };
            let lines: Vec<&str> = code.split('\n').collect();
            let last_idx = if lines.last() == Some(&"") {
                lines.len() - 1
            } else {
                lines.len()
            };
            for line in &lines[..last_idx] {
                if !line.is_empty() {
                    ops.push(json!({ "insert": line }));
                }
                ops.push(json!({ "insert": "\n", "attributes": code_block_attr }));
            }
        }
        _ => {
            // Unknown block: emit inline content + plain newline
            let text_ops = block_children_to_ops(children);
            ops.extend(text_ops);
            ops.push(json!({ "insert": "\n" }));
        }
    }
}

/// Convert HIR text children to Quill insert ops.
fn block_children_to_ops(children: &[HirNode]) -> Vec<Value> {
    let mut ops = Vec::new();
    for child in children {
        if let HirNode::Text { content, marks } = child {
            // Check for embed marks
            if let Some(embed_op) = embed_mark_to_op(marks) {
                ops.push(embed_op);
                continue;
            }
            if content.is_empty() {
                continue;
            }
            emit_text_ops(content, marks, &mut ops);
        }
    }
    ops
}

fn emit_text_ops(content: &str, marks: &[MarkApplication], ops: &mut Vec<Value>) {
    if content.is_empty() {
        return;
    }
    let quill_attrs = marks_to_quill_attrs(marks);
    let mut op = json!({ "insert": content });
    if !quill_attrs.is_empty() {
        op["attributes"] = Value::Object(quill_attrs);
    }
    ops.push(op);
}

fn embed_mark_to_op(marks: &[MarkApplication]) -> Option<Value> {
    for mark in marks {
        match mark.kind.as_str() {
            "org.quilljs.delta.facet#image" => {
                let src = mark
                    .attrs
                    .get("src")
                    .cloned()
                    .unwrap_or(Value::String(String::new()));
                return Some(json!({ "insert": { "image": src } }));
            }
            "org.quilljs.delta.facet#video" => {
                let src = mark
                    .attrs
                    .get("src")
                    .cloned()
                    .unwrap_or(Value::String(String::new()));
                return Some(json!({ "insert": { "video": src } }));
            }
            "org.quilljs.delta.facet#formula" => {
                let val = mark
                    .attrs
                    .get("value")
                    .cloned()
                    .unwrap_or(Value::String(String::new()));
                return Some(json!({ "insert": { "formula": val } }));
            }
            _ => {}
        }
    }
    None
}

fn marks_to_quill_attrs(marks: &[MarkApplication]) -> Map<String, Value> {
    let mut attrs = Map::new();
    for mark in marks {
        match mark.kind.as_str() {
            "org.quilljs.delta.facet#bold" => {
                attrs.insert("bold".into(), Value::Bool(true));
            }
            "org.quilljs.delta.facet#italic" => {
                attrs.insert("italic".into(), Value::Bool(true));
            }
            "org.quilljs.delta.facet#underline" => {
                attrs.insert("underline".into(), Value::Bool(true));
            }
            "org.quilljs.delta.facet#strike" => {
                attrs.insert("strike".into(), Value::Bool(true));
            }
            "org.quilljs.delta.facet#code" => {
                attrs.insert("code".into(), Value::Bool(true));
            }
            "org.quilljs.delta.facet#superscript" => {
                attrs.insert("script".into(), Value::String("super".into()));
            }
            "org.quilljs.delta.facet#subscript" => {
                attrs.insert("script".into(), Value::String("sub".into()));
            }
            "org.quilljs.delta.facet#link" => {
                let url = mark.attrs.get("url").and_then(|v| v.as_str()).unwrap_or("");
                attrs.insert("link".into(), Value::String(url.into()));
            }
            "org.quilljs.delta.facet#color" => {
                if let Some(v) = mark.attrs.get("value") {
                    attrs.insert("color".into(), v.clone());
                }
            }
            "org.quilljs.delta.facet#background" => {
                if let Some(v) = mark.attrs.get("value") {
                    attrs.insert("background".into(), v.clone());
                }
            }
            "org.quilljs.delta.facet#font" => {
                if let Some(v) = mark.attrs.get("value") {
                    attrs.insert("font".into(), v.clone());
                }
            }
            "org.quilljs.delta.facet#size" => {
                if let Some(v) = mark.attrs.get("value") {
                    attrs.insert("size".into(), v.clone());
                }
            }
            _ => {}
        }
    }
    attrs
}
