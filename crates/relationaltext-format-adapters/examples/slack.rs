//! Slack mrkdwn format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `com.slack.mrkdwn.facet`
//! Inline: *bold*, _italic_, ~strikethrough~, `code`, <url|text>, <url>
//! Block: paragraph, code-block, blockquote-marker, bullet-list-marker

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "com.slack.mrkdwn.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/com.slack.mrkdwn/slack.lexicon.json");

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

fn open_block_attrs(state: &mut ImportState, name: &str, parents: &[&str], attrs: Value) {
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
        "features": [{ "$type": TYPE_ID, "name": name, "parents": parents, "attrs": attrs }],
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

fn push_link(state: &mut ImportState, display: &str, url: &str) {
    if display.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(display);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "link", "url": url }],
    }));
}

/// Scan one line of Slack mrkdwn for inline markup.
fn scan_inline(line: &str, state: &mut ImportState) {
    let bytes = line.as_bytes();
    let len = bytes.len();
    let mut pos = 0;
    let mut plain_start = 0;

    while pos < len {
        let b = bytes[pos];

        // <url|display> or <url> or @user/#channel ref
        if b == b'<' {
            if let Some(rel) = line[pos + 1..].find('>') {
                let inner = &line[pos + 1..pos + 1 + rel];
                state.text.push_str(&line[plain_start..pos]);
                plain_start = pos + 1 + rel + 1;
                if let Some(pipe) = inner.find('|') {
                    push_link(state, &inner[pipe + 1..], &inner[..pipe]);
                } else if inner.starts_with('@') || inner.starts_with('#') {
                    state.text.push_str(inner);
                } else {
                    push_link(state, inner, inner);
                }
                pos = plain_start;
                continue;
            }
        }

        // *bold*
        if b == b'*' {
            if let Some(close) = line[pos + 1..].as_bytes().iter().position(|&c| c == b'*') {
                let content = &line[pos + 1..pos + 1 + close];
                state.text.push_str(&line[plain_start..pos]);
                plain_start = pos + 1 + close + 1;
                push_inline(state, content, "bold");
                pos = plain_start;
                continue;
            }
        }

        // _italic_
        if b == b'_' {
            if let Some(close) = line[pos + 1..].as_bytes().iter().position(|&c| c == b'_') {
                let content = &line[pos + 1..pos + 1 + close];
                state.text.push_str(&line[plain_start..pos]);
                plain_start = pos + 1 + close + 1;
                push_inline(state, content, "italic");
                pos = plain_start;
                continue;
            }
        }

        // ~strikethrough~
        if b == b'~' {
            if let Some(close) = line[pos + 1..].as_bytes().iter().position(|&c| c == b'~') {
                let content = &line[pos + 1..pos + 1 + close];
                state.text.push_str(&line[plain_start..pos]);
                plain_start = pos + 1 + close + 1;
                push_inline(state, content, "strikethrough");
                pos = plain_start;
                continue;
            }
        }

        // `code`
        if b == b'`' {
            if let Some(close) = line[pos + 1..].as_bytes().iter().position(|&c| c == b'`') {
                let content = &line[pos + 1..pos + 1 + close];
                state.text.push_str(&line[plain_start..pos]);
                plain_start = pos + 1 + close + 1;
                push_inline(state, content, "code");
                pos = plain_start;
                continue;
            }
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
    let lines: Vec<&str> = text.split('\n').collect();
    // 0=none, 1=bullet, 2=blockquote
    let mut prev: u8 = 0;
    let mut in_code = false;
    let mut code_lines: Vec<&str> = Vec::new();
    let mut code_lang: Option<&str> = None;

    for line in &lines {
        if line.starts_with("```") {
            if !in_code {
                in_code = true;
                code_lines.clear();
                let info = line[3..].trim();
                code_lang = if info.is_empty() { None } else { Some(info) };
                continue;
            } else if *line == "```" {
                in_code = false;
                let code = code_lines.join("\n") + "\n";
                let attrs = match code_lang {
                    Some(l) => json!({ "language": l }),
                    None => json!({}),
                };
                prev = 0;
                open_block_attrs(&mut state, "code-block", &[], attrs);
                state.text.push_str(&code);
                code_lines.clear();
                code_lang = None;
                continue;
            }
        }
        if in_code {
            code_lines.push(line);
            continue;
        }

        if line.starts_with("> ") {
            if prev != 2 {
                open_block(&mut state, "blockquote-marker", &[]);
            }
            open_block(&mut state, "paragraph", &["blockquote"]);
            scan_inline(&line[2..], &mut state);
            prev = 2;
        } else if line.starts_with("• ") || line.starts_with("- ") || line.starts_with("* ") {
            let pfx = if line.starts_with("• ") {
                "• ".len()
            } else {
                2
            };
            if prev != 1 {
                open_block(&mut state, "bullet-list-marker", &[]);
            }
            open_block(&mut state, "list-item-marker", &["ul"]);
            open_block(&mut state, "list-item-text", &["ul", "unordered-list-item"]);
            scan_inline(&line[pfx..], &mut state);
            prev = 1;
        } else if line.trim().is_empty() {
            prev = 0;
        } else {
            prev = 0;
            open_block(&mut state, "paragraph", &[]);
            scan_inline(line, &mut state);
        }
    }

    if in_code && !code_lines.is_empty() {
        let code = code_lines.join("\n") + "\n";
        let attrs = match code_lang {
            Some(l) => json!({ "language": l }),
            None => json!({}),
        };
        open_block_attrs(&mut state, "code-block", &[], attrs);
        state.text.push_str(&code);
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

// ─── Export ────────────────────────────────────────────────────────────────────

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    match mark.kind.as_str() {
        "com.slack.mrkdwn.facet#bold" => format!("*{}*", content),
        "com.slack.mrkdwn.facet#italic" => format!("_{}_", content),
        "com.slack.mrkdwn.facet#strikethrough" => format!("~{}~", content),
        "com.slack.mrkdwn.facet#code" => format!("`{}`", content),
        "com.slack.mrkdwn.facet#link" => {
            let url = mark
                .attrs
                .get("url")
                .or_else(|| mark.attrs.get("uri"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if content == url {
                format!("<{}>", url)
            } else {
                format!("<{}|{}>", url, content)
            }
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

fn collect_text(nodes: &[HirNode]) -> String {
    let mut out = String::new();
    for node in nodes {
        match node {
            HirNode::Text { content, .. } => out.push_str(content),
            HirNode::Block { children, .. } | HirNode::Container { children, .. } => {
                out.push_str(&collect_text(children));
            }
        }
    }
    out
}

fn render_node(node: &HirNode, out: &mut String, in_bq: bool) {
    match node {
        HirNode::Block {
            name,
            attrs,
            children,
        } => match name.as_str() {
            "bullet-list-marker"
            | "ordered-list-marker"
            | "list-item-marker"
            | "blockquote-marker" => {}
            "paragraph" => {
                let inner = render_inline(children);
                if in_bq {
                    out.push_str("> ");
                }
                out.push_str(&inner);
                out.push('\n');
            }
            "heading" => {
                let inner = render_inline(children);
                out.push_str(&format!("*{}*\n", inner));
            }
            "list-item-text" => {
                out.push_str(&format!("- {}\n", render_inline(children)));
            }
            "code-block" => {
                let lang = attrs.get("language").and_then(|v| v.as_str()).unwrap_or("");
                let code = collect_text(children);
                let body = code.strip_suffix('\n').unwrap_or(&code);
                if lang.is_empty() {
                    out.push_str(&format!("```\n{}\n```\n", body));
                } else {
                    out.push_str(&format!("```{}\n{}\n```\n", lang, body));
                }
            }
            _ => {
                out.push_str(&render_inline(children));
                out.push('\n');
            }
        },
        HirNode::Container { name, children, .. } => {
            let child_bq = name == "blockquote";
            for child in children {
                render_node(child, out, child_bq || in_bq);
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
    for node in &nodes {
        render_node(node, &mut out, false);
    }
    if out.ends_with('\n') {
        out.pop();
    }
    out
}
