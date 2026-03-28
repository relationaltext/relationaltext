//! TipTap JSON adapter: import and export for RelationalText documents.
//!
//! Format namespace: `dev.tiptap.facet`
//!
//! WASM interface:
//!   alloc / dealloc / result_len — memory boilerplate
//!   import(ptr, len) -> ptr     — TipTap JSON (in "text" field) → DocumentJSON
//!   export(ptr, len) -> ptr     — DocumentJSON (TipTap facets) → raw TipTap JSON

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "dev.tiptap.facet";

// ─── Lexicon registry ─────────────────────────────────────────────────────────

const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/dev.tiptap/tiptap.lexicon.json");

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

// ─── Import: TipTap JSON → DocumentJSON ──────────────────────────────────────

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
    let tt_str = outer["text"].as_str().unwrap_or(raw);
    let tt_doc: Value = serde_json::from_str(tt_str).unwrap_or(Value::Null);

    let mut state = ImportState::new();
    let content = tt_doc["content"].as_array().cloned().unwrap_or_default();
    for child in &content {
        walk_block(child, &mut state);
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
    let node_type = node["type"].as_str().unwrap_or("");
    match node_type {
        "doc" => {
            let content = node["content"].as_array().cloned().unwrap_or_default();
            for child in &content {
                walk_block(child, state);
            }
        }
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
        "heading" => {
            let level = node["attrs"]["level"].as_u64().unwrap_or(1);
            let parents = state.container_stack.clone();
            open_block(state, "heading", parents, Some(json!({ "level": level })));
            let content = node["content"].as_array().cloned().unwrap_or_default();
            walk_inline(&content, state);
        }
        "codeBlock" | "code_block" => {
            let lang = node["attrs"]["language"].as_str();
            let attrs = lang.map(|l| json!({ "language": l }));
            let parents = state.container_stack.clone();
            open_block(state, "codeBlock", parents, attrs);
            let mut code = String::new();
            let content = node["content"].as_array().cloned().unwrap_or_default();
            for child in &content {
                if child["type"].as_str() == Some("text") {
                    if let Some(t) = child["text"].as_str() {
                        code.push_str(t);
                    }
                }
            }
            state.text.push_str(&code);
            state.text.push('\n');
        }
        "blockquote" => {
            let parents = state.container_stack.clone();
            open_block(state, "blockquote-marker", parents, None);
            state.container_stack.push("blockquote".to_owned());
            let content = node["content"].as_array().cloned().unwrap_or_default();
            for child in &content {
                walk_block(child, state);
            }
            state.container_stack.pop();
        }
        "bulletList" | "bullet_list" => {
            let parents = state.container_stack.clone();
            open_block(state, "bullet-list-marker", parents, None);
            state.container_stack.push("ul".to_owned());
            let content = node["content"].as_array().cloned().unwrap_or_default();
            for child in &content {
                walk_block(child, state);
            }
            state.container_stack.pop();
        }
        "orderedList" | "ordered_list" => {
            let parents = state.container_stack.clone();
            open_block(state, "ordered-list-marker", parents, None);
            let start = node["attrs"]["start"].as_u64();
            let container_name = match start {
                Some(s) if s != 1 => format!("ol:{}", s),
                _ => "ol".to_owned(),
            };
            state.container_stack.push(container_name);
            let content = node["content"].as_array().cloned().unwrap_or_default();
            for child in &content {
                walk_block(child, state);
            }
            state.container_stack.pop();
        }
        "listItem" | "list_item" => {
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
                walk_block(child, state);
            }
            state.container_stack.pop();
        }
        "horizontalRule" | "horizontal_rule" => {
            let parents = state.container_stack.clone();
            open_block(state, "horizontalRule", parents, None);
        }
        "image" => {
            // Block-level image: wrap in paragraph, store as inline entity
            let src = node["attrs"]["src"].as_str().unwrap_or("");
            let alt = node["attrs"]["alt"].as_str().unwrap_or("");
            let title = node["attrs"]["title"].as_str();
            let parents = state.container_stack.clone();
            open_block(state, "paragraph", parents, None);
            let img_start = state.text.len();
            if !alt.is_empty() {
                state.text.push_str(alt);
            } else {
                state.text.push('\u{200B}');
            }
            let img_end = state.text.len();
            let mut img_feature =
                json!({ "$type": TYPE_ID, "name": "image", "src": src, "alt": alt });
            if let Some(t) = title {
                img_feature["title"] = Value::String(t.to_owned());
            }
            state.facets.push(json!({
                "index": { "byteStart": img_start, "byteEnd": img_end },
                "features": [img_feature],
            }));
        }
        "table" => {
            let rows = node["content"].as_array().cloned().unwrap_or_default();
            let mut headers: Vec<Value> = Vec::new();
            let mut data_rows: Vec<Value> = Vec::new();
            for row in &rows {
                if row["type"].as_str() != Some("tableRow") {
                    continue;
                }
                let cells = row["content"].as_array().cloned().unwrap_or_default();
                let is_header = cells
                    .iter()
                    .any(|c| c["type"].as_str() == Some("tableHeader"));
                let cell_texts: Vec<Value> = cells
                    .iter()
                    .map(|c| {
                        let mut text = String::new();
                        for p in c["content"].as_array().iter().flat_map(|a| a.iter()) {
                            if p["type"].as_str() == Some("paragraph") {
                                for t in p["content"].as_array().iter().flat_map(|a| a.iter()) {
                                    if t["type"].as_str() == Some("text") {
                                        if let Some(s) = t["text"].as_str() {
                                            text.push_str(s);
                                        }
                                    }
                                }
                            }
                        }
                        Value::String(text)
                    })
                    .collect();
                if is_header {
                    headers.extend(cell_texts);
                } else {
                    data_rows.push(Value::Array(cell_texts));
                }
            }
            let parents = state.container_stack.clone();
            open_block(
                state,
                "table",
                parents,
                Some(json!({ "headers": headers, "rows": data_rows })),
            );
        }
        _ => {
            // Unknown: treat as paragraph
            let parents = state.container_stack.clone();
            open_block(state, "paragraph", parents, None);
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
                let start = state.text.len();
                state.text.push_str(text);
                let end = state.text.len();
                let marks = node["marks"].as_array().cloned().unwrap_or_default();
                let features: Vec<Value> =
                    marks.iter().filter_map(|m| mark_to_feature(m)).collect();
                if !features.is_empty() {
                    state.facets.push(json!({
                        "index": { "byteStart": start, "byteEnd": end },
                        "features": features,
                    }));
                }
            }
            "hardBreak" | "hard_break" => {
                let start = state.text.len();
                state.text.push('\n');
                let end = state.text.len();
                state.facets.push(json!({
                    "index": { "byteStart": start, "byteEnd": end },
                    "features": [{ "$type": TYPE_ID, "name": "hardBreak" }],
                }));
            }
            "image" => {
                let src = node["attrs"]["src"].as_str().unwrap_or("");
                let alt = node["attrs"]["alt"].as_str().unwrap_or("");
                let title = node["attrs"]["title"].as_str();
                let start = state.text.len();
                if !alt.is_empty() {
                    state.text.push_str(alt);
                } else {
                    state.text.push(' ');
                }
                let end = state.text.len();
                let mut feat = json!({ "$type": TYPE_ID, "name": "image", "src": src, "alt": alt });
                if let Some(t) = title {
                    feat["title"] = Value::String(t.to_owned());
                }
                state.facets.push(json!({
                    "index": { "byteStart": start, "byteEnd": end },
                    "features": [feat],
                }));
            }
            _ => {}
        }
    }
}

