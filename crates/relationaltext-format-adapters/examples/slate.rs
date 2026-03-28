//! Slate.js JSON format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `rocks.slate.facet`
//!
//! WASM interface:
//!   alloc / dealloc / result_len — memory boilerplate
//!   import(ptr, len) -> ptr     — Slate JSON (in "text" field) → DocumentJSON
//!   export(ptr, len) -> ptr     — DocumentJSON (Slate facets) → raw Slate JSON (in "text" field)

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Map, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "rocks.slate.facet";

// ─── Lexicon registry ─────────────────────────────────────────────────────────

const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/rocks.slate/slate.lexicon.json");

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

// ─── Import: Slate JSON → DocumentJSON ────────────────────────────────────────

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
    let slate_json_str = outer["text"].as_str().unwrap_or(raw);

    let slate_doc: Value = serde_json::from_str(slate_json_str).unwrap_or(Value::Array(vec![]));
    let top_nodes = match &slate_doc {
        Value::Array(arr) => arr.clone(),
        _ => vec![],
    };

    let mut state = ImportState::new();
    for node in &top_nodes {
        if is_text_leaf(node) {
            // Top-level text leaf — wrap in paragraph
            let parents = state.container_stack.clone();
            open_slate_block(&mut state, "paragraph", parents, None);
            walk_inline(&[node.clone()], &mut state);
        } else {
            walk_block(node, &mut state);
        }
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

fn is_text_leaf(node: &Value) -> bool {
    node.get("text").is_some() && node.get("type").is_none()
}

fn open_slate_block(
    state: &mut ImportState,
    name: &str,
    parents: Vec<String>,
    attrs: Option<Value>,
) {
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

fn heading_level(node_type: &str) -> Option<u64> {
    match node_type {
        "heading-one" | "h1" => Some(1),
        "heading-two" | "h2" => Some(2),
        "heading-three" | "h3" => Some(3),
        "heading-four" | "h4" => Some(4),
        "heading-five" | "h5" => Some(5),
        "heading-six" | "h6" => Some(6),
        _ => None,
    }
}

fn walk_block(node: &Value, state: &mut ImportState) {
    let node_type = node["type"].as_str().unwrap_or("");

    // Heading types
    if let Some(level) = heading_level(node_type) {
        let parents = state.container_stack.clone();
        open_slate_block(state, "heading", parents, Some(json!({ "level": level })));
        let children = node["children"].as_array().cloned().unwrap_or_default();
        walk_inline(&children, state);
        return;
    }

    match node_type {
        "paragraph" => {
            let stack_top = state.container_stack.last().cloned().unwrap_or_default();
            let is_inside_list_item =
                stack_top == "unordered-list-item" || stack_top == "ordered-list-item";
            let block_name = if is_inside_list_item {
                "list-item-text"
            } else {
                "paragraph"
            };
            let parents = state.container_stack.clone();
            open_slate_block(state, block_name, parents, None);
            let children = node["children"].as_array().cloned().unwrap_or_default();
            walk_inline(&children, state);
        }
        "block-quote" | "blockquote" => {
            let parents = state.container_stack.clone();
            open_slate_block(state, "blockquote-marker", parents, None);
            state.container_stack.push("blockquote".into());
            let children = node["children"].as_array().cloned().unwrap_or_default();
            for child in &children {
                if !is_text_leaf(child) {
                    walk_block(child, state);
                }
            }
            state.container_stack.pop();
        }
        "bulleted-list" | "ul" | "unordered-list" => {
            let parents = state.container_stack.clone();
            open_slate_block(state, "bullet-list-marker", parents, None);
            state.container_stack.push("ul".into());
            let children = node["children"].as_array().cloned().unwrap_or_default();
            for child in &children {
                if !is_text_leaf(child) {
                    walk_block(child, state);
                }
            }
            state.container_stack.pop();
        }
        "numbered-list" | "ol" | "ordered-list" => {
            let parents = state.container_stack.clone();
            open_slate_block(state, "ordered-list-marker", parents, None);
            state.container_stack.push("ol".into());
            let children = node["children"].as_array().cloned().unwrap_or_default();
            for child in &children {
                if !is_text_leaf(child) {
                    walk_block(child, state);
                }
            }
            state.container_stack.pop();
        }
        "list-item" | "li" => {
            let stack_top = state.container_stack.last().cloned().unwrap_or_default();
            let is_ordered = stack_top == "ol" || stack_top.starts_with("ol:");
            let item_type = if is_ordered {
                "ordered-list-item"
            } else {
                "unordered-list-item"
            };
            let parents = state.container_stack.clone();
            open_slate_block(state, "list-item-marker", parents, None);
            state.container_stack.push(item_type.into());
            let children = node["children"].as_array().cloned().unwrap_or_default();
            let first_child = children.first();
            let has_block_children = first_child
                .map(|c| !is_text_leaf(c) && c.get("type").is_some())
                .unwrap_or(false);
            if has_block_children {
                for child in &children {
                    if !is_text_leaf(child) {
                        walk_block(child, state);
                    }
                }
            } else {
                let new_parents = state.container_stack.clone();
                open_slate_block(state, "list-item-text", new_parents, None);
                walk_inline(&children, state);
            }
            state.container_stack.pop();
        }
        "code" | "code-block" => {
            let parents = state.container_stack.clone();
            open_slate_block(state, "code-block", parents, None);
            let mut code = String::new();
            let children = node["children"].as_array().cloned().unwrap_or_default();
            for child in &children {
                if is_text_leaf(&child) {
                    code.push_str(child["text"].as_str().unwrap_or(""));
                }
            }
            state.text.push_str(&code);
            state.text.push('\n');
        }
        "thematic-break" | "divider" | "horizontal-rule" | "hr" => {
            let parents = state.container_stack.clone();
            open_slate_block(state, "horizontal-rule", parents, None);
        }
        _ => {
            // Unknown block: treat as paragraph
            let parents = state.container_stack.clone();
            open_slate_block(state, "paragraph", parents, None);
            let children = node["children"].as_array().cloned().unwrap_or_default();
            walk_inline(&children, state);
        }
    }
}

fn walk_inline(nodes: &[Value], state: &mut ImportState) {
    for node in nodes {
        if is_text_leaf(node) {
            let text = node["text"].as_str().unwrap_or("");
            if text.is_empty() {
                continue;
            }
            let rel_start = state.text.len();
            state.text.push_str(text);
            let rel_end = state.text.len();

            let mut features: Vec<Value> = Vec::new();
            let mark_pairs: &[(&str, &str)] = &[
                ("bold", "bold"),
                ("italic", "italic"),
                ("underline", "underline"),
                ("strikethrough", "strikethrough"),
                ("strike", "strikethrough"),
                ("code", "code"),
                ("superscript", "superscript"),
                ("subscript", "subscript"),
            ];
            for &(prop, feat_name) in mark_pairs {
                if node[prop] == Value::Bool(true) {
                    // Avoid duplicates (e.g., both "strikethrough" and "strike" = true)
                    if !features
                        .iter()
                        .any(|f| f["name"].as_str() == Some(feat_name))
                    {
                        features.push(json!({ "$type": TYPE_ID, "name": feat_name }));
                    }
                }
            }
            if !features.is_empty() {
                state.facets.push(json!({
                    "index": { "byteStart": rel_start, "byteEnd": rel_end },
                    "features": features,
                }));
            }
        } else if node
            .get("type")
            .map(|t| t.as_str() == Some("link"))
            .unwrap_or(false)
        {
            let url = node["url"]
                .as_str()
                .or_else(|| node["href"].as_str())
                .unwrap_or("");
            let children = node["children"].as_array().cloned().unwrap_or_default();
            for child in &children {
                if is_text_leaf(child) {
                    let text = child["text"].as_str().unwrap_or("");
                    if text.is_empty() {
                        continue;
                    }
                    let rel_start = state.text.len();
                    state.text.push_str(text);
                    let rel_end = state.text.len();
                    state.facets.push(json!({
                        "index": { "byteStart": rel_start, "byteEnd": rel_end },
                        "features": [{ "$type": TYPE_ID, "name": "link", "url": url }],
                    }));
                }
            }
        }
    }
}

// ─── Export: DocumentJSON → Slate JSON ────────────────────────────────────────

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => {
            return "[]".to_string();
        }
    };

    let nodes = build_hir_from_doc(&doc, registry());
    let slate_nodes = hir_nodes_to_slate(&nodes);
    serde_json::to_string(&slate_nodes).unwrap_or_else(|_| "[]".into())
}

