//! Lexical JSON adapter: import and export for RelationalText documents.
//!
//! Format namespace: `io.lexical.facet`
//!
//! WASM interface:
//!   alloc / dealloc / result_len — memory boilerplate
//!   import(ptr, len) -> ptr     — Lexical JSON (in "text" field) → DocumentJSON
//!   export(ptr, len) -> ptr     — DocumentJSON (Lexical facets) → raw Lexical JSON
//!
//! Lexical uses a format bitmask on text nodes:
//!   1=bold, 2=italic, 4=strikethrough, 8=underline, 16=code, 32=subscript, 64=superscript

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::OnceLock;

const TYPE_ID: &str = "io.lexical.facet";

// ─── Lexicon registry ─────────────────────────────────────────────────────────

const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/io.lexical/lexical.lexicon.json");

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

// ─── Import: Lexical JSON → DocumentJSON ─────────────────────────────────────

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
    // Handle double-stringified input: unwrap if raw is a JSON string value
    let effective_input = match serde_json::from_str::<serde_json::Value>(raw) {
        Ok(serde_json::Value::String(s)) => s,
        _ => raw.to_string(),
    };
    let raw = effective_input.as_str();
    let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let lex_str = outer["text"].as_str().unwrap_or(raw);
    let lex_doc: Value = serde_json::from_str(lex_str).unwrap_or(Value::Null);

    let mut state = ImportState::new();
    let root_children = lex_doc["root"]["children"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    for child in &root_children {
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
        "paragraph" => {
            let parents = state.container_stack.clone();
            open_block(state, "paragraph", parents, None);
            let children = node["children"].as_array().cloned().unwrap_or_default();
            walk_inline(&children, state);
        }
        "heading" => {
            let tag = node["tag"]
                .as_str()
                .or_else(|| node["attrs"]["tag"].as_str())
                .unwrap_or("h1");
            let level: u64 = tag.trim_start_matches('h').parse().unwrap_or(1);
            let parents = state.container_stack.clone();
            open_block(state, "heading", parents, Some(json!({ "level": level })));
            let children = node["children"].as_array().cloned().unwrap_or_default();
            walk_inline(&children, state);
        }
        "list" => {
            let list_type = node["listType"]
                .as_str()
                .or_else(|| node["attrs"]["listType"].as_str())
                .unwrap_or("bullet");
            let start = node["start"]
                .as_u64()
                .or_else(|| node["attrs"]["start"].as_u64())
                .unwrap_or(1);
            let is_bullet = list_type == "bullet";
            let marker_name = if is_bullet {
                "bullet-list-marker"
            } else {
                "ordered-list-marker"
            };
            let parents = state.container_stack.clone();
            open_block(state, marker_name, parents, None);
            let container_name = if is_bullet {
                "ul".to_owned()
            } else if start != 1 {
                format!("ol:{}", start)
            } else {
                "ol".to_owned()
            };
            state.container_stack.push(container_name);
            let children = node["children"].as_array().cloned().unwrap_or_default();
            for child in &children {
                walk_block(child, state);
            }
            state.container_stack.pop();
        }
        "listitem" => {
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
            let children = node["children"].as_array().cloned().unwrap_or_default();
            // Separate inline children from nested list children
            let inline_children: Vec<Value> = children
                .iter()
                .filter(|c| c["type"].as_str() != Some("list"))
                .cloned()
                .collect();
            let nested_lists: Vec<Value> = children
                .iter()
                .filter(|c| c["type"].as_str() == Some("list"))
                .cloned()
                .collect();
            if !inline_children.is_empty() {
                let cur_parents = state.container_stack.clone();
                open_block(state, "list-item-text", cur_parents, None);
                walk_inline(&inline_children, state);
            }
            for nested in &nested_lists {
                walk_block(nested, state);
            }
            state.container_stack.pop();
        }
        "code" => {
            let lang = node["language"]
                .as_str()
                .or_else(|| node["attrs"]["language"].as_str());
            let attrs = lang.map(|l| json!({ "language": l }));
            let parents = state.container_stack.clone();
            open_block(state, "code-block", parents, attrs);
            let mut code = String::new();
            let children = node["children"].as_array().cloned().unwrap_or_default();
            for child in &children {
                if matches!(
                    child["type"].as_str(),
                    Some("text") | Some("code-highlight")
                ) {
                    if let Some(t) = child["text"].as_str() {
                        code.push_str(t);
                    }
                }
            }
            code.push('\n');
            state.text.push_str(&code);
        }
        "quote" => {
            let parents = state.container_stack.clone();
            open_block(state, "blockquote-marker", parents, None);
            state.container_stack.push("blockquote".to_owned());
            let cur_parents = state.container_stack.clone();
            open_block(state, "paragraph", cur_parents, None);
            let children = node["children"].as_array().cloned().unwrap_or_default();
            walk_inline(&children, state);
            state.container_stack.pop();
        }
        "youtube" => {
            let video_id = node["videoID"]
                .as_str()
                .or_else(|| node["attrs"]["videoID"].as_str())
                .unwrap_or("");
            let url = format!("https://www.youtube.com/embed/{}", video_id);
            let parents = state.container_stack.clone();
            open_block(
                state,
                "embed",
                parents,
                Some(json!({ "embedType": "youtube", "url": url })),
            );
        }
        "tweet" => {
            let tweet_id = node["id"]
                .as_str()
                .or_else(|| node["attrs"]["id"].as_str())
                .unwrap_or("");
            let url = format!("https://twitter.com/i/web/status/{}", tweet_id);
            let parents = state.container_stack.clone();
            open_block(
                state,
                "embed",
                parents,
                Some(json!({ "embedType": "tweet", "url": url })),
            );
        }
        "embedblock" => {
            let url = node["url"]
                .as_str()
                .or_else(|| node["attrs"]["url"].as_str())
                .unwrap_or("");
            let parents = state.container_stack.clone();
            open_block(
                state,
                "embed",
                parents,
                Some(json!({ "embedType": "iframe", "url": url })),
            );
        }
        "table" => {
            let rows = node["children"].as_array().cloned().unwrap_or_default();
            let mut header_row: Vec<Value> = Vec::new();
            let mut data_rows: Vec<Value> = Vec::new();
            for row in &rows {
                if row["type"].as_str() != Some("tablerow") {
                    continue;
                }
                let cells = row["children"].as_array().cloned().unwrap_or_default();
                let is_header = cells.iter().any(|c| {
                    let hs = c["headerState"]
                        .as_u64()
                        .or_else(|| c["attrs"]["headerState"].as_u64())
                        .unwrap_or(0);
                    hs == 1 || hs == 3
                });
                let cell_texts: Vec<Value> = cells
                    .iter()
                    .map(|c| {
                        let mut text = String::new();
                        for n in c["children"].as_array().iter().flat_map(|a| a.iter()) {
                            let children_to_scan: Vec<Value> =
                                if n["type"].as_str() == Some("paragraph") {
                                    n["children"].as_array().cloned().unwrap_or_default()
                                } else if n["type"].as_str() == Some("text") {
                                    vec![n.clone()]
                                } else {
                                    vec![]
                                };
                            for t in &children_to_scan {
                                if t["type"].as_str() == Some("text") {
                                    if let Some(s) = t["text"].as_str() {
                                        text.push_str(s);
                                    }
                                }
                            }
                        }
                        Value::String(text)
                    })
                    .collect();
                if is_header {
                    header_row.extend(cell_texts);
                } else {
                    data_rows.push(Value::Array(cell_texts));
                }
            }
            let parents = state.container_stack.clone();
            open_block(
                state,
                "table",
                parents,
                Some(json!({ "headers": header_row, "rows": data_rows })),
            );
        }
        _ => {
            let parents = state.container_stack.clone();
            open_block(state, "paragraph", parents, None);
            let children = node["children"].as_array().cloned().unwrap_or_default();
            walk_inline(&children, state);
        }
    }
}

