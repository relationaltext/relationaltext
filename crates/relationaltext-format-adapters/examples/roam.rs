//! Roam Research JSON format adapter: import (and basic export) for RelationalText documents.
//!
//! Format namespace: `com.roamresearch.facet`
//!
//! WASM interface:
//!   alloc / dealloc / result_len — memory boilerplate (from wasm-format-adapter)
//!   import(ptr, len) -> ptr     — Roam Research JSON (in "text" field) → DocumentJSON
//!   export(ptr, len) -> ptr     — DocumentJSON (Roam facets) → raw Roam Research JSON

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "com.roamresearch.facet";

// ─── Lexicon registry ─────────────────────────────────────────────────────────

const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/com.roamresearch/roam.lexicon.json");

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

// ─── Import: Roam Research JSON → DocumentJSON ────────────────────────────────

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
    // Input is DocumentJSON where text = Roam Research JSON string (array of pages)
    let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let roam_str = outer["text"].as_str().unwrap_or(raw);

    let pages: Value = serde_json::from_str(roam_str).unwrap_or(Value::Null);
    let empty = Vec::new();
    let pages_arr = pages.as_array().unwrap_or(&empty);

    let mut state = ImportState::new();

    for page in pages_arr {
        let title = page["title"].as_str().unwrap_or("");
        let uid = page["uid"].as_str();

        let mut page_attrs = json!({ "title": title });
        if let Some(u) = uid {
            page_attrs["uid"] = Value::String(u.to_owned());
        }
        open_block(&mut state, "page", page_attrs, vec![]);
        state.text.push_str(title);

        if let Some(children) = page["children"].as_array() {
            let mut sorted_children: Vec<&Value> = children.iter().collect();
            sorted_children.sort_by_key(|b| b["order"].as_u64().unwrap_or(0));
            walk_blocks(&sorted_children, &mut state, vec!["page".to_owned()]);
        }
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

fn open_block(state: &mut ImportState, name: &str, attrs: Value, parents: Vec<String>) {
    let marker_char = if state.text.is_empty() {
        '\u{FFFC}'
    } else {
        '\n'
    };
    let marker_start = state.text.len();
    state.text.push(marker_char);
    let marker_end = state.text.len();

    let has_attrs = attrs.as_object().map(|o| !o.is_empty()).unwrap_or(false);
    let mut feature = json!({
        "$type": TYPE_ID,
        "name": name,
        "parents": parents,
    });
    if has_attrs {
        feature["attrs"] = attrs;
    }
    state.facets.push(json!({
        "index": { "byteStart": marker_start, "byteEnd": marker_end },
        "features": [feature],
    }));
}

fn walk_blocks(blocks: &[&Value], state: &mut ImportState, parents: Vec<String>) {
    for block in blocks {
        let uid = block["uid"].as_str();
        let string = block["string"].as_str().unwrap_or("");

        let mut block_attrs = json!({});
        if let Some(u) = uid {
            block_attrs["uid"] = Value::String(u.to_owned());
        }

        open_block(state, "block", block_attrs, parents.clone());
        walk_inline(string, state);

        if let Some(children) = block["children"].as_array() {
            let mut sorted: Vec<&Value> = children.iter().collect();
            sorted.sort_by_key(|b| b["order"].as_u64().unwrap_or(0));
            let mut child_parents = parents.clone();
            child_parents.push("block".to_owned());
            walk_blocks(&sorted, state, child_parents);
        }
    }
}

/// Walk Roam inline markup and emit text + facets into state.
fn walk_inline(s: &str, state: &mut ImportState) {
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    let mut plain_start = 0;

    while i < chars.len() {
        // Bold: **text**
        if chars[i] == '*' && i + 1 < chars.len() && chars[i + 1] == '*' {
            flush_plain(&chars[plain_start..i], state);
            if let Some(end) = find_two_char(&chars, i + 2, '*', '*') {
                let content: String = chars[i + 2..end].iter().collect();
                emit_marked(&content, "bold", json!({}), state);
                i = end + 2;
                plain_start = i;
                continue;
            }
            plain_start = i;
        }
        // Italic: __text__
        if chars[i] == '_' && i + 1 < chars.len() && chars[i + 1] == '_' {
            flush_plain(&chars[plain_start..i], state);
            if let Some(end) = find_two_char(&chars, i + 2, '_', '_') {
                let content: String = chars[i + 2..end].iter().collect();
                emit_marked(&content, "italic", json!({}), state);
                i = end + 2;
                plain_start = i;
                continue;
            }
            plain_start = i;
        }
        // Highlight: ^^text^^
        if chars[i] == '^' && i + 1 < chars.len() && chars[i + 1] == '^' {
            flush_plain(&chars[plain_start..i], state);
            if let Some(end) = find_two_char(&chars, i + 2, '^', '^') {
                let content: String = chars[i + 2..end].iter().collect();
                emit_marked(&content, "highlight", json!({}), state);
                i = end + 2;
                plain_start = i;
                continue;
            }
            plain_start = i;
        }
        // Code: `text`
        if chars[i] == '`' {
            flush_plain(&chars[plain_start..i], state);
            if let Some(end) = find_char(&chars, i + 1, '`') {
                let content: String = chars[i + 1..end].iter().collect();
                emit_marked(&content, "code", json!({}), state);
                i = end + 1;
                plain_start = i;
                continue;
            }
            plain_start = i;
        }
        // Page ref: [[Page Name]]
        if chars[i] == '[' && i + 1 < chars.len() && chars[i + 1] == '[' {
            flush_plain(&chars[plain_start..i], state);
            if let Some(end) = find_two_char(&chars, i + 2, ']', ']') {
                let title: String = chars[i + 2..end].iter().collect();
                let start = state.text.len();
                state.text.push_str(&title);
                let finish = state.text.len();
                if start < finish {
                    state.facets.push(json!({
                        "index": { "byteStart": start, "byteEnd": finish },
                        "features": [{ "$type": TYPE_ID, "name": "page-ref", "title": title }],
                    }));
                }
                i = end + 2;
                plain_start = i;
                continue;
            }
            plain_start = i;
        }
        // Block ref: ((uid))
        if chars[i] == '(' && i + 1 < chars.len() && chars[i + 1] == '(' {
            flush_plain(&chars[plain_start..i], state);
            if let Some(end) = find_two_char(&chars, i + 2, ')', ')') {
                let uid: String = chars[i + 2..end].iter().collect();
                let display = format!("(({}))", &uid);
                let start = state.text.len();
                state.text.push_str(&display);
                let finish = state.text.len();
                if start < finish {
                    state.facets.push(json!({
                        "index": { "byteStart": start, "byteEnd": finish },
                        "features": [{ "$type": TYPE_ID, "name": "block-ref", "uid": uid }],
                    }));
                }
                i = end + 2;
                plain_start = i;
                continue;
            }
            plain_start = i;
        }
        // Hash-bracket tag: #[[tag with spaces]]
        if chars[i] == '#'
            && i + 1 < chars.len()
            && chars[i + 1] == '['
            && i + 2 < chars.len()
            && chars[i + 2] == '['
        {
            flush_plain(&chars[plain_start..i], state);
            if let Some(end) = find_two_char(&chars, i + 3, ']', ']') {
                let tag: String = chars[i + 3..end].iter().collect();
                let display = format!("#{}", tag);
                let start = state.text.len();
                state.text.push_str(&display);
                let finish = state.text.len();
                if start < finish {
                    state.facets.push(json!({
                        "index": { "byteStart": start, "byteEnd": finish },
                        "features": [{ "$type": TYPE_ID, "name": "tag", "tag": tag }],
                    }));
                }
                i = end + 2;
                plain_start = i;
                continue;
            }
            plain_start = i;
        }
        // Simple hash tag: #word
        if chars[i] == '#' && i + 1 < chars.len() && chars[i + 1].is_alphanumeric() {
            flush_plain(&chars[plain_start..i], state);
            let word_start = i + 1;
            let word_end = chars[word_start..]
                .iter()
                .take_while(|&&c| c.is_alphanumeric() || c == '_' || c == '-')
                .count()
                + word_start;
            let tag: String = chars[word_start..word_end].iter().collect();
            let display = format!("#{}", tag);
            let start = state.text.len();
            state.text.push_str(&display);
            let finish = state.text.len();
            if start < finish {
                state.facets.push(json!({
                    "index": { "byteStart": start, "byteEnd": finish },
                    "features": [{ "$type": TYPE_ID, "name": "tag", "tag": tag }],
                }));
            }
            i = word_end;
            plain_start = i;
            continue;
        }
        // Image: ![alt](url)
        if chars[i] == '!' && i + 1 < chars.len() && chars[i + 1] == '[' {
            flush_plain(&chars[plain_start..i], state);
            if let Some((alt, url, end_pos)) = parse_link_or_image(&chars, i + 1) {
                let display = if alt.is_empty() {
                    " ".to_owned()
                } else {
                    alt.clone()
                };
                let start = state.text.len();
                state.text.push_str(&display);
                let finish = state.text.len();
                let mut feat = json!({ "$type": TYPE_ID, "name": "image", "src": url });
                if !alt.is_empty() {
                    feat["alt"] = Value::String(alt);
                }
                state.facets.push(json!({
                    "index": { "byteStart": start, "byteEnd": finish },
                    "features": [feat],
                }));
                i = end_pos;
                plain_start = i;
                continue;
            }
            plain_start = i;
        }
        // Link: [text](url)
        if chars[i] == '[' {
            flush_plain(&chars[plain_start..i], state);
            if let Some(close_bracket) = find_char(&chars, i + 1, ']') {
                let link_text: String = chars[i + 1..close_bracket].iter().collect();
                let after = close_bracket + 1;
                if after < chars.len() && chars[after] == '(' {
                    if let Some(close_paren) = find_char(&chars, after + 1, ')') {
                        let url: String = chars[after + 1..close_paren].iter().collect();
                        let start = state.text.len();
                        state.text.push_str(&link_text);
                        let finish = state.text.len();
                        if start < finish {
                            state.facets.push(json!({
                                "index": { "byteStart": start, "byteEnd": finish },
                                "features": [{ "$type": TYPE_ID, "name": "link", "uri": url }],
                            }));
                        }
                        i = close_paren + 1;
                        plain_start = i;
                        continue;
                    }
                }
            }
            plain_start = i;
        }

        i += 1;
    }
    flush_plain(&chars[plain_start..], state);
}

fn flush_plain(chars: &[char], state: &mut ImportState) {
    if !chars.is_empty() {
        let s: String = chars.iter().collect();
        state.text.push_str(&s);
    }
}

fn emit_marked(content: &str, mark_name: &str, _extra: Value, state: &mut ImportState) {
    if content.is_empty() {
        return;
    }
    let start = state.text.len();
    state.text.push_str(content);
    let finish = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": start, "byteEnd": finish },
        "features": [{ "$type": TYPE_ID, "name": mark_name }],
    }));
}

