//! Apple News Format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `com.apple.news.facet`
//!
//! WASM interface:
//!   alloc / dealloc / result_len — memory boilerplate
//!   import(ptr, len) -> ptr     — ANF JSON (in "text" field) → DocumentJSON
//!   export(ptr, len) -> ptr     — DocumentJSON (ANF facets) → raw ANF article JSON

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::OnceLock;

const TYPE_ID: &str = "com.apple.news.facet";

// ─── Lexicon registry ─────────────────────────────────────────────────────────

const LEXICON_JSON: &[u8] =
    include_bytes!("../../../formats/com.apple.news/applenews.lexicon.json");

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

// ─── Offset conversion helpers ────────────────────────────────────────────────

/// Convert a Unicode code-point index in `text` to a UTF-8 byte offset.
/// ANF `rangeStart`/`rangeLength` are code-point counts.
fn cp_to_byte(text: &str, cp_idx: usize) -> usize {
    text.char_indices()
        .nth(cp_idx)
        .map(|(b, _)| b)
        .unwrap_or(text.len())
}

// ─── Import: ANF article JSON → DocumentJSON ──────────────────────────────────

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

fn open_block(state: &mut ImportState, name: &str) {
    let marker_char = if state.text.is_empty() {
        '\u{FFFC}'
    } else {
        '\n'
    };
    let marker_start = state.text.len();
    state.text.push(marker_char);
    let marker_end = state.text.len();

    // Always include `attrs: {}` so that lens `addAttrs` operations write into
    // the nested attrs object rather than the flat feature level.
    state.facets.push(json!({
        "index": { "byteStart": marker_start, "byteEnd": marker_end },
        "features": [{
            "$type": TYPE_ID,
            "name": name,
            "parents": [],
            "attrs": {}
        }],
    }));
}

fn normalize_role(role: &str) -> &str {
    if role == "heading" {
        "heading2"
    } else {
        role
    }
}

fn is_text_role(role: &str) -> bool {
    matches!(
        role,
        "body"
            | "title"
            | "intro"
            | "heading"
            | "heading1"
            | "heading2"
            | "heading3"
            | "heading4"
            | "heading5"
            | "heading6"
            | "quote"
            | "pullquote"
            | "aside"
            | "author"
            | "byline"
            | "caption"
            | "chapter"
            | "section"
    )
}

fn process_text_component(component: &Value, state: &mut ImportState) {
    let role_raw = component["role"].as_str().unwrap_or("body").to_lowercase();
    let role = normalize_role(&role_raw).to_owned();
    let text = component["text"].as_str().unwrap_or("");

    open_block(state, &role);

    if text.is_empty() {
        return;
    }

    let component_byte_base = state.text.len();
    state.text.push_str(text);

    // Process inlineTextStyles: bold, italic, underline, strikethrough
    if let Some(styles) = component["inlineTextStyles"].as_array() {
        for style in styles {
            let ts = &style["textStyle"];
            if ts.is_null() {
                continue;
            }
            let range_start = style["rangeStart"].as_u64().unwrap_or(0) as usize;
            let range_length = style["rangeLength"].as_u64().unwrap_or(0) as usize;
            if range_length == 0 {
                continue;
            }

            let local_byte_start = cp_to_byte(text, range_start);
            let local_byte_end = cp_to_byte(text, range_start + range_length);
            if local_byte_start >= local_byte_end {
                continue;
            }

            let abs_start = component_byte_base + local_byte_start;
            let abs_end = component_byte_base + local_byte_end;

            if ts["bold"].as_bool().unwrap_or(false) {
                state.facets.push(json!({
                    "index": { "byteStart": abs_start, "byteEnd": abs_end },
                    "features": [{ "$type": TYPE_ID, "name": "bold" }],
                }));
            }
            if ts["italic"].as_bool().unwrap_or(false) {
                state.facets.push(json!({
                    "index": { "byteStart": abs_start, "byteEnd": abs_end },
                    "features": [{ "$type": TYPE_ID, "name": "italic" }],
                }));
            }
            if ts["underline"].as_bool().unwrap_or(false) {
                state.facets.push(json!({
                    "index": { "byteStart": abs_start, "byteEnd": abs_end },
                    "features": [{ "$type": TYPE_ID, "name": "underline" }],
                }));
            }
            if ts["strikethrough"].as_bool().unwrap_or(false) {
                state.facets.push(json!({
                    "index": { "byteStart": abs_start, "byteEnd": abs_end },
                    "features": [{ "$type": TYPE_ID, "name": "strikethrough" }],
                }));
            }
        }
    }

    // Process additions: link type
    if let Some(additions) = component["additions"].as_array() {
        for addition in additions {
            if addition["type"].as_str() != Some("link") {
                continue;
            }
            let range_start = addition["rangeStart"].as_u64().unwrap_or(0) as usize;
            let range_length = addition["rangeLength"].as_u64().unwrap_or(0) as usize;
            if range_length == 0 {
                continue;
            }
            let url = addition["URL"].as_str().unwrap_or("");
            if url.is_empty() {
                continue;
            }

            let local_byte_start = cp_to_byte(text, range_start);
            let local_byte_end = cp_to_byte(text, range_start + range_length);
            if local_byte_start >= local_byte_end {
                continue;
            }

            let abs_start = component_byte_base + local_byte_start;
            let abs_end = component_byte_base + local_byte_end;

            state.facets.push(json!({
                "index": { "byteStart": abs_start, "byteEnd": abs_end },
                "features": [{ "$type": TYPE_ID, "name": "link", "URL": url }],
            }));
        }
    }
}

