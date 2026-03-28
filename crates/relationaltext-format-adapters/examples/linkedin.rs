//! LinkedIn post format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `com.linkedin.facet`
//! Inline: **bold**, *italic*, _italic_, @[Name](urn) mentions, @word, #hashtag
//! Block: paragraph (blank-line separated), bullet list, ordered list

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "com.linkedin.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/com.linkedin/linkedin.lexicon.json");

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn utf8_char_len(b: u8) -> usize {
    if b < 0x80 {
        1
    } else if b < 0xE0 {
        2
    } else if b < 0xF0 {
        3
    } else {
        4
    }
}

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

fn open_block(state: &mut ImportState, name: &str, parents: &[&str]) {
    let marker = if state.text.is_empty() {
        '\u{FFFC}'
    } else {
        '\n'
    };
    let s = state.text.len();
    state.text.push(marker);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": name, "parents": parents, "attrs": {} }],
    }));
}

fn push_inline(state: &mut ImportState, content: &str, name: &str) {
    if content.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(content);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": name }],
    }));
}

fn push_mention(state: &mut ImportState, display: &str, person_name: &str, urn: &str) {
    if display.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(display);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "mention", "personName": person_name, "urn": urn }],
    }));
}

fn push_hashtag(state: &mut ImportState, tag: &str) {
    if tag.is_empty() {
        return;
    }
    let display = format!("#{}", tag);
    let s = state.text.len();
    state.text.push_str(&display);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "hashtag", "tag": tag }],
    }));
}

fn find_two(text: &str, a: u8, b: u8) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == a && bytes[i + 1] == b {
            return Some(i);
        }
        i += utf8_char_len(bytes[i]);
    }
    None
}

fn find_single_not_double(text: &str, delim: u8) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == delim && bytes.get(i + 1) != Some(&delim) {
            return Some(i);
        }
        i += utf8_char_len(bytes[i]);
    }
    None
}

/// Check if byte is a word character (alphanumeric or underscore).
fn is_word_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

/// Scan inline LinkedIn markup and append to state.
/// Handles: **bold**, *italic*, _italic_, @[Name](urn), @word, #tag
fn scan_inline(text: &str, state: &mut ImportState) {
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut pos = 0;
    let mut plain_start = 0;

    macro_rules! flush {
        () => {
            state.text.push_str(&text[plain_start..pos]);
        };
    }

    while pos < len {
        let b = bytes[pos];

        // **bold**
        if b == b'*' && bytes.get(pos + 1) == Some(&b'*') {
            if let Some(close) = find_two(&text[pos + 2..], b'*', b'*') {
                let content = &text[pos + 2..pos + 2 + close];
                flush!();
                push_inline(state, content, "bold");
                pos = pos + 2 + close + 2;
                plain_start = pos;
                continue;
            }
        }

        // *italic*
        if b == b'*' {
            if let Some(close) = find_single_not_double(&text[pos + 1..], b'*') {
                let content = &text[pos + 1..pos + 1 + close];
                flush!();
                push_inline(state, content, "italic");
                pos = pos + 1 + close + 1;
                plain_start = pos;
                continue;
            }
        }

        // _italic_
        if b == b'_' {
            if let Some(close) = text[pos + 1..].as_bytes().iter().position(|&c| c == b'_') {
                let content = &text[pos + 1..pos + 1 + close];
                flush!();
                push_inline(state, content, "italic");
                pos = pos + 1 + close + 1;
                plain_start = pos;
                continue;
            }
        }

        // @[Name](urn) or @word
        if b == b'@' {
            if bytes.get(pos + 1) == Some(&b'[') {
                // @[Name](urn)
                if let Some(bracket_close) = text[pos + 2..].find(']') {
                    let name = &text[pos + 2..pos + 2 + bracket_close];
                    let after = &text[pos + 2 + bracket_close + 1..];
                    if after.starts_with('(') {
                        if let Some(paren_close) = after[1..].find(')') {
                            let urn = &after[1..1 + paren_close];
                            let consumed = 1 + 1 + bracket_close + 1 + 1 + paren_close + 1;
                            flush!();
                            push_mention(state, name, name, urn);
                            pos += consumed;
                            plain_start = pos;
                            continue;
                        }
                    }
                }
            }
            // @word (bare mention)
            let word_start = pos + 1;
            let word_end = word_start
                + bytes[word_start..]
                    .iter()
                    .take_while(|&&c| is_word_byte(c))
                    .count();
            if word_end > word_start {
                let word = &text[word_start..word_end];
                flush!();
                push_mention(state, word, word, "");
                pos = word_end;
                plain_start = pos;
                continue;
            }
        }

        // #hashtag
        if b == b'#' {
            let tag_start = pos + 1;
            let tag_end = tag_start
                + bytes[tag_start..]
                    .iter()
                    .take_while(|&&c| is_word_byte(c))
                    .count();
            if tag_end > tag_start {
                let tag = &text[tag_start..tag_end];
                flush!();
                push_hashtag(state, tag);
                pos = tag_end;
                plain_start = pos;
                continue;
            }
        }

        pos += utf8_char_len(b);
    }

    state.text.push_str(&text[plain_start..]);
}

// ─── Import ────────────────────────────────────────────────────────────────────

fn is_bullet(line: &str) -> bool {
    line.starts_with("- ") || line.starts_with("• ")
}

fn bullet_content(line: &str) -> &str {
    if line.starts_with("• ") {
        &line["• ".len()..]
    } else if line.starts_with("- ") {
        &line[2..]
    } else {
        line
    }
}

fn is_ordered(line: &str) -> bool {
    let dot_pos = line.find(". ").unwrap_or(0);
    dot_pos > 0 && line[..dot_pos].chars().all(|c| c.is_ascii_digit())
}