/// Decode Lexical text format bitmask into feature names.
fn format_to_feature_names(format: u64) -> Vec<&'static str> {
    let mut names = Vec::new();
    if format & 1 != 0 {
        names.push("bold");
    }
    if format & 2 != 0 {
        names.push("italic");
    }
    if format & 4 != 0 {
        names.push("strikethrough");
    }
    if format & 8 != 0 {
        names.push("underline");
    }
    if format & 16 != 0 {
        names.push("code");
    }
    if format & 32 != 0 {
        names.push("subscript");
    }
    if format & 64 != 0 {
        names.push("superscript");
    }
    names
}

fn walk_inline(nodes: &[Value], state: &mut ImportState) {
    for node in nodes {
        match node["type"].as_str().unwrap_or("") {
            "text" => {
                let text = node["text"].as_str().unwrap_or("");
                if text.is_empty() {
                    continue;
                }
                let start = state.text.len();
                state.text.push_str(text);
                let end = state.text.len();
                let format = node["format"].as_u64().unwrap_or(0);
                if format != 0 {
                    let names = format_to_feature_names(format);
                    if !names.is_empty() {
                        let features: Vec<Value> = names
                            .iter()
                            .map(|n| json!({ "$type": TYPE_ID, "name": n }))
                            .collect();
                        state.facets.push(json!({
                            "index": { "byteStart": start, "byteEnd": end },
                            "features": features,
                        }));
                    }
                }
            }
            "linebreak" => {
                let start = state.text.len();
                state.text.push('\n');
                let end = state.text.len();
                state.facets.push(json!({
                    "index": { "byteStart": start, "byteEnd": end },
                    "features": [{ "$type": TYPE_ID, "name": "linebreak" }],
                }));
            }
            "link" | "autolink" => {
                let url = node["url"]
                    .as_str()
                    .or_else(|| node["attrs"]["url"].as_str())
                    .unwrap_or("");
                let children = node["children"].as_array().cloned().unwrap_or_default();
                for child in &children {
                    if child["type"].as_str() == Some("text") {
                        let text = child["text"].as_str().unwrap_or("");
                        if text.is_empty() {
                            continue;
                        }
                        let start = state.text.len();
                        state.text.push_str(text);
                        let end = state.text.len();
                        state.facets.push(json!({
                            "index": { "byteStart": start, "byteEnd": end },
                            "features": [{ "$type": TYPE_ID, "name": "link", "url": url }],
                        }));
                    }
                }
            }
            "code-highlight" => {
                if let Some(t) = node["text"].as_str() {
                    if !t.is_empty() {
                        state.text.push_str(t);
                    }
                }
            }
            _ => {
                if let Some(t) = node["text"].as_str() {
                    if !t.is_empty() {
                        state.text.push_str(t);
                    }
                }
            }
        }
    }
}