fn walk_components(components: &[Value], state: &mut ImportState) {
    for component in components {
        let role = component["role"].as_str().unwrap_or("").to_lowercase();

        // section/chapter: process text then recurse into child components
        if role == "section" || role == "chapter" {
            if component["text"].is_string() {
                process_text_component(component, state);
            }
            if let Some(children) = component["components"].as_array() {
                walk_components(children, state);
            }
            continue;
        }

        if !is_text_role(&role) {
            continue;
        }

        if component["text"].is_string() {
            process_text_component(component, state);
        }
    }
}

fn do_import(raw: &str) -> String {
    let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let anf_str = outer["text"].as_str().unwrap_or(raw);
    let article: Value = serde_json::from_str(anf_str).unwrap_or(Value::Null);

    let empty = Vec::new();
    let components = article["components"].as_array().unwrap_or(&empty);

    let mut state = ImportState::new();
    walk_components(components, &mut state);

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

// ─── Export: DocumentJSON → ANF article JSON ──────────────────────────────────

struct InlineRange {
    is_link: bool,
    range_start: usize,
    range_length: usize,
    bold: bool,
    italic: bool,
    underline: bool,
    strikethrough: bool,
    url: Option<String>,
}

fn collect_text_str(nodes: &[HirNode]) -> String {
    let mut out = String::new();
    for node in nodes {
        match node {
            HirNode::Text { content, .. } => out.push_str(content),
            HirNode::Block { children, .. } => out.push_str(&collect_text_str(children)),
            HirNode::Container { children, .. } => out.push_str(&collect_text_str(children)),
        }
    }
    out
}

fn collect_inline_ranges(nodes: &[HirNode], cp_pos: &mut usize) -> Vec<InlineRange> {
    let mut ranges = Vec::new();
    for node in nodes {
        match node {
            HirNode::Text { content, marks } => {
                let cp_len = content.chars().count();
                for mark in marks {
                    if let Some(r) = mark_to_range(mark, *cp_pos, cp_len) {
                        ranges.push(r);
                    }
                }
                *cp_pos += cp_len;
            }
            HirNode::Block { children, .. } | HirNode::Container { children, .. } => {
                ranges.extend(collect_inline_ranges(children, cp_pos));
            }
        }
    }
    ranges
}

fn mark_to_range(mark: &MarkApplication, cp_start: usize, cp_len: usize) -> Option<InlineRange> {
    if cp_len == 0 {
        return None;
    }
    match mark.kind.as_str() {
        "com.apple.news.facet#bold" => Some(InlineRange {
            is_link: false,
            range_start: cp_start,
            range_length: cp_len,
            bold: true,
            italic: false,
            underline: false,
            strikethrough: false,
            url: None,
        }),
        "com.apple.news.facet#italic" => Some(InlineRange {
            is_link: false,
            range_start: cp_start,
            range_length: cp_len,
            bold: false,
            italic: true,
            underline: false,
            strikethrough: false,
            url: None,
        }),
        "com.apple.news.facet#underline" => Some(InlineRange {
            is_link: false,
            range_start: cp_start,
            range_length: cp_len,
            bold: false,
            italic: false,
            underline: true,
            strikethrough: false,
            url: None,
        }),
        "com.apple.news.facet#strikethrough" => Some(InlineRange {
            is_link: false,
            range_start: cp_start,
            range_length: cp_len,
            bold: false,
            italic: false,
            underline: false,
            strikethrough: true,
            url: None,
        }),
        "com.apple.news.facet#link" => {
            let url = mark
                .attrs
                .get("URL")
                .or_else(|| mark.attrs.get("url"))
                .or_else(|| mark.attrs.get("uri"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_owned());
            url.map(|u| InlineRange {
                is_link: true,
                range_start: cp_start,
                range_length: cp_len,
                bold: false,
                italic: false,
                underline: false,
                strikethrough: false,
                url: Some(u),
            })
        }
        _ => None,
    }
}

fn merge_adjacent(mut ranges: Vec<InlineRange>) -> Vec<InlineRange> {
    if ranges.is_empty() {
        return ranges;
    }
    ranges.sort_by_key(|r| r.range_start);
    let mut out: Vec<InlineRange> = Vec::new();
    for r in ranges {
        if let Some(prev) = out.last_mut() {
            let prev_end = prev.range_start + prev.range_length;
            if r.range_start == prev_end
                && r.is_link == prev.is_link
                && r.bold == prev.bold
                && r.italic == prev.italic
                && r.underline == prev.underline
                && r.strikethrough == prev.strikethrough
                && r.url == prev.url
            {
                prev.range_length += r.range_length;
                continue;
            }
        }
        out.push(r);
    }
    out
}

fn render_block(
    name: &str,
    _attrs: &HashMap<String, Value>,
    children: &[HirNode],
) -> Option<Value> {
    if is_marker(name) {
        return None;
    }

    let component_text = collect_text_str(children);
    let mut cp_pos = 0usize;
    let ranges = merge_adjacent(collect_inline_ranges(children, &mut cp_pos));

    let mut component = json!({ "role": name, "text": component_text });

    let style_ranges: Vec<&InlineRange> = ranges.iter().filter(|r| !r.is_link).collect();
    let link_ranges: Vec<&InlineRange> = ranges.iter().filter(|r| r.is_link).collect();

    if !style_ranges.is_empty() {
        let styles: Vec<Value> = style_ranges
            .iter()
            .map(|r| {
                let mut ts = serde_json::Map::new();
                if r.bold {
                    ts.insert("bold".to_owned(), Value::Bool(true));
                }
                if r.italic {
                    ts.insert("italic".to_owned(), Value::Bool(true));
                }
                if r.underline {
                    ts.insert("underline".to_owned(), Value::Bool(true));
                }
                if r.strikethrough {
                    ts.insert("strikethrough".to_owned(), Value::Bool(true));
                }
                json!({
                    "rangeStart": r.range_start,
                    "rangeLength": r.range_length,
                    "textStyle": Value::Object(ts),
                })
            })
            .collect();
        component["inlineTextStyles"] = Value::Array(styles);
    }

    if !link_ranges.is_empty() {
        let additions: Vec<Value> = link_ranges
            .iter()
            .map(|r| {
                json!({
                    "type": "link",
                    "URL": r.url.as_deref().unwrap_or(""),
                    "rangeStart": r.range_start,
                    "rangeLength": r.range_length,
                })
            })
            .collect();
        component["additions"] = Value::Array(additions);
    }

    Some(component)
}

fn walk_hir_node(node: &HirNode, components: &mut Vec<Value>) {
    match node {
        HirNode::Block {
            name,
            attrs,
            children,
        } => {
            if let Some(comp) = render_block(name, attrs, children) {
                components.push(comp);
            }
        }
        HirNode::Container { children, .. } => {
            for child in children {
                walk_hir_node(child, components);
            }
        }
        HirNode::Text { content, .. } => {
            if !content.trim().is_empty() {
                components.push(json!({ "role": "body", "text": content }));
            }
        }
    }
}

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => return "{}".to_string(),
    };

    let nodes = build_hir_from_doc(&doc, registry());
    let mut components: Vec<Value> = Vec::new();
    for node in &nodes {
        walk_hir_node(node, &mut components);
    }

    json!({
        "version": "1.9",
        "language": "en",
        "layout": { "columns": 7, "width": 1024, "margin": 75, "gutter": 20 },
        "components": components,
    })
    .to_string()
}

fn is_marker(name: &str) -> bool {
    matches!(
        name,
        "blockquote-marker" | "bullet-list-marker" | "ordered-list-marker" | "list-item-marker"
    )
}