fn find_char(chars: &[char], start: usize, target: char) -> Option<usize> {
    chars[start..]
        .iter()
        .position(|&c| c == target)
        .map(|p| p + start)
}

fn find_two_char(chars: &[char], start: usize, a: char, b: char) -> Option<usize> {
    let mut i = start;
    while i + 1 < chars.len() {
        if chars[i] == a && chars[i + 1] == b {
            return Some(i);
        }
        i += 1;
    }
    None
}

fn parse_link_or_image(chars: &[char], open_bracket: usize) -> Option<(String, String, usize)> {
    if open_bracket >= chars.len() || chars[open_bracket] != '[' {
        return None;
    }
    let close_bracket = find_char(chars, open_bracket + 1, ']')?;
    let alt: String = chars[open_bracket + 1..close_bracket].iter().collect();
    let after = close_bracket + 1;
    if after >= chars.len() || chars[after] != '(' {
        return None;
    }
    let close_paren = find_char(chars, after + 1, ')')?;
    let url: String = chars[after + 1..close_paren].iter().collect();
    Some((alt, url, close_paren + 1))
}

// ─── Export: DocumentJSON → Roam Research JSON ────────────────────────────────

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => return "[]".to_string(),
    };

    let nodes = build_hir_from_doc(&doc, registry());
    let pages = nodes_to_roam_pages(&nodes);
    serde_json::to_string(&pages).unwrap_or_else(|_| "[]".to_string())
}

