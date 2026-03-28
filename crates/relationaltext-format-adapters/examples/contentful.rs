//! Contentful Rich Text adapter: import and export for RelationalText documents.
//!
//! Format namespace: `com.contentful.richtext.facet`
//!
//! WASM interface:
//!   alloc / dealloc / result_len — memory boilerplate
//!   import(ptr, len) -> ptr     — Contentful JSON (in "text" field) → DocumentJSON
//!   export(ptr, len) -> ptr     — DocumentJSON (Contentful facets) → raw Contentful JSON

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "com.contentful.richtext.facet";

// ─── Lexicon registry ─────────────────────────────────────────────────────────

const LEXICON_JSON: &[u8] =
    include_bytes!("../../../formats/com.contentful.richtext/contentful.lexicon.json");

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

// ─── Import: Contentful JSON → DocumentJSON ──────────────────────────────────

struct ImportState {
    text: String,
    facets: Vec<Value>,
    container_stack: Vec<String>,
}

impl ImportState {
    fn new() -> Self {
        Self {
            text: String::new(),
            facets: Vec::new(),
            container_stack: Vec::new(),
        }
    }
}

fn do_import(raw: &str) -> String {
    let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let cf_str = outer["text"].as_str().unwrap_or(raw);
    let cf_doc: Value = serde_json::from_str(cf_str).unwrap_or(Value::Null);

    let mut state = ImportState::new();
    let content = cf_doc["content"].as_array().cloned().unwrap_or_default();
    for child in &content {
        if child["nodeType"].as_str() != Some("text") {
            walk_block(child, &mut state);
        }
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

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

fn walk_block(node: &Value, state: &mut ImportState) {
    let node_type = node["nodeType"].as_str().unwrap_or("");
    match node_type {
        "paragraph" => {
            let stack_top = state
                .container_stack
                .last()
                .map(|s| s.as_str())
                .unwrap_or("");
            let is_list_item =
                stack_top == "unordered-list-item" || stack_top == "ordered-list-item";
            let block_name = if is_list_item {
                "list-item-text"
            } else {
                "paragraph"
            };
            let parents = state.container_stack.clone();
            open_block(state, block_name, parents, None);
            let content = node["content"].as_array().cloned().unwrap_or_default();
            walk_inline(&content, state);
        }
        "heading-1" | "heading-2" | "heading-3" | "heading-4" | "heading-5" | "heading-6" => {
            let parents = state.container_stack.clone();
            open_block(state, node_type, parents, None);
            let content = node["content"].as_array().cloned().unwrap_or_default();
            walk_inline(&content, state);
        }
        "blockquote" => {
            let parents = state.container_stack.clone();
            open_block(state, "blockquote-marker", parents, None);
            state.container_stack.push("blockquote".to_owned());
            let content = node["content"].as_array().cloned().unwrap_or_default();
            for child in &content {
                if child["nodeType"].as_str() != Some("text") {
                    walk_block(child, state);
                }
            }
            state.container_stack.pop();
        }
        "unordered-list" => {
            let parents = state.container_stack.clone();
            open_block(state, "bullet-list-marker", parents, None);
            state.container_stack.push("ul".to_owned());
            let content = node["content"].as_array().cloned().unwrap_or_default();
            for child in &content {
                if child["nodeType"].as_str() != Some("text") {
                    walk_block(child, state);
                }
            }
            state.container_stack.pop();
        }
        "ordered-list" => {
            let parents = state.container_stack.clone();
            open_block(state, "ordered-list-marker", parents, None);
            state.container_stack.push("ol".to_owned());
            let content = node["content"].as_array().cloned().unwrap_or_default();
            for child in &content {
                if child["nodeType"].as_str() != Some("text") {
                    walk_block(child, state);
                }
            }
            state.container_stack.pop();
        }
        "list-item" => {
            let stack_top = state
                .container_stack
                .last()
                .map(|s| s.as_str())
                .unwrap_or("");
            let is_ordered = stack_top == "ol" || stack_top.starts_with("ol:");
            let item_type = if is_ordered {
                "ordered-list-item"
            } else {
                "unordered-list-item"
            };
            let parents = state.container_stack.clone();
            open_block(state, "list-item-marker", parents, None);
            state.container_stack.push(item_type.to_owned());
            let content = node["content"].as_array().cloned().unwrap_or_default();
            for child in &content {
                if child["nodeType"].as_str() != Some("text") {
                    walk_block(child, state);
                }
            }
            state.container_stack.pop();
        }
        "hr" => {
            let parents = state.container_stack.clone();
            open_block(state, "hr", parents, None);
        }
        "embedded-entry-block" | "embedded-asset-block" => {}
        _ => {}
    }
}

fn walk_inline(nodes: &[Value], state: &mut ImportState) {
    for node in nodes {
        match node["nodeType"].as_str().unwrap_or("") {
            "text" => {
                let text = node["value"].as_str().unwrap_or("");
                if text.is_empty() {
                    continue;
                }
                let start = state.text.len();
                state.text.push_str(text);
                let end = state.text.len();
                let marks = node["marks"].as_array().cloned().unwrap_or_default();
                let features: Vec<Value> = marks
                    .iter()
                    .filter_map(|m| {
                        let mark_type = m["type"].as_str()?;
                        contentful_mark_to_feature(mark_type)
                    })
                    .collect();
                if !features.is_empty() {
                    state.facets.push(json!({
                        "index": { "byteStart": start, "byteEnd": end },
                        "features": features,
                    }));
                }
            }
            "hyperlink" => {
                let uri = node["data"]["uri"].as_str().unwrap_or("");
                let link_start = state.text.len();
                let content = node["content"].as_array().cloned().unwrap_or_default();
                for child in &content {
                    if child["nodeType"].as_str() == Some("text") {
                        if let Some(t) = child["value"].as_str() {
                            state.text.push_str(t);
                        }
                    }
                }
                let link_end = state.text.len();
                if link_end > link_start {
                    state.facets.push(json!({
                        "index": { "byteStart": link_start, "byteEnd": link_end },
                        "features": [{ "$type": TYPE_ID, "name": "hyperlink", "uri": uri }],
                    }));
                }
            }
            _ => {}
        }
    }
}

fn contentful_mark_to_feature(mark_type: &str) -> Option<Value> {
    match mark_type {
        "bold" => Some(json!({ "$type": TYPE_ID, "name": "bold" })),
        "italic" => Some(json!({ "$type": TYPE_ID, "name": "italic" })),
        "underline" => Some(json!({ "$type": TYPE_ID, "name": "underline" })),
        "code" => Some(json!({ "$type": TYPE_ID, "name": "code" })),
        "superscript" => Some(json!({ "$type": TYPE_ID, "name": "superscript" })),
        "subscript" => Some(json!({ "$type": TYPE_ID, "name": "subscript" })),
        _ => None,
    }
}

// ─── Export: DocumentJSON → Contentful JSON ──────────────────────────────────

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => return json!({ "nodeType": "document", "data": {}, "content": [] }).to_string(),
    };

    let nodes = build_hir_from_doc(&doc, registry());
    let content = walk_hir_nodes(&nodes);
    json!({ "nodeType": "document", "data": {}, "content": content }).to_string()
}

