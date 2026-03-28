//! Telegram MarkdownV2 format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `org.telegram.facet`
//! Inline (MarkdownV2): \X escapes, *bold*, _italic_, __underline__, ~strikethrough~,
//!                      ||spoiler||, `code`, [text](url)
//! Block: paragraph, code-block, blockquote, bullet list, ordered list

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "org.telegram.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/org.telegram/telegram.lexicon.json");

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

fn push_link(state: &mut ImportState, display: &str, href: &str) {
    if display.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(display);
    let e = state.text.len();
    // text_link stores href as a top-level field (not nested in attrs)
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "text_link", "href": href }],
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

fn try_md_link(s: &str) -> Option<(&str, &str, usize)> {
    let bytes = s.as_bytes();
    if bytes.first() != Some(&b'[') {
        return None;
    }
    let close_bracket = s[1..].find(']')?;
    let display = &s[1..1 + close_bracket];
    let after = &s[1 + close_bracket + 1..];
    if after.as_bytes().first() != Some(&b'(') {
        return None;
    }
    let close_paren = after[1..].find(')')?;
    let url = &after[1..1 + close_paren];
    Some((display, url, 1 + close_bracket + 1 + 1 + close_paren + 1))
}

/// Parse Telegram MarkdownV2 inline content into state.
/// Handles escapes (\X), ||spoiler||, __underline__, *bold*, _italic_,
/// ~strikethrough~, `code`, [text](url).
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

        // \X escape — emit the escaped character as plain text
        if b == b'\\' && pos + 1 < len {
            flush!();
            let char_start = pos + 1;
            let char_len = utf8_char_len(bytes[char_start]);
            state
                .text
                .push_str(&line[char_start..char_start + char_len]);
            pos = char_start + char_len;
            plain_start = pos;
            continue;
        }

        // [text](url)
        if b == b'[' {
            if let Some((display, url, consumed)) = try_md_link(&line[pos..]) {
                flush!();
                push_link(state, display, url);
                pos += consumed;
                plain_start = pos;
                continue;
            }
        }

        // ||spoiler||
        if b == b'|' && bytes.get(pos + 1) == Some(&b'|') {
            if let Some(close) = find_two(&line[pos + 2..], b'|', b'|') {
                let content = &line[pos + 2..pos + 2 + close];
                flush!();
                push_inline(state, content, "spoiler");
                pos = pos + 2 + close + 2;
                plain_start = pos;
                continue;
            }
        }

        // __underline__
        if b == b'_' && bytes.get(pos + 1) == Some(&b'_') {
            if let Some(close) = find_two(&line[pos + 2..], b'_', b'_') {
                let content = &line[pos + 2..pos + 2 + close];
                flush!();
                push_inline(state, content, "underline");
                pos = pos + 2 + close + 2;
                plain_start = pos;
                continue;
            }
        }

        // *bold*
        if b == b'*' {
            if let Some(close) = find_single_not_double(&line[pos + 1..], b'*') {
                let content = &line[pos + 1..pos + 1 + close];
                flush!();
                push_inline(state, content, "bold");
                pos = pos + 1 + close + 1;
                plain_start = pos;
                continue;
            }
        }

        // _italic_
        if b == b'_' {
            if let Some(close) = find_single_not_double(&line[pos + 1..], b'_') {
                let content = &line[pos + 1..pos + 1 + close];
                flush!();
                push_inline(state, content, "italic");
                pos = pos + 1 + close + 1;
                plain_start = pos;
                continue;
            }
        }

        // ~strikethrough~
        if b == b'~' {
            if let Some(close) = line[pos + 1..].as_bytes().iter().position(|&c| c == b'~') {
                let content = &line[pos + 1..pos + 1 + close];
                flush!();
                push_inline(state, content, "strikethrough");
                pos = pos + 1 + close + 1;
                plain_start = pos;
                continue;
            }
        }

        // `code`
        if b == b'`' {
            if let Some(close) = line[pos + 1..].as_bytes().iter().position(|&c| c == b'`') {
                let content = &line[pos + 1..pos + 1 + close];
                flush!();
                push_inline(state, content, "code");
                pos = pos + 1 + close + 1;
                plain_start = pos;
                continue;
            }
        }

        pos += utf8_char_len(b);
    }

    state.text.push_str(&line[plain_start..]);
}

// ─── Import ────────────────────────────────────────────────────────────────────

