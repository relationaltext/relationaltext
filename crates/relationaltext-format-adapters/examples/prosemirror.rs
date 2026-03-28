//! ProseMirror JSON format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `org.prosemirror.facet`
//!
//! WASM interface:
//!   alloc / dealloc / result_len — memory boilerplate
//!   import(ptr, len) -> ptr     — ProseMirror JSON (in "text" field) → DocumentJSON
//!   export(ptr, len) -> ptr     — DocumentJSON (ProseMirror facets) → raw ProseMirror JSON (in "text" field)

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "org.prosemirror.facet";

// ─── Lexicon registry ─────────────────────────────────────────────────────────

const LEXICON_JSON: &[u8] =
    include_bytes!("../../../formats/org.prosemirror/prosemirror.lexicon.json");

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

// ─── Import: ProseMirror JSON → DocumentJSON ──────────────────────────────────

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
    let pm_json_str = outer["text"].as_str().unwrap_or(raw);

    let pm_doc: Value = serde_json::from_str(pm_json_str).unwrap_or(Value::Null);
    let mut state = ImportState::new();

    let content = pm_doc["content"].as_array().cloned().unwrap_or_default();
    for child in &content {
        walk_block(child, &mut state);
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

fn open_pm_block(state: &mut ImportState, name: &str, parents: Vec<String>, attrs: Option<Value>) {
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
    let node_type = node["type"].as_str().unwrap_or("");
    match node_type {
        "doc" => {
            let content = node["content"].as_array().cloned().unwrap_or_default();
            for child in &content {
                walk_block(child, state);
            }
        }
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
            open_pm_block(state, block_name, parents, None);
            let content = node["content"].as_array().cloned().unwrap_or_default();
            walk_inline(&content, state);
        }
        "heading" => {
            let level = node["attrs"]["level"].as_u64().unwrap_or(1);
            let parents = state.container_stack.clone();
            open_pm_block(state, "heading", parents, Some(json!({ "level": level })));
            let content = node["content"].as_array().cloned().unwrap_or_default();
            walk_inline(&content, state);
        }
        "code_block" | "codeBlock" => {
            let lang = node["attrs"]["language"].as_str();
            let code_attrs = if let Some(l) = lang {
                Some(json!({ "language": l }))
            } else {
                None
            };
            let parents = state.container_stack.clone();
            open_pm_block(state, "code_block", parents, code_attrs);
            let mut code = String::new();
            if let Some(content) = node["content"].as_array() {
                for child in content {
                    if child["type"].as_str() == Some("text") {
                        code.push_str(child["text"].as_str().unwrap_or(""));
                    }
                }
            }
            state.text.push_str(&code);
            state.text.push('\n');
        }
        "blockquote" => {
            let parents = state.container_stack.clone();
            open_pm_block(state, "blockquote-marker", parents, None);
            state.container_stack.push("blockquote".into());
            let content = node["content"].as_array().cloned().unwrap_or_default();
            for child in &content {
                walk_block(child, state);
            }
            state.container_stack.pop();
        }
        "bullet_list" | "bulletList" => {
            let parents = state.container_stack.clone();
            open_pm_block(state, "bullet_list", parents, None);
            state.container_stack.push("ul".into());
            let content = node["content"].as_array().cloned().unwrap_or_default();
            for child in &content {
                walk_block(child, state);
            }
            state.container_stack.pop();
        }
        "ordered_list" | "orderedList" => {
            let parents = state.container_stack.clone();
            open_pm_block(state, "ordered_list", parents, None);
            let start = node["attrs"]["start"].as_u64();
            let container_name = if let Some(s) = start {
                if s != 1 {
                    format!("ol:{}", s)
                } else {
                    "ol".into()
                }
            } else {
                "ol".into()
            };
            state.container_stack.push(container_name);
            let content = node["content"].as_array().cloned().unwrap_or_default();
            for child in &content {
                walk_block(child, state);
            }
            state.container_stack.pop();
        }
        "list_item" | "listItem" => {
            let stack_top = state.container_stack.last().cloned().unwrap_or_default();
            let is_ordered = stack_top == "ol" || stack_top.starts_with("ol:");
            let item_type = if is_ordered {
                "ordered-list-item"
            } else {
                "unordered-list-item"
            };
            let parents = state.container_stack.clone();
            open_pm_block(state, "list-item-marker", parents, None);
            state.container_stack.push(item_type.into());
            let content = node["content"].as_array().cloned().unwrap_or_default();
            for child in &content {
                walk_block(child, state);
            }
            state.container_stack.pop();
        }
        "horizontal_rule" | "horizontalRule" => {
            let parents = state.container_stack.clone();
            open_pm_block(state, "horizontal_rule", parents, None);
        }
        "image" => {
            let src = node["attrs"]["src"].as_str().unwrap_or("");
            let alt = node["attrs"]["alt"].as_str().unwrap_or("");
            let title = node["attrs"]["title"].as_str();
            let mut img_attrs = json!({ "src": src, "alt": alt });
            if let Some(t) = title {
                img_attrs["title"] = Value::String(t.into());
            }
            let parents = state.container_stack.clone();
            open_pm_block(state, "image", parents, Some(img_attrs));
            state.text.push_str(if alt.is_empty() { " " } else { alt });
        }
        _ => {
            // Unknown block: treat as paragraph
            let parents = state.container_stack.clone();
            open_pm_block(state, "paragraph", parents, None);
            let content = node["content"].as_array().cloned().unwrap_or_default();
            walk_inline(&content, state);
        }
    }
}