fn hir_nodes_to_slate(nodes: &[HirNode]) -> Vec<Value> {
    let mut result = Vec::new();
    for node in nodes {
        if let Some(el) = hir_node_to_slate(node) {
            result.push(el);
        }
    }
    result
}

fn hir_node_to_slate(node: &HirNode) -> Option<Value> {
    match node {
        HirNode::Text { content, .. } => {
            // Top-level text nodes shouldn't normally appear; wrap in paragraph
            Some(json!({ "type": "paragraph", "children": [{ "text": content }] }))
        }
        HirNode::Container { name, children, .. } => container_to_slate(name, children),
        HirNode::Block {
            name,
            attrs,
            children,
        } => block_to_slate(name, attrs, children),
    }
}

fn container_to_slate(name: &str, children: &[HirNode]) -> Option<Value> {
    match name {
        "ul" => {
            let items: Vec<Value> = children
                .iter()
                .filter_map(|c| {
                    if let HirNode::Container { name, children, .. } = c {
                        if name == "unordered-list-item" {
                            return Some(list_item_to_slate(children));
                        }
                    }
                    None
                })
                .collect();
            Some(json!({ "type": "bulleted-list", "children": items }))
        }
        "ol" => {
            let items: Vec<Value> = children
                .iter()
                .filter_map(|c| {
                    if let HirNode::Container { name, children, .. } = c {
                        if name == "ordered-list-item" {
                            return Some(list_item_to_slate(children));
                        }
                    }
                    None
                })
                .collect();
            Some(json!({ "type": "numbered-list", "children": items }))
        }
        name if name.starts_with("ol:") => {
            let items: Vec<Value> = children
                .iter()
                .filter_map(|c| {
                    if let HirNode::Container { name, children, .. } = c {
                        if name == "ordered-list-item" {
                            return Some(list_item_to_slate(children));
                        }
                    }
                    None
                })
                .collect();
            Some(json!({ "type": "numbered-list", "children": items }))
        }
        "blockquote" => {
            let mut block_children = hir_nodes_to_slate(children);
            if block_children.is_empty() {
                block_children = vec![json!({ "type": "paragraph", "children": [{ "text": "" }] })];
            }
            Some(json!({ "type": "block-quote", "children": block_children }))
        }
        "unordered-list-item" | "ordered-list-item" => Some(list_item_to_slate(children)),
        _ => None,
    }
}

