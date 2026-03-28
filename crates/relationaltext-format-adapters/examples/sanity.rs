//! Sanity Portable Text adapter: import and export for RelationalText documents.
//!
//! Format namespace: `io.sanity.portabletext.facet`
//!
//! WASM interface:
//!   alloc / dealloc / result_len — memory boilerplate
//!   import(ptr, len) -> ptr     — Portable Text JSON (in "text" field) → DocumentJSON
//!   export(ptr, len) -> ptr     — DocumentJSON (Sanity facets) → raw Portable Text JSON

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::OnceLock;

const TYPE_ID: &str = "io.sanity.portabletext.facet";

// ─── Lexicon registry ─────────────────────────────────────────────────────────

const LEXICON_JSON: &[u8] =
    include_bytes!("../../../formats/io.sanity.portabletext/sanity.lexicon.json");

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

// ─── Import: Portable Text JSON → DocumentJSON ──────────────────────────────

struct ImportState {
    text: String,
    facets: Vec<Value>,
}

impl ImportState {
    fn new() -> Self {
        Self {
            text: String::new(),
            facets: Vec::new(),
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
    let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let pt_str = outer["text"].as_str().unwrap_or(raw);
    let blocks: Value = serde_json::from_str(pt_str).unwrap_or(Value::Null);
    let empty = Vec::new();
    let blocks_arr = blocks.as_array().unwrap_or(&empty);

    let mut state = ImportState::new();
    let mut prev_list_type: Option<String> = None;

    for block in blocks_arr {
        prev_list_type = process_block(block, &mut state, prev_list_type);
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

fn open_block(state: &mut ImportState, name: &str, parents: Vec<String>) {
    let marker_char = if state.text.is_empty() {
        '\u{FFFC}'
    } else {
        '\n'
    };
    let marker_start = state.text.len();
    state.text.push(marker_char);
    let marker_end = state.text.len();

    // Sanity always includes attrs: {} (even when empty)
    let feature = json!({
        "$type": TYPE_ID,
        "name": name,
        "parents": parents,
        "attrs": {}
    });
    state.facets.push(json!({
        "index": { "byteStart": marker_start, "byteEnd": marker_end },
        "features": [feature],
    }));
}

fn process_block(
    block: &Value,
    state: &mut ImportState,
    prev_list_type: Option<String>,
) -> Option<String> {
    // Build markDef lookup map
    let empty_arr = Vec::new();
    let mark_defs = block["markDefs"].as_array().unwrap_or(&empty_arr);
    let mut mark_def_map: HashMap<String, Value> = HashMap::new();
    for def in mark_defs {
        if let Some(key) = def["_key"].as_str() {
            mark_def_map.insert(key.to_owned(), def.clone());
        }
    }

    let children = block["children"].as_array().unwrap_or(&empty_arr);

    match block["listItem"].as_str() {
        Some("bullet") => {
            if prev_list_type.as_deref() != Some("bullet") {
                open_block(state, "bullet-list-marker", vec![]);
            }
            open_block(state, "list-item-marker", vec!["ul".to_owned()]);
            open_block(
                state,
                "list-item-text",
                vec!["ul".to_owned(), "unordered-list-item".to_owned()],
            );
            walk_spans(children, &mark_def_map, state);
            return Some("bullet".to_owned());
        }
        Some("number") => {
            if prev_list_type.as_deref() != Some("number") {
                open_block(state, "ordered-list-marker", vec![]);
            }
            open_block(state, "list-item-marker", vec!["ol".to_owned()]);
            open_block(
                state,
                "list-item-text",
                vec!["ol".to_owned(), "ordered-list-item".to_owned()],
            );
            walk_spans(children, &mark_def_map, state);
            return Some("number".to_owned());
        }
        _ => {}
    }

    // Non-list blocks
    let style = block["style"].as_str().unwrap_or("normal");

    if style == "blockquote" {
        open_block(state, "blockquote-marker", vec![]);
        open_block(state, "normal", vec!["blockquote".to_owned()]);
        walk_spans(children, &mark_def_map, state);
        return None;
    }

    // h1–h6: use style directly as feature name
    if style.starts_with('h') && style.len() == 2 && style.as_bytes()[1].is_ascii_digit() {
        open_block(state, style, vec![]);
        walk_spans(children, &mark_def_map, state);
        return None;
    }

    // normal or any other style
    open_block(state, "normal", vec![]);
    walk_spans(children, &mark_def_map, state);
    None
}

fn walk_spans(spans: &[Value], mark_def_map: &HashMap<String, Value>, state: &mut ImportState) {
    for span in spans {
        if span["_type"].as_str() != Some("span") {
            continue;
        }
        let text = span["text"].as_str().unwrap_or("");
        if text.is_empty() {
            continue;
        }

        let start = state.text.len();
        state.text.push_str(text);
        let end = state.text.len();

        let empty = Vec::new();
        let marks = span["marks"].as_array().unwrap_or(&empty);
        let features: Vec<Value> = marks
            .iter()
            .filter_map(|m| {
                let mark_str = m.as_str()?;
                mark_to_feature(mark_str, mark_def_map)
            })
            .collect();

        if !features.is_empty() {
            state.facets.push(json!({
                "index": { "byteStart": start, "byteEnd": end },
                "features": features,
            }));
        }
    }
}

fn mark_to_feature(mark: &str, mark_def_map: &HashMap<String, Value>) -> Option<Value> {
    match mark {
        "strong" => Some(json!({ "$type": TYPE_ID, "name": "strong" })),
        "em" => Some(json!({ "$type": TYPE_ID, "name": "em" })),
        "underline" => Some(json!({ "$type": TYPE_ID, "name": "underline" })),
        "code" => Some(json!({ "$type": TYPE_ID, "name": "code" })),
        "strike-through" => Some(json!({ "$type": TYPE_ID, "name": "strike-through" })),
        "sup" => Some(json!({ "$type": TYPE_ID, "name": "sup" })),
        "sub" => Some(json!({ "$type": TYPE_ID, "name": "sub" })),
        key => {
            // markDef key reference
            let def = mark_def_map.get(key)?;
            if def["_type"].as_str() == Some("link") {
                let href = def["href"].as_str().unwrap_or("");
                Some(json!({ "$type": TYPE_ID, "name": "link", "href": href }))
            } else {
                None
            }
        }
    }
}

// ─── Export: DocumentJSON → Portable Text JSON ───────────────────────────────

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => return "[]".to_string(),
    };

    let nodes = build_hir_from_doc(&doc, registry());
    let mut blocks: Vec<Value> = Vec::new();
    for node in &nodes {
        walk_hir_node(node, &mut blocks);
    }
    serde_json::to_string(&blocks).unwrap_or_else(|_| "[]".to_string())
}

fn walk_hir_node(node: &HirNode, blocks: &mut Vec<Value>) {
    match node {
        HirNode::Block {
            name,
            attrs,
            children,
        } => walk_block_node(name, attrs, children, blocks),
        HirNode::Container { name, children, .. } => walk_container_node(name, children, blocks),
        HirNode::Text { .. } => {}
    }
}

fn walk_container_node(name: &str, children: &[HirNode], blocks: &mut Vec<Value>) {
    match name {
        "ul" => {
            for child in children {
                if let HirNode::Container {
                    name: cn,
                    children: gc,
                    ..
                } = child
                {
                    if cn == "unordered-list-item" {
                        emit_list_items(gc, "bullet", blocks);
                    }
                }
            }
        }
        "ol" | _ if name.starts_with("ol:") => {
            for child in children {
                if let HirNode::Container {
                    name: cn,
                    children: gc,
                    ..
                } = child
                {
                    if cn == "ordered-list-item" {
                        emit_list_items(gc, "number", blocks);
                    }
                }
            }
        }
        "blockquote" => {
            for child in children {
                if let HirNode::Block {
                    name: bn,
                    children: bc,
                    ..
                } = child
                {
                    if is_marker(bn) {
                        continue;
                    }
                    let (spans, mark_defs) = inlines_to_sanity(bc);
                    blocks.push(json!({
                        "_type": "block",
                        "style": "blockquote",
                        "children": spans,
                        "markDefs": mark_defs
                    }));
                }
            }
        }
        _ => {
            for child in children {
                walk_hir_node(child, blocks);
            }
        }
    }
}

fn emit_list_items(children: &[HirNode], list_item: &str, blocks: &mut Vec<Value>) {
    for child in children {
        if let HirNode::Block {
            name, children: bc, ..
        } = child
        {
            if is_marker(name) {
                continue;
            }
            let (spans, mark_defs) = inlines_to_sanity(bc);
            blocks.push(json!({
                "_type": "block",
                "style": "normal",
                "listItem": list_item,
                "level": 1,
                "children": spans,
                "markDefs": mark_defs
            }));
        }
    }
}

fn walk_block_node(
    name: &str,
    _attrs: &HashMap<String, Value>,
    children: &[HirNode],
    blocks: &mut Vec<Value>,
) {
    if is_marker(name) {
        return;
    }
    match name {
        "normal" => {
            let (spans, mark_defs) = inlines_to_sanity(children);
            blocks.push(json!({ "_type": "block", "style": "normal", "children": spans, "markDefs": mark_defs }));
        }
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
            let (spans, mark_defs) = inlines_to_sanity(children);
            blocks.push(json!({ "_type": "block", "style": name, "children": spans, "markDefs": mark_defs }));
        }
        "code-block" => {
            let text_content: String = children
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
            let code = if text_content.ends_with('\n') {
                &text_content[..text_content.len() - 1]
            } else {
                &text_content
            };
            blocks.push(json!({
                "_type": "block",
                "style": "normal",
                "children": [{ "_type": "span", "text": code, "marks": ["code"] }],
                "markDefs": []
            }));
        }
        "horizontal-rule" => {}
        _ => {
            let (spans, mark_defs) = inlines_to_sanity(children);
            blocks.push(json!({ "_type": "block", "style": "normal", "children": spans, "markDefs": mark_defs }));
        }
    }
}

fn inlines_to_sanity(nodes: &[HirNode]) -> (Vec<Value>, Vec<Value>) {
    let mut spans: Vec<Value> = Vec::new();
    let mut mark_defs: Vec<Value> = Vec::new();
    let mut link_counter = 0usize;

    for node in nodes {
        if let HirNode::Text { content, marks } = node {
            if content.is_empty() {
                continue;
            }
            let mut mark_names: Vec<Value> = Vec::new();

            for mark in marks {
                if let Some((mark_name, new_def)) =
                    hir_mark_to_sanity_mark(mark, &mark_defs, link_counter)
                {
                    mark_names.push(Value::String(mark_name));
                    if let Some(def) = new_def {
                        mark_defs.push(def);
                        link_counter += 1;
                    }
                }
            }

            spans.push(json!({ "_type": "span", "text": content, "marks": mark_names }));
        }
    }

    (spans, mark_defs)
}

fn hir_mark_to_sanity_mark(
    mark: &MarkApplication,
    existing_mark_defs: &[Value],
    link_counter: usize,
) -> Option<(String, Option<Value>)> {
    match mark.kind.as_str() {
        "io.sanity.portabletext.facet#strong" => Some(("strong".to_owned(), None)),
        "io.sanity.portabletext.facet#em" => Some(("em".to_owned(), None)),
        "io.sanity.portabletext.facet#underline" => Some(("underline".to_owned(), None)),
        "io.sanity.portabletext.facet#strike-through" => Some(("strike-through".to_owned(), None)),
        "io.sanity.portabletext.facet#code" => Some(("code".to_owned(), None)),
        "io.sanity.portabletext.facet#sup" => Some(("sup".to_owned(), None)),
        "io.sanity.portabletext.facet#sub" => Some(("sub".to_owned(), None)),
        "io.sanity.portabletext.facet#link" => {
            let href = mark
                .attrs
                .get("href")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            // Check if this href already has a markDef entry
            for def in existing_mark_defs {
                if def["_type"].as_str() == Some("link") && def["href"].as_str() == Some(href) {
                    let key = def["_key"].as_str().unwrap_or("").to_owned();
                    return Some((key, None));
                }
            }
            let key = format!("link{}", link_counter);
            Some((
                key.clone(),
                Some(json!({ "_key": key, "_type": "link", "href": href })),
            ))
        }
        _ => None,
    }
}

fn is_marker(name: &str) -> bool {
    matches!(
        name,
        "bullet-list-marker" | "ordered-list-marker" | "list-item-marker" | "blockquote-marker"
    )
}