// ─── Export: DocumentJSON → Lexical JSON ─────────────────────────────────────

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => {
            let empty_root = json!({
                "root": { "type": "root", "children": [], "direction": "ltr", "format": "", "indent": 0, "version": 1 }
            });
            return empty_root.to_string();
        }
    };

    let nodes = build_hir_from_doc(&doc, registry());
    let children: Vec<Value> = nodes.iter().filter_map(|n| walk_hir_node(n)).collect();
    json!({
        "root": {
            "type": "root",
            "children": children,
            "direction": "ltr",
            "format": "",
            "indent": 0,
            "version": 1
        }
    })
    .to_string()
}

fn walk_hir_node(node: &HirNode) -> Option<Value> {
    match node {
        HirNode::Text { .. } => None,
        HirNode::Container { name, children, .. } => container_to_lexical(name, children),
        HirNode::Block {
            name,
            attrs,
            children,
        } => block_to_lexical(name, attrs, children),
    }
}

fn container_to_lexical(name: &str, children: &[HirNode]) -> Option<Value> {
    match name {
        "ul" => {
            let items = build_list_items(children, "bullet");
            Some(json!({
                "type": "list", "listType": "bullet", "start": 1,
                "children": items, "direction": "ltr", "format": "", "indent": 0, "version": 1
            }))
        }
        "ol" | _ if name.starts_with("ol:") => {
            let start: u64 = if name.starts_with("ol:") {
                name[3..].parse().unwrap_or(1)
            } else {
                1
            };
            let items = build_list_items(children, "number");
            Some(json!({
                "type": "list", "listType": "number", "start": start,
                "children": items, "direction": "ltr", "format": "", "indent": 0, "version": 1
            }))
        }
        "blockquote" => {
            let mut inline_nodes: Vec<Value> = Vec::new();
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
                    inline_nodes.extend(inlines_to_lexical(bc));
                }
            }
            Some(json!({
                "type": "quote", "children": inline_nodes,
                "direction": "ltr", "format": "", "indent": 0, "version": 1
            }))
        }
        _ => None,
    }
}

fn build_list_items(children: &[HirNode], _list_type: &str) -> Vec<Value> {
    let mut items = Vec::new();
    let mut item_index = 1usize;
    for child in children {
        match child {
            HirNode::Block { name, .. } if is_marker(name) => continue,
            HirNode::Container {
                name: cn,
                children: gc,
                ..
            } if cn == "unordered-list-item" || cn == "ordered-list-item" => {
                let mut item_children: Vec<Value> = Vec::new();
                for grandchild in gc.iter() {
                    match grandchild {
                        HirNode::Block { name: gn, .. } if is_marker(gn) => continue,
                        HirNode::Block {
                            name: gn,
                            children: gc2,
                            ..
                        } if gn == "list-item-text" || gn == "paragraph" => {
                            item_children.extend(inlines_to_lexical(gc2));
                        }
                        HirNode::Container {
                            name: gcn,
                            children: gc2,
                            ..
                        } => {
                            if let Some(nested) = container_to_lexical(gcn, gc2) {
                                item_children.push(nested);
                            }
                        }
                        _ => {}
                    }
                }
                items.push(json!({
                    "type": "listitem", "value": item_index,
                    "children": item_children, "direction": "ltr", "format": "", "indent": 0, "version": 1
                }));
                item_index += 1;
            }
            _ => {}
        }
    }
    items
}