fn walk_hir_nodes(nodes: &[HirNode]) -> Vec<Value> {
    nodes.iter().flat_map(|n| walk_hir_node(n)).collect()
}

fn walk_hir_node(node: &HirNode) -> Vec<Value> {
    match node {
        HirNode::Text { content, marks } => text_node_to_contentful(content, marks),
        HirNode::Container { name, children, .. } => {
            if let Some(v) = container_to_contentful(name, children) {
                vec![v]
            } else {
                vec![]
            }
        }
        HirNode::Block {
            name,
            attrs,
            children,
        } => {
            if let Some(v) = block_to_contentful(name, attrs, children) {
                vec![v]
            } else {
                vec![]
            }
        }
    }
}

fn container_to_contentful(name: &str, children: &[HirNode]) -> Option<Value> {
    match name {
        "ul" => {
            let items: Vec<Value> = children
                .iter()
                .filter_map(|c| {
                    if let HirNode::Container {
                        name: cn,
                        children: gc,
                        ..
                    } = c
                    {
                        if cn == "unordered-list-item" {
                            return Some(list_item_to_contentful(gc));
                        }
                    }
                    None
                })
                .collect();
            Some(json!({ "nodeType": "unordered-list", "data": {}, "content": items }))
        }
        "ol" | _ if name.starts_with("ol:") => {
            let items: Vec<Value> = children
                .iter()
                .filter_map(|c| {
                    if let HirNode::Container {
                        name: cn,
                        children: gc,
                        ..
                    } = c
                    {
                        if cn == "ordered-list-item" {
                            return Some(list_item_to_contentful(gc));
                        }
                    }
                    None
                })
                .collect();
            Some(json!({ "nodeType": "ordered-list", "data": {}, "content": items }))
        }
        "blockquote" => Some(
            json!({ "nodeType": "blockquote", "data": {}, "content": walk_hir_nodes(children) }),
        ),
        "unordered-list-item" | "ordered-list-item" => Some(list_item_to_contentful(children)),
        _ => None,
    }
}