fn mark_to_feature(mark: &Value) -> Option<Value> {
    match mark["type"].as_str()? {
        "bold" => Some(json!({ "$type": TYPE_ID, "name": "bold" })),
        "italic" => Some(json!({ "$type": TYPE_ID, "name": "italic" })),
        "underline" => Some(json!({ "$type": TYPE_ID, "name": "underline" })),
        "strike" | "strikethrough" => Some(json!({ "$type": TYPE_ID, "name": "strike" })),
        "code" => Some(json!({ "$type": TYPE_ID, "name": "code" })),
        "superscript" => Some(json!({ "$type": TYPE_ID, "name": "superscript" })),
        "subscript" => Some(json!({ "$type": TYPE_ID, "name": "subscript" })),
        "link" => {
            let href = mark["attrs"]["href"].as_str().unwrap_or("");
            let mut feat = json!({ "$type": TYPE_ID, "name": "link", "href": href });
            if let Some(t) = mark["attrs"]["title"].as_str() {
                feat["title"] = Value::String(t.to_owned());
            }
            Some(feat)
        }
        _ => None,
    }
}

// ─── Export: DocumentJSON → TipTap JSON ──────────────────────────────────────

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => return json!({ "type": "doc", "content": [] }).to_string(),
    };

    let nodes = build_hir_from_doc(&doc, registry());
    let content = walk_hir_nodes(&nodes);
    json!({ "type": "doc", "content": content }).to_string()
}