fn list_item_to_slate(children: &[HirNode]) -> Value {
    let mut item_children: Vec<Value> = Vec::new();
    for child in children {
        match child {
            HirNode::Block {
                name,
                children: block_children,
                ..
            } => {
                let n = name.as_str();
                if matches!(
                    n,
                    "list-item-marker"
                        | "bullet-list-marker"
                        | "ordered-list-marker"
                        | "blockquote-marker"
                ) {
                    continue;
                }
                if n == "list-item-text" || n == "paragraph" {
                    item_children.extend(inlines_to_slate(block_children));
                }
            }
            HirNode::Container {
                name,
                children: sub_children,
                ..
            } => {
                if let Some(el) = container_to_slate(name, sub_children) {
                    item_children.push(el);
                }
            }
            _ => {}
        }
    }
    if item_children.is_empty() {
        item_children.push(json!({ "text": "" }));
    }
    json!({ "type": "list-item", "children": item_children })
}

fn block_to_slate(
    name: &str,
    attrs: &std::collections::HashMap<String, Value>,
    children: &[HirNode],
) -> Option<Value> {
    match name {
        "bullet-list-marker" | "ordered-list-marker" | "list-item-marker" | "blockquote-marker" => {
            None
        }
        "paragraph" => Some(json!({ "type": "paragraph", "children": inlines_to_slate(children) })),
        "heading" => {
            let level = attrs.get("level").and_then(|v| v.as_u64()).unwrap_or(1);
            let heading_type = match level {
                1 => "heading-one",
                2 => "heading-two",
                3 => "heading-three",
                4 => "heading-four",
                5 => "heading-five",
                _ => "heading-six",
            };
            Some(json!({ "type": heading_type, "children": inlines_to_slate(children) }))
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
                text_content[..text_content.len() - 1].to_owned()
            } else {
                text_content
            };
            Some(json!({ "type": "code", "children": [{ "text": code }] }))
        }
        "horizontal-rule" => {
            Some(json!({ "type": "thematic-break", "children": [{ "text": "" }] }))
        }
        _ => Some(json!({ "type": "paragraph", "children": inlines_to_slate(children) })),
    }
}

fn inlines_to_slate(nodes: &[HirNode]) -> Vec<Value> {
    let mut result = Vec::new();
    for node in nodes {
        if let HirNode::Text { content, marks } = node {
            // Check for hard-break
            if marks
                .iter()
                .any(|m| m.kind == "rocks.slate.facet#hard-break")
            {
                result.push(json!({ "text": "\n" }));
                continue;
            }
            // Check for link
            if let Some(link_mark) = marks.iter().find(|m| m.kind == "rocks.slate.facet#link") {
                let url = link_mark
                    .attrs
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                result
                    .push(json!({ "type": "link", "url": url, "children": [{ "text": content }] }));
                continue;
            }
            // Regular text with boolean marks
            let mut slate_node = Map::new();
            slate_node.insert("text".into(), Value::String(content.clone()));
            let mark_map: &[(&str, &str)] = &[
                ("rocks.slate.facet#bold", "bold"),
                ("rocks.slate.facet#italic", "italic"),
                ("rocks.slate.facet#underline", "underline"),
                ("rocks.slate.facet#strikethrough", "strikethrough"),
                ("rocks.slate.facet#code", "code"),
                ("rocks.slate.facet#superscript", "superscript"),
                ("rocks.slate.facet#subscript", "subscript"),
            ];
            for mark in marks {
                for &(kind, prop) in mark_map {
                    if mark.kind == kind {
                        slate_node.insert(prop.into(), Value::Bool(true));
                    }
                }
            }
            result.push(Value::Object(slate_node));
        }
    }
    if result.is_empty() {
        result.push(json!({ "text": "" }));
    }
    result
}