fn walk_inline(nodes: &[Value], state: &mut ImportState) {
    for node in nodes {
        let node_type = node["type"].as_str().unwrap_or("");
        match node_type {
            "text" => {
                let text = node["text"].as_str().unwrap_or("");
                if text.is_empty() {
                    continue;
                }
                let rel_start = state.text.len();
                state.text.push_str(text);
                let rel_end = state.text.len();
                let marks_arr = node["marks"].as_array().cloned().unwrap_or_default();
                let features: Vec<Value> = marks_arr
                    .iter()
                    .filter_map(|m| mark_to_feature(m))
                    .collect();
                if !features.is_empty() {
                    state.facets.push(json!({
                        "index": { "byteStart": rel_start, "byteEnd": rel_end },
                        "features": features,
                    }));
                }
            }
            "hard_break" | "hardBreak" => {
                let start = state.text.len();
                state.text.push('\n');
                let end = state.text.len();
                state.facets.push(json!({
                    "index": { "byteStart": start, "byteEnd": end },
                    "features": [{ "$type": TYPE_ID, "name": "hard_break" }],
                }));
            }
            "image" => {
                let src = node["attrs"]["src"].as_str().unwrap_or("");
                let alt = node["attrs"]["alt"].as_str().unwrap_or("");
                let title = node["attrs"]["title"].as_str();
                let start = state.text.len();
                state.text.push_str(if alt.is_empty() { " " } else { alt });
                let end = state.text.len();
                let mut img_feature =
                    json!({ "$type": TYPE_ID, "name": "image", "src": src, "alt": alt });
                if let Some(t) = title {
                    img_feature["title"] = Value::String(t.into());
                }
                state.facets.push(json!({
                    "index": { "byteStart": start, "byteEnd": end },
                    "features": [img_feature],
                }));
            }
            _ => {}
        }
    }
}

fn mark_to_feature(mark: &Value) -> Option<Value> {
    let mark_type = mark["type"].as_str()?;
    match mark_type {
        "bold" | "strong" => Some(json!({ "$type": TYPE_ID, "name": "bold" })),
        "italic" | "em" => Some(json!({ "$type": TYPE_ID, "name": "italic" })),
        "underline" => Some(json!({ "$type": TYPE_ID, "name": "underline" })),
        "strike" | "strikethrough" => Some(json!({ "$type": TYPE_ID, "name": "strike" })),
        "code" => Some(json!({ "$type": TYPE_ID, "name": "code" })),
        "superscript" => Some(json!({ "$type": TYPE_ID, "name": "superscript" })),
        "subscript" => Some(json!({ "$type": TYPE_ID, "name": "subscript" })),
        "link" => {
            let href = mark["attrs"]["href"].as_str().unwrap_or("");
            let title = mark["attrs"]["title"].as_str();
            let mut feature = json!({ "$type": TYPE_ID, "name": "link", "href": href });
            if let Some(t) = title {
                feature["title"] = Value::String(t.into());
            }
            Some(feature)
        }
        _ => None,
    }
}