fn block_to_lexical(
    name: &str,
    attrs: &HashMap<String, Value>,
    children: &[HirNode],
) -> Option<Value> {
    if is_marker(name) {
        return None;
    }
    match name {
        "paragraph" => Some(json!({
            "type": "paragraph", "children": inlines_to_lexical(children),
            "direction": "ltr", "format": "", "indent": 0, "version": 1
        })),
        "heading" => {
            let level = attrs.get("level").and_then(|v| v.as_u64()).unwrap_or(1);
            let tag = format!("h{}", level);
            Some(json!({
                "type": "heading", "tag": tag, "children": inlines_to_lexical(children),
                "direction": "ltr", "format": "", "indent": 0, "version": 1
            }))
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
            let lang = attrs.get("language").and_then(|v| v.as_str()).unwrap_or("");
            Some(json!({
                "type": "code",
                "language": lang,
                "children": [{ "type": "text", "text": code, "format": 0, "version": 1 }],
                "direction": "ltr", "format": "", "indent": 0, "version": 1
            }))
        }
        "horizontalrule" => Some(json!({ "type": "horizontalrule", "version": 1 })),
        "embed" => {
            let url = attrs.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let embed_type = attrs
                .get("embedType")
                .and_then(|v| v.as_str())
                .unwrap_or("iframe");
            let title = attrs.get("title").and_then(|v| v.as_str()).unwrap_or("");
            Some(
                json!({ "type": "relationaltext-embed", "url": url, "embedType": embed_type, "title": title, "version": 1 }),
            )
        }
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
                json!({
                    "type": "tablecell", "headerState": if is_header { 1 } else { 0 },
                    "colSpan": 1, "rowSpan": 1, "width": null, "backgroundColor": null,
                    "children": [{
                        "type": "paragraph",
                        "children": [{ "type": "text", "text": text, "format": 0, "version": 1 }],
                        "direction": "ltr", "format": "", "indent": 0, "version": 1, "textFormat": 0, "textStyle": ""
                    }],
                    "direction": "ltr", "format": "", "indent": 0, "version": 1
                })
            };
            let make_row = |cells: Vec<Value>| -> Value {
                json!({ "type": "tablerow", "children": cells, "direction": "ltr", "format": "", "indent": 0, "version": 1 })
            };
            let mut table_rows: Vec<Value> = Vec::new();
            if !headers.is_empty() {
                let cells: Vec<Value> = headers
                    .iter()
                    .map(|h| make_cell(h.as_str().unwrap_or(""), true))
                    .collect();
                table_rows.push(make_row(cells));
            }
            for row in &rows {
                if let Some(cells_arr) = row.as_array() {
                    let cells: Vec<Value> = cells_arr
                        .iter()
                        .map(|c| make_cell(c.as_str().unwrap_or(""), false))
                        .collect();
                    table_rows.push(make_row(cells));
                }
            }
            Some(json!({
                "type": "table", "children": table_rows, "colWidths": [],
                "direction": "ltr", "format": "", "indent": 0, "version": 1
            }))
        }
        _ => Some(json!({
            "type": "paragraph", "children": inlines_to_lexical(children),
            "direction": "ltr", "format": "", "indent": 0, "version": 1
        })),
    }
}

fn inlines_to_lexical(nodes: &[HirNode]) -> Vec<Value> {
    let mut result: Vec<Value> = Vec::new();
    for node in nodes {
        if let HirNode::Text { content, marks } = node {
            // Linebreak
            if marks
                .iter()
                .any(|m| m.kind == format!("{}#linebreak", TYPE_ID))
            {
                result.push(json!({ "type": "linebreak", "version": 1 }));
                continue;
            }
            // Link
            if let Some(link_mark) = marks.iter().find(|m| m.kind == format!("{}#link", TYPE_ID)) {
                let url = link_mark
                    .attrs
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                result.push(json!({
                    "type": "link", "url": url,
                    "children": [{ "type": "text", "text": content, "format": 0, "version": 1 }],
                    "direction": "ltr", "format": "", "indent": 0, "version": 1
                }));
                continue;
            }
            // Format bitmask
            let mut format: u64 = 0;
            for mark in marks {
                format |= mark_kind_to_bit(&mark.kind);
            }
            result.push(json!({ "type": "text", "text": content, "format": format, "version": 1 }));
        }
    }
    result
}

fn mark_kind_to_bit(kind: &str) -> u64 {
    match kind {
        "io.lexical.facet#bold" => 1,
        "io.lexical.facet#italic" => 2,
        "io.lexical.facet#strikethrough" => 4,
        "io.lexical.facet#underline" => 8,
        "io.lexical.facet#code" => 16,
        "io.lexical.facet#subscript" => 32,
        "io.lexical.facet#superscript" => 64,
        _ => 0,
    }
}

fn is_marker(name: &str) -> bool {
    matches!(
        name,
        "bullet-list-marker" | "ordered-list-marker" | "list-item-marker" | "blockquote-marker"
    )
}