fn walk_hir_nodes(nodes: &[HirNode]) -> Vec<Value> {
    nodes.iter().flat_map(|n| walk_hir_node(n)).collect()
}

fn walk_hir_node(node: &HirNode) -> Vec<Value> {
    match node {
        HirNode::Text { content, marks } => text_node_to_tiptap(content, marks),
        HirNode::Container { name, children, .. } => {
            if let Some(v) = container_to_tiptap(name, children) {
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
            if let Some(v) = block_to_tiptap(name, attrs, children) {
                vec![v]
            } else {
                vec![]
            }
        }
    }
}

fn container_to_tiptap(name: &str, children: &[HirNode]) -> Option<Value> {
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
                            return Some(list_item_to_tiptap(gc));
                        }
                    }
                    None
                })
                .collect();
            Some(json!({ "type": "bulletList", "content": items }))
        }
        name if name == "ol" || name.starts_with("ol:") => {
            let start: u64 = if name.starts_with("ol:") {
                name[3..].parse().unwrap_or(1)
            } else {
                1
            };
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
                            return Some(list_item_to_tiptap(gc));
                        }
                    }
                    None
                })
                .collect();
            let mut node = json!({ "type": "orderedList", "content": items });
            if start != 1 {
                node["attrs"] = json!({ "start": start });
            }
            Some(node)
        }
        "blockquote" => Some(json!({ "type": "blockquote", "content": walk_hir_nodes(children) })),
        "unordered-list-item" | "ordered-list-item" => Some(list_item_to_tiptap(children)),
        _ => None,
    }
}

fn list_item_to_tiptap(children: &[HirNode]) -> Value {
    let mut content: Vec<Value> = Vec::new();
    for child in children {
        match child {
            HirNode::Block {
                name, children: bc, ..
            } if is_marker(name) => {}
            HirNode::Block {
                name, children: bc, ..
            } if name == "list-item-text" || name == "paragraph" => {
                content.push(json!({ "type": "paragraph", "content": inlines_to_tiptap(bc) }));
            }
            HirNode::Container {
                name, children: gc, ..
            } => {
                if let Some(v) = container_to_tiptap(name, gc) {
                    content.push(v);
                }
            }
            _ => {}
        }
    }
    json!({ "type": "listItem", "content": content })
}