fn ordered_content(line: &str) -> &str {
    if let Some(i) = line.find(". ") {
        &line[i + 2..]
    } else {
        line
    }
}

fn do_import(raw: &str) -> String {
    let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let text = outer["text"].as_str().unwrap_or(raw);

    let mut state = ImportState::new();
    let lines: Vec<&str> = text.split('\n').collect();
    // 0=none, 1=bullet, 2=ordered
    let mut prev_list: u8 = 0;
    let mut para_lines: Vec<&str> = Vec::new();

    let flush_para = |state: &mut ImportState, para_lines: &mut Vec<&str>, prev_list: &mut u8| {
        if para_lines.is_empty() {
            return;
        }
        let content = para_lines.join("\n");
        open_block(state, "paragraph", &[]);
        scan_inline(&content, state);
        para_lines.clear();
        *prev_list = 0;
    };

    for line in &lines {
        // Blank line → flush paragraph
        if line.trim().is_empty() {
            flush_para(&mut state, &mut para_lines, &mut prev_list);
            continue;
        }

        // Bullet list
        if is_bullet(line) {
            flush_para(&mut state, &mut para_lines, &mut prev_list);
            let content = bullet_content(line);
            if prev_list != 1 {
                open_block(&mut state, "bullet-list-marker", &[]);
            }
            open_block(&mut state, "list-item-marker", &["ul"]);
            open_block(&mut state, "list-item-text", &["ul", "unordered-list-item"]);
            scan_inline(content, &mut state);
            prev_list = 1;
            continue;
        }

        // Ordered list
        if is_ordered(line) {
            flush_para(&mut state, &mut para_lines, &mut prev_list);
            if prev_list != 2 {
                open_block(&mut state, "ordered-list-marker", &[]);
            }
            open_block(&mut state, "list-item-marker", &["ol"]);
            open_block(&mut state, "list-item-text", &["ol", "ordered-list-item"]);
            scan_inline(ordered_content(line), &mut state);
            prev_list = 2;
            continue;
        }

        // Regular line — accumulate for paragraph
        prev_list = 0;
        para_lines.push(line);
    }

    flush_para(&mut state, &mut para_lines, &mut prev_list);

    if state.text.is_empty() {
        open_block(&mut state, "paragraph", &[]);
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

// ─── Export ────────────────────────────────────────────────────────────────────

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    match mark.kind.as_str() {
        "com.linkedin.facet#bold" => format!("**{}**", content),
        "com.linkedin.facet#italic" => format!("_{}_", content),
        "com.linkedin.facet#mention" => {
            let name = mark
                .attrs
                .get("personName")
                .and_then(|v| v.as_str())
                .unwrap_or(content);
            let urn = mark.attrs.get("urn").and_then(|v| v.as_str()).unwrap_or("");
            if urn.is_empty() {
                format!("@{}", name)
            } else {
                format!("@[{}]({})", name, urn)
            }
        }
        "com.linkedin.facet#hashtag" => {
            let tag = mark
                .attrs
                .get("tag")
                .and_then(|v| v.as_str())
                .unwrap_or(content);
            format!("#{}", tag)
        }
        _ => content.to_owned(),
    }
}

fn render_inline(nodes: &[HirNode]) -> String {
    let mut out = String::new();
    for node in nodes {
        match node {
            HirNode::Text { content, marks } => {
                let mut s = content.clone();
                for mark in marks.iter().rev() {
                    s = apply_mark(&s, mark);
                }
                out.push_str(&s);
            }
            HirNode::Block { children, .. } | HirNode::Container { children, .. } => {
                out.push_str(&render_inline(children));
            }
        }
    }
    out
}

fn render_node(
    node: &HirNode,
    out: &mut String,
    list_type: u8,
    ordered_idx: &mut usize,
    is_first: &mut bool,
) {
    match node {
        HirNode::Block { name, children, .. } => match name.as_str() {
            "bullet-list-marker" | "ordered-list-marker" | "list-item-marker" => {}
            "paragraph" => {
                let inner = render_inline(children);
                if !*is_first {
                    out.push('\n');
                }
                out.push_str(&inner);
                out.push('\n');
                *is_first = false;
            }
            "list-item-text" => {
                let inner = render_inline(children);
                if list_type == 2 {
                    out.push_str(&format!("{}. {}\n", ordered_idx, inner));
                    *ordered_idx += 1;
                } else {
                    out.push_str(&format!("• {}\n", inner));
                }
                *is_first = false;
            }
            _ => {
                let inner = render_inline(children);
                if !inner.is_empty() {
                    if !*is_first {
                        out.push('\n');
                    }
                    out.push_str(&inner);
                    out.push('\n');
                    *is_first = false;
                }
            }
        },
        HirNode::Container { name, children, .. } => {
            let lt = match name.as_str() {
                "ul" => 1,
                "ol" => 2,
                _ => list_type,
            };
            let mut idx = 1usize;
            for child in children {
                render_node(child, out, lt, &mut idx, is_first);
            }
        }
        HirNode::Text { content, marks } => {
            let mut s = content.clone();
            for mark in marks.iter().rev() {
                s = apply_mark(&s, mark);
            }
            out.push_str(&s);
        }
    }
}

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => return String::new(),
    };
    let nodes = build_hir_from_doc(&doc, registry());
    let mut out = String::new();
    let mut idx = 1usize;
    let mut is_first = true;
    for node in &nodes {
        render_node(node, &mut out, 0, &mut idx, &mut is_first);
    }
    if out.ends_with('\n') {
        out.pop();
    }
    out
}