fn list_item_to_contentful(children: &[HirNode]) -> Value {
    let mut content: Vec<Value> = Vec::new();
    for child in children {
        match child {
            HirNode::Block { name, .. } if is_marker(name) => {}
            HirNode::Block {
                name, children: bc, ..
            } if name == "list-item-text" || name == "paragraph" => {
                content.push(json!({ "nodeType": "paragraph", "data": {}, "content": inlines_to_contentful(bc) }));
            }
            HirNode::Container {
                name, children: gc, ..
            } => {
                if let Some(v) = container_to_contentful(name, gc) {
                    content.push(v);
                }
            }
            _ => {}
        }
    }
    json!({ "nodeType": "list-item", "data": {}, "content": content })
}

fn block_to_contentful(
    name: &str,
    attrs: &std::collections::HashMap<String, Value>,
    children: &[HirNode],
) -> Option<Value> {
    if is_marker(name) {
        return None;
    }
    match name {
        "paragraph" => Some(
            json!({ "nodeType": "paragraph", "data": {}, "content": inlines_to_contentful(children) }),
        ),
        "heading-1" | "heading-2" | "heading-3" | "heading-4" | "heading-5" | "heading-6" => Some(
            json!({ "nodeType": name, "data": {}, "content": inlines_to_contentful(children) }),
        ),
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
            let code_text = json!({
                "nodeType": "text",
                "value": code,
                "marks": [{ "type": "code" }],
                "data": {}
            });
            Some(json!({ "nodeType": "paragraph", "data": {}, "content": [code_text] }))
        }
        "hr" => Some(json!({ "nodeType": "hr", "data": {}, "content": [] })),
        _ => Some(
            json!({ "nodeType": "paragraph", "data": {}, "content": inlines_to_contentful(children) }),
        ),
    }
}

fn inlines_to_contentful(nodes: &[HirNode]) -> Vec<Value> {
    nodes
        .iter()
        .flat_map(|n| {
            if let HirNode::Text { content, marks } = n {
                text_node_to_contentful(content, marks)
            } else {
                vec![]
            }
        })
        .collect()
}

fn text_node_to_contentful(content: &str, marks: &[MarkApplication]) -> Vec<Value> {
    // Check for hyperlink mark — render as hyperlink node
    if let Some(link_mark) = marks
        .iter()
        .find(|m| m.kind == format!("{}#hyperlink", TYPE_ID))
    {
        let uri = link_mark
            .attrs
            .get("uri")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let other_marks: Vec<Value> = marks
            .iter()
            .filter(|m| m.kind != format!("{}#hyperlink", TYPE_ID))
            .filter_map(|m| hir_mark_to_cf_mark(m))
            .collect();
        let inner_text = json!({
            "nodeType": "text",
            "value": content,
            "marks": other_marks,
            "data": {}
        });
        return vec![json!({
            "nodeType": "hyperlink",
            "data": { "uri": uri },
            "content": [inner_text]
        })];
    }

    let cf_marks: Vec<Value> = marks
        .iter()
        .filter_map(|m| hir_mark_to_cf_mark(m))
        .collect();
    vec![json!({ "nodeType": "text", "value": content, "marks": cf_marks, "data": {} })]
}

fn hir_mark_to_cf_mark(mark: &MarkApplication) -> Option<Value> {
    match mark.kind.as_str() {
        "com.contentful.richtext.facet#bold" => Some(json!({ "type": "bold" })),
        "com.contentful.richtext.facet#italic" => Some(json!({ "type": "italic" })),
        "com.contentful.richtext.facet#underline" => Some(json!({ "type": "underline" })),
        "com.contentful.richtext.facet#code" => Some(json!({ "type": "code" })),
        "com.contentful.richtext.facet#superscript" => Some(json!({ "type": "superscript" })),
        "com.contentful.richtext.facet#subscript" => Some(json!({ "type": "subscript" })),
        _ => None,
    }
}

fn is_marker(name: &str) -> bool {
    matches!(
        name,
        "bullet-list-marker" | "ordered-list-marker" | "list-item-marker" | "blockquote-marker"
    )
}