// ─── Export: DocumentJSON → ProseMirror JSON ──────────────────────────────────

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => {
            return json!({"type": "doc", "content": []}).to_string();
        }
    };

    let nodes = build_hir_from_doc(&doc, registry());
    let content = hir_nodes_to_pm(&nodes);
    json!({ "type": "doc", "content": content }).to_string()
}

fn hir_nodes_to_pm(nodes: &[HirNode]) -> Vec<Value> {
    let mut result = Vec::new();
    for node in nodes {
        result.extend(hir_node_to_pm(node));
    }
    result
}

fn hir_node_to_pm(node: &HirNode) -> Vec<Value> {
    match node {
        HirNode::Text { content, marks } => text_node_to_pm(content, marks),
        HirNode::Container { name, children, .. } => {
            if let Some(pm) = container_to_pm(name, children) {
                vec![pm]
            } else {
                vec![]
            }
        }
        HirNode::Block {
            name,
            attrs,
            children,
        } => {
            if let Some(pm) = block_to_pm(name, attrs, children) {
                vec![pm]
            } else {
                vec![]
            }
        }
    }
}

fn container_to_pm(name: &str, children: &[HirNode]) -> Option<Value> {
    match name {
        "ul" => {
            let items: Vec<Value> = children
                .iter()
                .filter_map(|c| {
                    if let HirNode::Container { name, children, .. } = c {
                        if name == "unordered-list-item" {
                            return Some(list_item_to_pm(children));
                        }
                    }
                    None
                })
                .collect();
            Some(json!({ "type": "bullet_list", "content": items }))
        }
        "ol" => {
            let items: Vec<Value> = children
                .iter()
                .filter_map(|c| {
                    if let HirNode::Container { name, children, .. } = c {
                        if name == "ordered-list-item" {
                            return Some(list_item_to_pm(children));
                        }
                    }
                    None
                })
                .collect();
            Some(json!({ "type": "ordered_list", "content": items }))
        }
        name if name.starts_with("ol:") => {
            let start: u64 = name[3..].parse().unwrap_or(1);
            let items: Vec<Value> = children
                .iter()
                .filter_map(|c| {
                    if let HirNode::Container { name, children, .. } = c {
                        if name == "ordered-list-item" {
                            return Some(list_item_to_pm(children));
                        }
                    }
                    None
                })
                .collect();
            Some(json!({ "type": "ordered_list", "attrs": { "start": start }, "content": items }))
        }
        "blockquote" => Some(json!({ "type": "blockquote", "content": hir_nodes_to_pm(children) })),
        "unordered-list-item" | "ordered-list-item" => Some(list_item_to_pm(children)),
        _ => None,
    }
}

fn list_item_to_pm(children: &[HirNode]) -> Value {
    let mut content = Vec::new();
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
                    "list-item-marker" | "bullet_list" | "ordered_list" | "blockquote-marker"
                ) {
                    continue;
                }
                if n == "list-item-text" || n == "paragraph" {
                    content.push(
                        json!({ "type": "paragraph", "content": inlines_to_pm(block_children) }),
                    );
                }
            }
            HirNode::Container {
                name,
                children: sub_children,
                ..
            } => {
                if let Some(pm) = container_to_pm(name, sub_children) {
                    content.push(pm);
                }
            }
            _ => {}
        }
    }
    json!({ "type": "list_item", "content": content })
}

