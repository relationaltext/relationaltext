//! Threads / Instagram caption format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `com.threads.facet`
//! Inline: **bold**, _italic_, @mention, #hashtag, https?://... URLs
//! Block: paragraph (double-newline separated; single \n = soft break within paragraph)

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "com.threads.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/com.threads/threads.lexicon.json");

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

fn push_mention(state: &mut ImportState, handle: &str) {
    let display = format!("@{}", handle);
    let s = state.text.len();
    state.text.push_str(&display);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "mention", "handle": handle }],
    }));
}

fn push_hashtag(state: &mut ImportState, tag: &str) {
    let display = format!("#{}", tag);
    let s = state.text.len();
    state.text.push_str(&display);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "hashtag", "tag": tag }],
    }));
}

fn push_link(state: &mut ImportState, href: &str) {
    let s = state.text.len();
    state.text.push_str(href);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "link", "href": href }],
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

fn is_word_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

/// Scan one line of Threads inline markup.
fn scan_inline(line: &str, state: &mut ImportState) {
    let bytes = line.as_bytes();
    let len = bytes.len();
    let mut pos = 0;
    let mut plain_start = 0;

    macro_rules! flush {
        () => {
            state.text.push_str(&line[plain_start..pos]);
        };
    }

    while pos < len {
        let b = bytes[pos];

        // **bold**
        if b == b'*' && bytes.get(pos + 1) == Some(&b'*') {
            if let Some(close) = find_two(&line[pos + 2..], b'*', b'*') {
                let content = &line[pos + 2..pos + 2 + close];
                flush!();
                push_inline(state, content, "bold");
                pos = pos + 2 + close + 2;
                plain_start = pos;
                continue;
            }
        }

        // _italic_
        if b == b'_' {
            if let Some(close) = line[pos + 1..].as_bytes().iter().position(|&c| c == b'_') {
                let content = &line[pos + 1..pos + 1 + close];
                flush!();
                push_inline(state, content, "italic");
                pos = pos + 1 + close + 1;
                plain_start = pos;
                continue;
            }
        }

        // @mention
        if b == b'@' {
            let start = pos + 1;
            let end = start
                + bytes[start..]
                    .iter()
                    .take_while(|&&c| is_word_byte(c))
                    .count();
            if end > start {
                let handle = &line[start..end];
                flush!();
                push_mention(state, handle);
                pos = end;
                plain_start = pos;
                continue;
            }
        }

        // #hashtag
        if b == b'#' {
            let start = pos + 1;
            let end = start
                + bytes[start..]
                    .iter()
                    .take_while(|&&c| is_word_byte(c))
                    .count();
            if end > start {
                let tag = &line[start..end];
                flush!();
                push_hashtag(state, tag);
                pos = end;
                plain_start = pos;
                continue;
            }
        }

        // https?://... URL
        if b == b'h' && (line[pos..].starts_with("http://") || line[pos..].starts_with("https://"))
        {
            let rest = &line[pos..];
            // URL ends at whitespace or end of line
            let url_end = rest
                .find(|c: char| c.is_ascii_whitespace())
                .unwrap_or(rest.len());
            let url = &rest[..url_end];
            flush!();
            push_link(state, url);
            pos += url_end;
            plain_start = pos;
            continue;
        }

        pos += utf8_char_len(b);
    }

    state.text.push_str(&line[plain_start..]);
}

// ─── Import ────────────────────────────────────────────────────────────────────

fn do_import(raw: &str) -> String {
    let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let text = outer["text"].as_str().unwrap_or(raw);

    let mut state = ImportState::new();

    // Split on double newlines to get paragraphs
    for para in text.split("\n\n") {
        let para = para.trim_end_matches('\n');
        if para.is_empty() {
            continue;
        }
        open_block(&mut state, "paragraph", &[]);
        let para_lines: Vec<&str> = para.split('\n').collect();
        for (i, line) in para_lines.iter().enumerate() {
            scan_inline(line, &mut state);
            if i < para_lines.len() - 1 {
                state.text.push('\n');
            }
        }
    }

    if state.text.is_empty() {
        open_block(&mut state, "paragraph", &[]);
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

// ─── Export ────────────────────────────────────────────────────────────────────

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    match mark.kind.as_str() {
        "com.threads.facet#bold" => format!("**{}**", content),
        "com.threads.facet#italic" => format!("_{}_", content),
        "com.threads.facet#mention" => {
            let handle = mark
                .attrs
                .get("handle")
                .and_then(|v| v.as_str())
                .unwrap_or(content.trim_start_matches('@'));
            format!("@{}", handle)
        }
        "com.threads.facet#hashtag" => {
            let tag = mark
                .attrs
                .get("tag")
                .and_then(|v| v.as_str())
                .unwrap_or(content);
            format!("#{}", tag)
        }
        "com.threads.facet#link" => {
            let href = mark
                .attrs
                .get("href")
                .and_then(|v| v.as_str())
                .unwrap_or(content);
            href.to_owned()
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

fn render_node(node: &HirNode, parts: &mut Vec<String>) {
    match node {
        HirNode::Block { name, children, .. } => match name.as_str() {
            "paragraph" => {
                parts.push(render_inline(children));
            }
            _ => {
                let inner = render_inline(children);
                if !inner.is_empty() {
                    parts.push(inner);
                }
            }
        },
        HirNode::Container { children, .. } => {
            for child in children {
                render_node(child, parts);
            }
        }
        HirNode::Text { content, marks } => {
            let mut s = content.clone();
            for mark in marks.iter().rev() {
                s = apply_mark(&s, mark);
            }
            if !s.is_empty() {
                parts.push(s);
            }
        }
    }
}

fn do_export(doc_json: &str) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => return String::new(),
    };
    let nodes = build_hir_from_doc(&doc, registry());
    let mut parts: Vec<String> = Vec::new();
    for node in &nodes {
        render_node(node, &mut parts);
    }
    parts.join("\n\n")
}