fn is_ordered(line: &str) -> bool {
    let first_space = line.find(". ").unwrap_or(0);
    first_space > 0 && line[..first_space].chars().all(|c| c.is_ascii_digit())
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
    let mut i = 0;
    // 0=none, 1=bullet, 2=ordered
    let mut prev_list: u8 = 0;

    while i < lines.len() {
        let line = lines[i];

        // Triple-backtick code fence
        if line.starts_with("```") {
            let lang = line[3..].trim();
            let lang = if lang.is_empty() { None } else { Some(lang) };
            i += 1;
            let mut code_lines: Vec<&str> = Vec::new();
            while i < lines.len() && !lines[i].starts_with("```") {
                code_lines.push(lines[i]);
                i += 1;
            }
            i += 1; // consume closing ```
            let code = code_lines.join("\n") + "\n";
            let attrs = match lang {
                Some(l) => json!({ "language": l }),
                None => json!({}),
            };
            prev_list = 0;
            open_block_attrs(&mut state, "code-block", &[], attrs);
            state.text.push_str(&code);
            continue;
        }

        if line.starts_with("> ") {
            open_block(&mut state, "blockquote-marker", &[]);
            open_block(&mut state, "paragraph", &["blockquote"]);
            scan_inline(&line[2..], &mut state);
            prev_list = 0;
            i += 1;
            continue;
        }

        if line.starts_with("- ") {
            if prev_list != 1 {
                open_block(&mut state, "bullet-list-marker", &[]);
            }
            open_block(&mut state, "list-item-marker", &["ul"]);
            open_block(&mut state, "list-item-text", &["ul", "unordered-list-item"]);
            scan_inline(&line[2..], &mut state);
            prev_list = 1;
            i += 1;
            continue;
        }

        if is_ordered(line) {
            if prev_list != 2 {
                open_block(&mut state, "ordered-list-marker", &[]);
            }
            open_block(&mut state, "list-item-marker", &["ol"]);
            open_block(&mut state, "list-item-text", &["ol", "ordered-list-item"]);
            scan_inline(ordered_content(line), &mut state);
            prev_list = 2;
            i += 1;
            continue;
        }

        prev_list = 0;
        open_block(&mut state, "paragraph", &[]);
        scan_inline(line, &mut state);
        i += 1;
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

// ─── Export ────────────────────────────────────────────────────────────────────

/// Characters that must be escaped in Telegram MarkdownV2 plain text.
fn escape_telegram(text: &str) -> String {
    let special = b"_*[]()~`>#+=|{}.!-\\";
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        if ch.is_ascii() && special.contains(&(ch as u8)) {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    match mark.kind.as_str() {
        "org.telegram.facet#bold" => format!("*{}*", content),
        "org.telegram.facet#italic" => format!("_{}_", content),
        "org.telegram.facet#underline" => format!("__{}__", content),
        "org.telegram.facet#strikethrough" => format!("~{}~", content),
        "org.telegram.facet#spoiler" => format!("||{}||", content),
        "org.telegram.facet#code" => format!("`{}`", content),
        "org.telegram.facet#text_link" => {
            let href = mark
                .attrs
                .get("href")
                .or_else(|| mark.attrs.get("uri"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("[{}]({})", content, href)
        }
        _ => content.to_owned(),
    }
}

fn render_inline(nodes: &[HirNode]) -> String {
    let mut out = String::new();
    for node in nodes {
        match node {
            HirNode::Text { content, marks } => {
                let base = escape_telegram(content);
                let mut s = base;
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

fn render_node(node: &HirNode, out: &mut String, list_type: u8, ordered_idx: &mut usize) {
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
                out.push_str(&render_inline(children));
                out.push('\n');
            }
            "list-item-text" => {
                let inner = render_inline(children);
                if list_type == 2 {
                    out.push_str(&format!("{}. {}\n", ordered_idx, inner));
                    *ordered_idx += 1;
                } else {
                    out.push_str(&format!("- {}\n", inner));
                }
            }
            "code-block" => {
                let lang = attrs.get("language").and_then(|v| v.as_str()).unwrap_or("");
                let code = collect_text(children);
                let body = code.strip_suffix('\n').unwrap_or(&code);
                out.push_str(&format!("```{}\n{}\n```\n", lang, body));
            }
            _ => {
                out.push_str(&render_inline(children));
                out.push('\n');
            }
        },
        HirNode::Container { name, children, .. } => {
            let lt = match name.as_str() {
                "ul" => 1,
                "ol" => 2,
                _ => list_type,
            };
            // Only reset the ordered index when entering a fresh `ol` container.
            // Inner containers (e.g. "ordered-list-item") must NOT reset it, or
            // every item would restart numbering from 1.
            if matches!(name.as_str(), "ol") {
                let mut idx = 1usize;
                for child in children {
                    render_node(child, out, lt, &mut idx);
                }
            } else {
                for child in children {
                    render_node(child, out, lt, ordered_idx);
                }
            }
        }
        HirNode::Text { content, marks } => {
            let base = escape_telegram(content);
            let mut s = base;
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
    for node in &nodes {
        render_node(node, &mut out, 0, &mut idx);
    }
    if out.ends_with('\n') {
        out.pop();
    }
    out
}