/// Walk top-level HIR nodes and group them into Roam pages.
fn nodes_to_roam_pages(nodes: &[HirNode]) -> Vec<Value> {
    let mut pages: Vec<Value> = Vec::new();

    for node in nodes {
        match node {
            HirNode::Block { name, attrs, .. } if name == "page" => {
                let title = attrs.get("title").and_then(|v| v.as_str()).unwrap_or("");
                let mut page = json!({ "title": title });
                if let Some(uid) = attrs.get("uid").and_then(|v| v.as_str()) {
                    page["uid"] = Value::String(uid.to_owned());
                }
                // page block's children in HIR are text nodes (the title text)
                // The actual nested blocks live in Container children
                pages.push(page);
            }
            HirNode::Container { name, children, .. } if name == "page" => {
                // This is the container grouping all blocks under a page
                // Find the matching page entry and add children
                if let Some(last_page) = pages.last_mut() {
                    let blocks = hir_children_to_roam_blocks(children, 0);
                    if !blocks.is_empty() {
                        last_page["children"] = Value::Array(blocks);
                    }
                }
            }
            HirNode::Block {
                name,
                attrs,
                children,
            } if name == "block" => {
                // Top-level block (when no page parents) — create a synthetic page
                if pages.is_empty() {
                    pages.push(json!({ "title": "" }));
                }
                let block_string = render_roam_inline_children(children);
                let mut block = json!({ "string": block_string, "order": 0u64 });
                if let Some(uid) = attrs.get("uid").and_then(|v| v.as_str()) {
                    block["uid"] = Value::String(uid.to_owned());
                }
                let page = pages.last_mut().unwrap();
                if page["children"].is_null() {
                    page["children"] = Value::Array(Vec::new());
                }
                if let Some(arr) = page["children"].as_array_mut() {
                    block["order"] = Value::Number((arr.len() as u64).into());
                    arr.push(block);
                }
            }
            _ => {}
        }
    }

    pages
}