fn block_to_tiptap(
    name: &str,
    attrs: &std::collections::HashMap<String, Value>,
    children: &[HirNode],
) -> Option<Value> {
    if is_marker(name) {
        return None;
    }
    match name {
        "paragraph" => Some(json!({ "type": "paragraph", "content": inlines_to_tiptap(children) })),
        "heading" => {
            let level = attrs.get("level").and_then(|v| v.as_u64()).unwrap_or(1);
            Some(
                json!({ "type": "heading", "attrs": { "level": level }, "content": inlines_to_tiptap(children) }),
            )
        }
        "codeBlock" => {
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
            let mut node =
                json!({ "type": "codeBlock", "content": [{ "type": "text", "text": code }] });
            if let Some(lang) = attrs.get("language").and_then(|v| v.as_str()) {
                node["attrs"] = json!({ "language": lang });
            }
            Some(node)
        }
        "horizontalRule" => Some(json!({ "type": "horizontalRule" })),
        "table" => {
            let headers = attrs
                .get("headers")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let rows = attrs
                .get("rows")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let make_cell = |text: &str, is_header: bool| -> Value {
                let cell_type = if is_header {
                    "tableHeader"
                } else {
                    "tableCell"
                };
                let para_content = if text.is_empty() {
                    vec![]
                } else {
                    vec![json!({ "type": "text", "text": text })]
                };
                json!({
                    "type": cell_type,
                    "attrs": { "colspan": 1, "rowspan": 1, "colwidth": null, "style": null },
                    "content": [{ "type": "paragraph", "content": para_content }]
                })
            };
            let mut tt_rows: Vec<Value> = Vec::new();
            if !headers.is_empty() {
                let cells: Vec<Value> = headers
                    .iter()
                    .map(|h| make_cell(h.as_str().unwrap_or(""), true))
                    .collect();
                tt_rows.push(json!({ "type": "tableRow", "content": cells }));
            }
            for row in &rows {
                if let Some(cells_arr) = row.as_array() {
                    let cells: Vec<Value> = cells_arr
                        .iter()
                        .map(|c| make_cell(c.as_str().unwrap_or(""), false))
                        .collect();
                    tt_rows.push(json!({ "type": "tableRow", "content": cells }));
                }
            }
            Some(json!({ "type": "table", "content": tt_rows }))
        }
        _ => Some(json!({ "type": "paragraph", "content": inlines_to_tiptap(children) })),
    }
}

fn inlines_to_tiptap(nodes: &[HirNode]) -> Vec<Value> {
    nodes
        .iter()
        .flat_map(|n| {
            if let HirNode::Text { content, marks } = n {
                text_node_to_tiptap(content, marks)
            } else {
                vec![]
            }
        })
        .collect()
}

fn text_node_to_tiptap(content: &str, marks: &[MarkApplication]) -> Vec<Value> {
    // Check for special entity marks
    if marks
        .iter()
        .any(|m| m.kind == format!("{}#hardBreak", TYPE_ID))
    {
        return vec![json!({ "type": "hardBreak" })];
    }
    if let Some(img) = marks
        .iter()
        .find(|m| m.kind == format!("{}#image", TYPE_ID))
    {
        let src = img.attrs.get("src").and_then(|v| v.as_str()).unwrap_or("");
        let alt = img.attrs.get("alt").and_then(|v| v.as_str()).unwrap_or("");
        let mut node = json!({ "type": "image", "attrs": { "src": src, "alt": alt } });
        if let Some(t) = img.attrs.get("title").and_then(|v| v.as_str()) {
            node["attrs"]["title"] = Value::String(t.to_owned());
        }
        return vec![node];
    }

    let tt_marks: Vec<Value> = marks
        .iter()
        .filter_map(|m| mark_to_tiptap_mark(m))
        .collect();
    let mut node = json!({ "type": "text", "text": content });
    if !tt_marks.is_empty() {
        node["marks"] = Value::Array(tt_marks);
    }
    vec![node]
}

fn mark_to_tiptap_mark(mark: &MarkApplication) -> Option<Value> {
    match mark.kind.as_str() {
        "dev.tiptap.facet#bold" => Some(json!({ "type": "bold" })),
        "dev.tiptap.facet#italic" => Some(json!({ "type": "italic" })),
        "dev.tiptap.facet#underline" => Some(json!({ "type": "underline" })),
        "dev.tiptap.facet#strike" => Some(json!({ "type": "strike" })),
        "dev.tiptap.facet#code" => Some(json!({ "type": "code" })),
        "dev.tiptap.facet#superscript" => Some(json!({ "type": "superscript" })),
        "dev.tiptap.facet#subscript" => Some(json!({ "type": "subscript" })),
        "dev.tiptap.facet#link" => {
            let href = mark
                .attrs
                .get("href")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let mut m = json!({ "type": "link", "attrs": { "href": href } });
            if let Some(t) = mark.attrs.get("title").and_then(|v| v.as_str()) {
                m["attrs"]["title"] = Value::String(t.to_owned());
            }
            Some(m)
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