fn block_to_pm(
    name: &str,
    attrs: &std::collections::HashMap<String, Value>,
    children: &[HirNode],
) -> Option<Value> {
    match name {
        "bullet_list" | "ordered_list" | "list-item-marker" | "blockquote-marker" => None,
        "paragraph" => Some(json!({ "type": "paragraph", "content": inlines_to_pm(children) })),
        "heading" => {
            let level = attrs.get("level").and_then(|v| v.as_u64()).unwrap_or(1);
            Some(
                json!({ "type": "heading", "attrs": { "level": level }, "content": inlines_to_pm(children) }),
            )
        }
        "code_block" => {
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
            // Strip trailing newline added during import
            let code = if text_content.ends_with('\n') {
                text_content[..text_content.len() - 1].to_owned()
            } else {
                text_content
            };
            let mut pm_node =
                json!({ "type": "code_block", "content": [{ "type": "text", "text": code }] });
            if let Some(lang) = attrs.get("language").and_then(|v| v.as_str()) {
                pm_node["attrs"] = json!({ "language": lang });
            }
            Some(pm_node)
        }
        "horizontal_rule" => Some(json!({ "type": "horizontal_rule" })),
        "image" => {
            let src = attrs.get("src").and_then(|v| v.as_str()).unwrap_or("");
            let alt = attrs.get("alt").and_then(|v| v.as_str()).unwrap_or("");
            let mut img_attrs = json!({ "src": src, "alt": alt });
            if let Some(title) = attrs.get("title").and_then(|v| v.as_str()) {
                img_attrs["title"] = Value::String(title.into());
            }
            Some(json!({ "type": "image", "attrs": img_attrs }))
        }
        _ => Some(json!({ "type": "paragraph", "content": inlines_to_pm(children) })),
    }
}

fn inlines_to_pm(nodes: &[HirNode]) -> Vec<Value> {
    let mut result = Vec::new();
    for node in nodes {
        if let HirNode::Text { content, marks } = node {
            result.extend(text_node_to_pm(content, marks));
        }
    }
    result
}

fn text_node_to_pm(content: &str, marks: &[MarkApplication]) -> Vec<Value> {
    // Check for hard-break
    if marks
        .iter()
        .any(|m| m.kind == "org.prosemirror.facet#hard_break")
    {
        return vec![json!({ "type": "hard_break" })];
    }
    // Check for inline image
    if let Some(img_mark) = marks
        .iter()
        .find(|m| m.kind == "org.prosemirror.facet#image")
    {
        let src = img_mark
            .attrs
            .get("src")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let alt = img_mark
            .attrs
            .get("alt")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let mut img_attrs = json!({ "src": src, "alt": alt });
        if let Some(title) = img_mark.attrs.get("title").and_then(|v| v.as_str()) {
            img_attrs["title"] = Value::String(title.into());
        }
        return vec![json!({ "type": "image", "attrs": img_attrs })];
    }
    let pm_marks: Vec<Value> = marks.iter().filter_map(|m| mark_to_pm_mark(m)).collect();
    let mut pm_node = json!({ "type": "text", "text": content });
    if !pm_marks.is_empty() {
        pm_node["marks"] = Value::Array(pm_marks);
    }
    vec![pm_node]
}

fn mark_to_pm_mark(mark: &MarkApplication) -> Option<Value> {
    match mark.kind.as_str() {
        "org.prosemirror.facet#bold" => Some(json!({ "type": "bold" })),
        "org.prosemirror.facet#italic" => Some(json!({ "type": "italic" })),
        "org.prosemirror.facet#underline" => Some(json!({ "type": "underline" })),
        "org.prosemirror.facet#strike" => Some(json!({ "type": "strike" })),
        "org.prosemirror.facet#code" => Some(json!({ "type": "code" })),
        "org.prosemirror.facet#superscript" => Some(json!({ "type": "superscript" })),
        "org.prosemirror.facet#subscript" => Some(json!({ "type": "subscript" })),
        "org.prosemirror.facet#link" => {
            let href = mark
                .attrs
                .get("href")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let mut pm_mark = json!({ "type": "link", "attrs": { "href": href } });
            if let Some(title) = mark.attrs.get("title").and_then(|v| v.as_str()) {
                pm_mark["attrs"]["title"] = Value::String(title.into());
            }
            Some(pm_mark)
        }
        _ => None,
    }
}