/// Convert HIR children (containers and blocks) to Roam block objects.
fn hir_children_to_roam_blocks(children: &[HirNode], base_order: u64) -> Vec<Value> {
    let mut blocks: Vec<Value> = Vec::new();
    let mut order = base_order;

    for child in children {
        match child {
            HirNode::Block {
                name,
                attrs,
                children: block_children,
            } if name == "block" => {
                let block_string = render_roam_inline_children(block_children);
                let mut block = json!({ "string": block_string, "order": order });
                if let Some(uid) = attrs.get("uid").and_then(|v| v.as_str()) {
                    block["uid"] = Value::String(uid.to_owned());
                }
                blocks.push(block);
                order += 1;
            }
            HirNode::Container {
                name,
                children: sub_children,
                ..
            } if name == "block" => {
                // Nested block container — its children are the sub-blocks
                let sub_blocks = hir_children_to_roam_blocks(sub_children, 0);
                // The container itself represents a block entry; we need to add the block
                // and attach its children
                if let Some(last) = blocks.last_mut() {
                    if !sub_blocks.is_empty() {
                        last["children"] = Value::Array(sub_blocks);
                    }
                }
            }
            _ => {}
        }
    }

    blocks
}

fn render_roam_inline_children(children: &[HirNode]) -> String {
    let mut out = String::new();
    for child in children {
        if let HirNode::Text { content, marks } = child {
            out.push_str(&render_roam_inline(content, marks));
        }
    }
    out
}

fn render_roam_inline(content: &str, marks: &[MarkApplication]) -> String {
    if marks.is_empty() {
        return content.to_owned();
    }
    let outer = &marks[0];
    let inner = render_roam_inline(content, &marks[1..]);
    match outer.kind.as_str() {
        "com.roamresearch.facet#bold" => format!("**{}**", inner),
        "com.roamresearch.facet#italic" => format!("__{}__", inner),
        "com.roamresearch.facet#highlight" => format!("^^{}^^", inner),
        "com.roamresearch.facet#code" => format!("`{}`", inner),
        "com.roamresearch.facet#page-ref" => {
            let title = outer
                .attrs
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or(inner.as_str());
            format!("[[{}]]", title)
        }
        "com.roamresearch.facet#block-ref" => {
            let uid = outer
                .attrs
                .get("uid")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("(({}))", uid)
        }
        "com.roamresearch.facet#tag" => {
            let tag = outer
                .attrs
                .get("tag")
                .and_then(|v| v.as_str())
                .unwrap_or(inner.as_str());
            format!("#{}", tag)
        }
        "com.roamresearch.facet#link" => {
            let uri = outer
                .attrs
                .get("uri")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("[{}]({})", inner, uri)
        }
        "com.roamresearch.facet#image" => {
            let src = outer
                .attrs
                .get("src")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let alt = outer
                .attrs
                .get("alt")
                .and_then(|v| v.as_str())
                .unwrap_or(inner.as_str());
            format!("![{}]({})", alt, src)
        }
        _ => inner,
    }
}
