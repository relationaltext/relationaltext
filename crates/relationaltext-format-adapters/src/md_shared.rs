//! Shared comrak-based walker for RelationalText WASM format adapters.
//!
//! Parameterized by `MdConfig` to support CommonMark, GitLab Flavored Markdown,
//! Obsidian, MyST, and MultiMarkdown from a single compiled binary.

use comrak::nodes::{AstNode, ListType, NodeValue};
use comrak::{parse_document, Arena, Options};
use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use serde_json::{json, Value};

const HTML_NS: &str = "org.w3c.html.facet";

// ─── Format config ──────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FormatVariant {
    CommonMark,
    GitLab,
    Obsidian,
    MyST,
    MultiMarkdown,
}

pub struct MdConfig {
    /// Namespace for this format's native features.
    pub primary_ns: &'static str,
    /// Secondary namespace for GFM features (strikethrough, tables).
    /// When None, primary_ns is used for all features.
    pub gfm_ns: Option<&'static str>,
    pub variant: FormatVariant,
}

// ─── Comrak options ─────────────────────────────────────────────────────────────

pub fn build_options(config: &MdConfig) -> Options<'static> {
    let mut opts = Options::default();
    opts.extension.strikethrough = true;
    opts.extension.table = true;
    opts.extension.footnotes = true;
    opts.extension.description_lists = true;
    opts.parse.smart = false;
    match config.variant {
        FormatVariant::CommonMark => {
            opts.extension.superscript = true;
        }
        FormatVariant::GitLab => {
            opts.extension.superscript = true;
            opts.extension.math_dollars = true;
        }
        FormatVariant::Obsidian => {
            opts.extension.superscript = true;
            opts.extension.wikilinks_title_after_pipe = true;
        }
        FormatVariant::MyST => {
            opts.extension.math_dollars = true;
        }
        FormatVariant::MultiMarkdown => {
            opts.extension.superscript = true;
            // comrak's strikethrough extension consumes ~single~ as well as ~~double~~,
            // making it impossible to distinguish ~~strikethrough~~ from ~subscript~.
            // Disable it here and handle both patterns manually in scan_mmd_text.
            opts.extension.strikethrough = false;
        }
    }
    opts
}

// ─── Import state ───────────────────────────────────────────────────────────────

struct ImportState {
    text: String,
    facets: Vec<Value>,
    container_stack: Vec<String>,
    suppress_paragraph: bool,
}

impl ImportState {
    fn new() -> Self {
        Self {
            text: String::new(),
            facets: Vec::new(),
            container_stack: Vec::new(),
            suppress_paragraph: false,
        }
    }
}

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

// ─── Block helpers ──────────────────────────────────────────────────────────────

fn open_block(state: &mut ImportState, name: &str, attrs: Value, type_id: &str) {
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
        "features": [{
            "$type": type_id,
            "name": name,
            "parents": state.container_stack.clone(),
            "attrs": attrs,
        }],
    }));
}

fn open_primary(state: &mut ImportState, name: &str, attrs: Value, config: &MdConfig) {
    open_block(state, name, attrs, config.primary_ns);
}

fn open_gfm(state: &mut ImportState, name: &str, attrs: Value, config: &MdConfig) {
    let ns = config.gfm_ns.unwrap_or(config.primary_ns);
    open_block(state, name, attrs, ns);
}

// ─── Mark stack helpers ─────────────────────────────────────────────────────────

struct MarkEntry {
    kind: String,
    byte_start: usize,
    facet_idx: usize,
}

fn push_mark_placeholder(
    state: &mut ImportState,
    mark_stack: &mut Vec<MarkEntry>,
    kind: &str,
    type_id: &str,
    extra: Value,
) {
    let byte_start = state.text.len();
    let facet_idx = state.facets.len();
    let mut feat = json!({ "$type": type_id, "name": kind });
    if let Value::Object(map) = extra {
        for (k, v) in map {
            feat[k] = v;
        }
    }
    state.facets.push(json!({
        "index": { "byteStart": byte_start, "byteEnd": byte_start },
        "features": [feat],
    }));
    mark_stack.push(MarkEntry {
        kind: kind.to_owned(),
        byte_start,
        facet_idx,
    });
}

fn close_mark(state: &mut ImportState, mark_stack: &mut Vec<MarkEntry>, kind: &str) {
    let pos = mark_stack.iter().rposition(|e| e.kind == kind);
    if let Some(i) = pos {
        let entry = mark_stack.remove(i);
        let byte_end = state.text.len();
        if entry.byte_start < byte_end {
            state.facets[entry.facet_idx]["index"]["byteEnd"] = json!(byte_end);
        } else {
            state.facets.remove(entry.facet_idx);
            for m in mark_stack.iter_mut() {
                if m.facet_idx > entry.facet_idx {
                    m.facet_idx -= 1;
                }
            }
        }
    }
}

fn push_inline_entity(
    state: &mut ImportState,
    content: &str,
    kind: &str,
    type_id: &str,
    extra: Value,
) {
    if content.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(content);
    let e = state.text.len();
    let mut feat = json!({ "$type": type_id, "name": kind });
    if let Value::Object(map) = extra {
        for (k, v) in map {
            feat[k] = v;
        }
    }
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [feat],
    }));
}

// ─── Collect plain text ─────────────────────────────────────────────────────────

fn collect_plain_text<'a>(node: &'a AstNode<'a>) -> String {
    let mut out = String::new();
    collect_text_recursive(node, &mut out);
    out
}

fn collect_text_recursive<'a>(node: &'a AstNode<'a>, out: &mut String) {
    match &node.data.borrow().value {
        NodeValue::Text(s) => out.push_str(s),
        NodeValue::SoftBreak => out.push(' '),
        _ => {
            for child in node.children() {
                collect_text_recursive(child, out);
            }
        }
    }
}

// ─── Format-specific text scanners ─────────────────────────────────────────────
// Called for NodeValue::Text nodes when the format has special inline syntax
// that comrak doesn't natively parse.

/// Find the first occurrence of two-byte sequence [a, b] in `slice`.
fn find_two_bytes(slice: &[u8], a: u8, b: u8) -> Option<usize> {
    let mut i = 0;
    while i + 1 < slice.len() {
        if slice[i] == a && slice[i + 1] == b {
            return Some(i);
        }
        i += 1;
    }
    None
}

/// Scan `text` for CriticMarkup `{++content++}` (insertion) and `{--content--}` (deletion) patterns.
fn scan_criticmarkup_text(text: &str, state: &mut ImportState, ns: &str) {
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut pos = 0;
    let mut plain_start = 0;
    while pos < len {
        // {++...++}
        if pos + 2 < len && bytes[pos] == b'{' && bytes[pos + 1] == b'+' && bytes[pos + 2] == b'+' {
            if let Some(close_rel) = find_three_bytes(&bytes[pos + 3..], b'+', b'+', b'}') {
                state.text.push_str(&text[plain_start..pos]);
                let s = state.text.len();
                let content_start = pos + 3;
                state
                    .text
                    .push_str(&text[content_start..content_start + close_rel]);
                let e = state.text.len();
                if s < e {
                    state.facets.push(json!({
                        "index": { "byteStart": s, "byteEnd": e },
                        "features": [{ "$type": ns, "name": "insertion" }],
                    }));
                }
                pos = content_start + close_rel + 3;
                plain_start = pos;
                continue;
            }
        }
        // {--...--}
        if pos + 2 < len && bytes[pos] == b'{' && bytes[pos + 1] == b'-' && bytes[pos + 2] == b'-' {
            if let Some(close_rel) = find_three_bytes(&bytes[pos + 3..], b'-', b'-', b'}') {
                state.text.push_str(&text[plain_start..pos]);
                let s = state.text.len();
                let content_start = pos + 3;
                state
                    .text
                    .push_str(&text[content_start..content_start + close_rel]);
                let e = state.text.len();
                if s < e {
                    state.facets.push(json!({
                        "index": { "byteStart": s, "byteEnd": e },
                        "features": [{ "$type": ns, "name": "deletion" }],
                    }));
                }
                pos = content_start + close_rel + 3;
                plain_start = pos;
                continue;
            }
        }
        pos += utf8_char_len(bytes[pos]);
    }
    if plain_start < len {
        state.text.push_str(&text[plain_start..]);
    }
}

fn find_three_bytes(slice: &[u8], a: u8, b: u8, c: u8) -> Option<usize> {
    let mut i = 0;
    while i + 2 < slice.len() {
        if slice[i] == a && slice[i + 1] == b && slice[i + 2] == c {
            return Some(i);
        }
        i += 1;
    }
    None
}

/// Scan `text` for `{+content+}` (ins) and `{-content-}` (del) patterns.
fn scan_gitlab_text(text: &str, state: &mut ImportState, ns: &str) {
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut pos = 0;
    let mut plain_start = 0;
    while pos < len {
        // {+...+}
        if pos + 1 < len && bytes[pos] == b'{' && bytes[pos + 1] == b'+' {
            if let Some(close_rel) = find_two_bytes(&bytes[pos + 2..], b'+', b'}') {
                state.text.push_str(&text[plain_start..pos]);
                let s = state.text.len();
                let content_start = pos + 2;
                state
                    .text
                    .push_str(&text[content_start..content_start + close_rel]);
                let e = state.text.len();
                if s < e {
                    state.facets.push(json!({
                        "index": { "byteStart": s, "byteEnd": e },
                        "features": [{ "$type": ns, "name": "ins" }],
                    }));
                }
                pos = content_start + close_rel + 2;
                plain_start = pos;
                continue;
            }
        }
        // {-...-}
        if pos + 1 < len && bytes[pos] == b'{' && bytes[pos + 1] == b'-' {
            if let Some(close_rel) = find_two_bytes(&bytes[pos + 2..], b'-', b'}') {
                state.text.push_str(&text[plain_start..pos]);
                let s = state.text.len();
                let content_start = pos + 2;
                state
                    .text
                    .push_str(&text[content_start..content_start + close_rel]);
                let e = state.text.len();
                if s < e {
                    state.facets.push(json!({
                        "index": { "byteStart": s, "byteEnd": e },
                        "features": [{ "$type": ns, "name": "del" }],
                    }));
                }
                pos = content_start + close_rel + 2;
                plain_start = pos;
                continue;
            }
        }
        // [^key] (footnote reference)
        if pos + 2 < len && bytes[pos] == b'[' && bytes[pos + 1] == b'^' {
            let content_start = pos + 2;
            let mut j = content_start;
            while j < len && bytes[j] != b']' && bytes[j] != b'\n' {
                j += 1;
            }
            if j < len && bytes[j] == b']' && j > content_start {
                let key = &text[content_start..j];
                // Only treat as footnote ref if NOT followed by `:` (which would be a definition)
                let next = if j + 1 < len { bytes[j + 1] } else { 0 };
                if next != b':' {
                    state.text.push_str(&text[plain_start..pos]);
                    let display = format!("[^{}]", key);
                    push_inline_entity(state, &display, "footnote-ref", ns, json!({ "key": key }));
                    pos = j + 1;
                    plain_start = pos;
                    continue;
                }
            }
        }
        // @username (mention)
        if bytes[pos] == b'@' {
            let content_start = pos + 1;
            let mut j = content_start;
            while j < len
                && (bytes[j].is_ascii_alphanumeric()
                    || bytes[j] == b'.'
                    || bytes[j] == b'_'
                    || bytes[j] == b'-')
            {
                j += 1;
            }
            if j > content_start {
                state.text.push_str(&text[plain_start..pos]);
                let username = &text[content_start..j];
                let display = format!("@{}", username);
                push_inline_entity(
                    state,
                    &display,
                    "mention",
                    ns,
                    json!({ "handle": username }),
                );
                pos = j;
                plain_start = pos;
                continue;
            }
        }
        // !123 (merge request reference) — must check before #123 since both are single-char prefixes
        if bytes[pos] == b'!' {
            let content_start = pos + 1;
            let mut j = content_start;
            while j < len && bytes[j].is_ascii_digit() {
                j += 1;
            }
            if j > content_start {
                state.text.push_str(&text[plain_start..pos]);
                let number_str = &text[content_start..j];
                let number: u64 = number_str.parse().unwrap_or(0);
                let display = format!("!{}", number_str);
                push_inline_entity(state, &display, "mr-ref", ns, json!({ "number": number }));
                pos = j;
                plain_start = pos;
                continue;
            }
        }
        // #123 (issue reference)
        if bytes[pos] == b'#' {
            let content_start = pos + 1;
            let mut j = content_start;
            while j < len && bytes[j].is_ascii_digit() {
                j += 1;
            }
            if j > content_start {
                state.text.push_str(&text[plain_start..pos]);
                let number_str = &text[content_start..j];
                let number: u64 = number_str.parse().unwrap_or(0);
                let display = format!("#{}", number_str);
                push_inline_entity(
                    state,
                    &display,
                    "issue-ref",
                    ns,
                    json!({ "number": number }),
                );
                pos = j;
                plain_start = pos;
                continue;
            }
        }
        pos += utf8_char_len(bytes[pos]);
    }
    state.text.push_str(&text[plain_start..]);
}

/// Scan `text` for `==content==` (highlight) and `#tag` patterns.
fn scan_obsidian_text(text: &str, state: &mut ImportState, ns: &str) {
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut pos = 0;
    let mut plain_start = 0;
    while pos < len {
        // ==highlight==
        if pos + 1 < len && bytes[pos] == b'=' && bytes[pos + 1] == b'=' {
            let content_start = pos + 2;
            let mut j = content_start;
            while j + 1 < len {
                if bytes[j] == b'=' && bytes[j + 1] == b'=' && j > content_start {
                    break;
                }
                j += 1;
            }
            if j + 1 < len && bytes[j] == b'=' && j > content_start {
                state.text.push_str(&text[plain_start..pos]);
                let s = state.text.len();
                state.text.push_str(&text[content_start..j]);
                let e = state.text.len();
                if s < e {
                    state.facets.push(json!({
                        "index": { "byteStart": s, "byteEnd": e },
                        "features": [{ "$type": ns, "name": "highlight" }],
                    }));
                }
                pos = j + 2;
                plain_start = pos;
                continue;
            }
        }
        // #tag (must be preceded by whitespace or start of text)
        if bytes[pos] == b'#'
            && pos + 1 < len
            && (bytes[pos + 1] as char).is_ascii_alphabetic()
            && (pos == 0 || bytes[pos - 1].is_ascii_whitespace())
        {
            let tag_start = pos + 1;
            let mut j = tag_start;
            while j < len
                && (bytes[j].is_ascii_alphanumeric() || bytes[j] == b'_' || bytes[j] == b'-')
            {
                j += 1;
            }
            if j > tag_start {
                state.text.push_str(&text[plain_start..pos]);
                let s = state.text.len();
                let tag_name = &text[tag_start..j];
                state.text.push('#');
                state.text.push_str(tag_name);
                let e = state.text.len();
                state.facets.push(json!({
                    "index": { "byteStart": s, "byteEnd": e },
                    "features": [{ "$type": ns, "name": "tag", "tagName": tag_name }],
                }));
                pos = j;
                plain_start = pos;
                continue;
            }
        }
        pos += utf8_char_len(bytes[pos]);
    }
    state.text.push_str(&text[plain_start..]);
}

/// Scan `text` for `==content==` (highlight), `~~content~~` (strikethrough),
/// and `~content~` (subscript) patterns used in MultiMarkdown.
///
/// Note: comrak's strikethrough extension is intentionally disabled for MultiMarkdown
/// because it conflates `~subscript~` with `~~strikethrough~~`. We scan both manually.
fn scan_mmd_text(text: &str, state: &mut ImportState, ns: &str) {
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut pos = 0;
    let mut plain_start = 0;
    while pos < len {
        // ~~strikethrough~~ (must check before ~subscript~ to avoid partial match)
        if pos + 1 < len && bytes[pos] == b'~' && bytes[pos + 1] == b'~' {
            let content_start = pos + 2;
            let mut j = content_start;
            while j + 1 < len {
                if bytes[j] == b'~' && bytes[j + 1] == b'~' && j > content_start {
                    break;
                }
                j += 1;
            }
            if j + 1 < len && bytes[j] == b'~' && j > content_start {
                state.text.push_str(&text[plain_start..pos]);
                let s = state.text.len();
                state.text.push_str(&text[content_start..j]);
                let e = state.text.len();
                if s < e {
                    state.facets.push(json!({
                        "index": { "byteStart": s, "byteEnd": e },
                        "features": [{ "$type": ns, "name": "strikethrough" }],
                    }));
                }
                pos = j + 2;
                plain_start = pos;
                continue;
            }
        }
        // ==highlight==
        if pos + 1 < len && bytes[pos] == b'=' && bytes[pos + 1] == b'=' {
            let content_start = pos + 2;
            let mut j = content_start;
            while j + 1 < len {
                if bytes[j] == b'=' && bytes[j + 1] == b'=' && j > content_start {
                    break;
                }
                j += 1;
            }
            if j + 1 < len && bytes[j] == b'=' && j > content_start {
                state.text.push_str(&text[plain_start..pos]);
                let s = state.text.len();
                state.text.push_str(&text[content_start..j]);
                let e = state.text.len();
                if s < e {
                    state.facets.push(json!({
                        "index": { "byteStart": s, "byteEnd": e },
                        "features": [{ "$type": ns, "name": "highlight" }],
                    }));
                }
                pos = j + 2;
                plain_start = pos;
                continue;
            }
        }
        // ~subscript~ (single ~, comrak already consumed ~~strikethrough~~)
        if bytes[pos] == b'~' && bytes.get(pos + 1) != Some(&b'~') {
            let content_start = pos + 1;
            let mut j = content_start;
            while j < len {
                if bytes[j] == b'~' && bytes.get(j + 1) != Some(&b'~') && j > content_start {
                    break;
                }
                if bytes[j] == b'~' && bytes.get(j + 1) == Some(&b'~') {
                    break;
                } // bail on ~~
                j += 1;
            }
            if j < len && bytes[j] == b'~' && j > content_start {
                state.text.push_str(&text[plain_start..pos]);
                let s = state.text.len();
                state.text.push_str(&text[content_start..j]);
                let e = state.text.len();
                if s < e {
                    state.facets.push(json!({
                        "index": { "byteStart": s, "byteEnd": e },
                        "features": [{ "$type": ns, "name": "subscript" }],
                    }));
                }
                pos = j + 1;
                plain_start = pos;
                continue;
            }
        }
        // [^key] (footnote reference)
        if pos + 2 < len && bytes[pos] == b'[' && bytes[pos + 1] == b'^' {
            let content_start = pos + 2;
            let mut j = content_start;
            while j < len && bytes[j] != b']' && bytes[j] != b'\n' {
                j += 1;
            }
            if j < len && bytes[j] == b']' && j > content_start {
                let key = &text[content_start..j];
                let next = if j + 1 < len { bytes[j + 1] } else { 0 };
                if next != b':' {
                    state.text.push_str(&text[plain_start..pos]);
                    let display = format!("[^{}]", key);
                    push_inline_entity(state, &display, "footnote-ref", ns, json!({ "key": key }));
                    pos = j + 1;
                    plain_start = pos;
                    continue;
                }
            }
        }
        pos += utf8_char_len(bytes[pos]);
    }
    state.text.push_str(&text[plain_start..]);
}

/// Scan `text` for `{role}`content`` patterns used in MyST.
fn scan_myst_text(text: &str, state: &mut ImportState, ns: &str) {
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut pos = 0;
    let mut plain_start = 0;
    while pos < len {
        // {role}`content`
        if bytes[pos] == b'{' {
            let name_start = pos + 1;
            let mut j = name_start;
            // Find closing }
            while j < len && bytes[j] != b'}' && bytes[j] != b'\n' {
                j += 1;
            }
            if j < len && bytes[j] == b'}' && j > name_start {
                let name_end = j;
                // Must be followed by backtick
                if name_end + 1 < len && bytes[name_end + 1] == b'`' {
                    let content_start = name_end + 2;
                    let mut k = content_start;
                    while k < len && bytes[k] != b'`' {
                        k += 1;
                    }
                    if k < len && bytes[k] == b'`' && k > content_start {
                        let role_name = &text[name_start..name_end];
                        let content = &text[content_start..k];
                        state.text.push_str(&text[plain_start..pos]);
                        push_inline_entity(
                            state,
                            content,
                            "role",
                            ns,
                            json!({ "name_": role_name, "content": content }),
                        );
                        pos = k + 1;
                        plain_start = pos;
                        continue;
                    }
                }
            }
        }
        pos += utf8_char_len(bytes[pos]);
    }
    state.text.push_str(&text[plain_start..]);
}

// ─── Block walker ───────────────────────────────────────────────────────────────

fn walk_blocks<'a>(node: &'a AstNode<'a>, state: &mut ImportState, config: &MdConfig) {
    for child in node.children() {
        walk_block(child, state, config);
    }
}

fn walk_block<'a>(node: &'a AstNode<'a>, state: &mut ImportState, config: &MdConfig) {
    let value = node.data.borrow().value.clone();
    match value {
        NodeValue::Document => walk_blocks(node, state, config),

        NodeValue::BlockQuote => {
            open_primary(state, "blockquote-marker", json!({}), config);
            state.container_stack.push("blockquote".to_owned());
            let start_count = state.facets.len();
            walk_blocks(node, state, config);
            if state.facets.len() == start_count {
                open_primary(state, "list-item-text", json!({}), config);
            }
            state.container_stack.pop();
        }

        NodeValue::List(ref list) => {
            let is_ordered = list.list_type == ListType::Ordered;
            if is_ordered {
                let start = list.start;
                let marker_attrs = if start != 1 {
                    json!({"start": start.to_string()})
                } else {
                    json!({})
                };
                open_primary(state, "ordered-list-marker", marker_attrs, config);
                // Always push 'ol' as the container name (not 'ol:N').
                // The start value is stored on the marker block's attrs.
                state.container_stack.push("ol".to_owned());
            } else {
                open_primary(state, "bullet-list-marker", json!({}), config);
                state.container_stack.push("ul".to_owned());
            }
            walk_blocks(node, state, config);
            state.container_stack.pop();
        }

        NodeValue::Item(ref list) => {
            let is_ordered = list.list_type == ListType::Ordered;
            open_primary(state, "list-item-marker", json!({}), config);
            let item_name = if is_ordered {
                "ordered-list-item"
            } else {
                "unordered-list-item"
            };
            state.container_stack.push(item_name.to_owned());
            let start_count = state.facets.len();
            walk_blocks(node, state, config);
            if state.facets.len() == start_count {
                open_primary(state, "list-item-text", json!({}), config);
            }
            state.container_stack.pop();
        }

        NodeValue::DescriptionList => {
            state.container_stack.push("dl".to_owned());
            walk_blocks(node, state, config);
            state.container_stack.pop();
        }
        NodeValue::DescriptionItem(_) => walk_blocks(node, state, config),
        NodeValue::DescriptionTerm => {
            open_primary(state, "definition-term", json!({}), config);
            state.suppress_paragraph = true;
            walk_inlines(node, state, config);
            state.suppress_paragraph = false;
        }
        NodeValue::DescriptionDetails => {
            open_primary(state, "definition-detail", json!({}), config);
            state.suppress_paragraph = true;
            walk_inlines(node, state, config);
            state.suppress_paragraph = false;
        }

        NodeValue::Paragraph => {
            let top = state
                .container_stack
                .last()
                .map(|s| s.as_str())
                .unwrap_or("");
            let is_li = top == "unordered-list-item" || top == "ordered-list-item";
            let is_tight = if is_li {
                node.parent()
                    .and_then(|item| item.parent())
                    .map(|list| {
                        let b = list.data.borrow();
                        if let NodeValue::List(l) = &b.value {
                            l.tight
                        } else {
                            false
                        }
                    })
                    .unwrap_or(false)
            } else {
                false
            };
            if !state.suppress_paragraph {
                open_primary(
                    state,
                    if is_tight {
                        "list-item-text"
                    } else {
                        "paragraph"
                    },
                    json!({}),
                    config,
                );
            }
            walk_inlines(node, state, config);
        }

        NodeValue::Heading(ref h) => {
            let level = h.level;
            open_primary(state, "heading", json!({ "level": level }), config);
            walk_inlines(node, state, config);
        }

        NodeValue::ThematicBreak => {
            open_primary(state, "horizontal-rule", json!({}), config);
        }

        NodeValue::CodeBlock(ref cb) => {
            let info = cb.info.trim();
            // MyST directive: code block with {name} as info string
            if config.variant == FormatVariant::MyST && info.starts_with('{') {
                let close_brace = info.find('}');
                if let Some(cb_pos) = close_brace {
                    let dir_name = &info[1..cb_pos];
                    let rest = info[cb_pos + 1..].trim();
                    let body = &cb.literal;

                    // Parse options: lines starting with :key: value before a blank line
                    let body_lines: Vec<&str> = body.lines().collect();
                    let mut options = serde_json::Map::new();
                    let mut body_start = 0;
                    for (idx, line) in body_lines.iter().enumerate() {
                        let lt = line.trim();
                        if lt.is_empty() {
                            body_start = idx + 1;
                            break;
                        }
                        if lt.starts_with(':') {
                            // :key: value
                            if let Some(second_colon) = lt[1..].find(':') {
                                let key = &lt[1..1 + second_colon];
                                let value = lt[2 + second_colon..].trim();
                                options.insert(key.to_owned(), json!(value));
                                body_start = idx + 1;
                            } else {
                                break;
                            }
                        } else {
                            break;
                        }
                    }

                    let remaining_body = if body_start < body_lines.len() {
                        body_lines[body_start..].join("\n")
                    } else {
                        String::new()
                    };

                    let mut attrs = json!({ "name": dir_name });
                    if !rest.is_empty() {
                        attrs["args"] = json!(rest);
                    }
                    if !options.is_empty() {
                        attrs["options"] = Value::Object(options);
                    }

                    open_block(state, "directive", attrs, config.primary_ns);
                    state.text.push_str(&remaining_body);
                } else {
                    // Malformed directive, treat as code block
                    let lang = info.split_whitespace().next().unwrap_or("").to_owned();
                    let attrs = if lang.is_empty() {
                        json!({})
                    } else {
                        json!({ "language": lang })
                    };
                    open_primary(state, "code-block", attrs, config);
                    state.text.push_str(&cb.literal);
                }
            } else {
                let lang = info.split_whitespace().next().unwrap_or("").to_owned();
                let attrs = if lang.is_empty() {
                    json!({})
                } else {
                    json!({ "language": lang })
                };
                open_primary(state, "code-block", attrs, config);
                state.text.push_str(&cb.literal);
            }
        }

        NodeValue::HtmlBlock(ref hb) => {
            // Preserve trailing newline — trim only trailing blank lines
            let content = hb
                .literal
                .trim_end_matches(|c: char| c == '\n' || c == '\r');
            // Re-add a single trailing newline if the original had one
            let content = if hb.literal.ends_with('\n') {
                format!("{}\n", content)
            } else {
                content.to_owned()
            };
            open_primary(state, "html-block", json!({ "content": content }), config);
        }

        NodeValue::Table(_) => {
            let (headers, rows) = collect_table(node);
            open_gfm(
                state,
                "table",
                json!({ "headers": headers, "rows": rows }),
                config,
            );
        }

        NodeValue::FootnoteDefinition(ref def) => {
            open_primary(state, "footnote-def", json!({ "key": def.name }), config);
            walk_inlines(node, state, config);
        }

        // Block-level math ($$...$$) — GitLab and MyST
        NodeValue::Math(ref nm) if nm.display_math => {
            open_primary(state, "math-block", json!({ "code": nm.literal }), config);
            state.text.push_str(&nm.literal);
        }

        _ => walk_blocks(node, state, config),
    }
}

// ─── Table collection ───────────────────────────────────────────────────────────

fn collect_table<'a>(table_node: &'a AstNode<'a>) -> (Vec<String>, Vec<Vec<String>>) {
    let mut headers = Vec::new();
    let mut rows = Vec::new();
    for child in table_node.children() {
        let is_header = match &child.data.borrow().value {
            NodeValue::TableRow(h) => *h,
            _ => continue,
        };
        let mut row: Vec<String> = Vec::new();
        for cell in child.children() {
            if matches!(&cell.data.borrow().value, NodeValue::TableCell) {
                row.push(collect_plain_text(cell));
            }
        }
        if is_header {
            headers = row;
        } else {
            rows.push(row);
        }
    }
    (headers, rows)
}

// ─── Inline walker ──────────────────────────────────────────────────────────────

fn walk_inlines<'a>(block_node: &'a AstNode<'a>, state: &mut ImportState, config: &MdConfig) {
    let mut mark_stack: Vec<MarkEntry> = Vec::new();
    let children: Vec<&'a AstNode<'a>> = block_node.children().collect();
    let mut i = 0;
    while i < children.len() {
        // MyST role detection: Text ending with {name} followed by Code node
        if config.variant == FormatVariant::MyST && i + 1 < children.len() {
            let val = children[i].data.borrow().value.clone();
            if let NodeValue::Text(ref s) = val {
                // Check if text ends with {name} pattern
                if let Some(brace_start) = s.rfind('{') {
                    let after_brace = &s[brace_start + 1..];
                    if after_brace.ends_with('}') {
                        let role_name = &after_brace[..after_brace.len() - 1];
                        if !role_name.is_empty()
                            && role_name
                                .chars()
                                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
                        {
                            let next_val = children[i + 1].data.borrow().value.clone();
                            if let NodeValue::Code(ref c) = next_val {
                                // Emit text before the role
                                let prefix = &s[..brace_start];
                                if !prefix.is_empty() {
                                    match config.variant {
                                        FormatVariant::MyST => {
                                            scan_myst_text(prefix, state, config.primary_ns)
                                        }
                                        _ => state.text.push_str(prefix),
                                    }
                                }
                                // Emit role entity
                                push_inline_entity(
                                    state,
                                    &c.literal,
                                    "role",
                                    config.primary_ns,
                                    json!({ "name_": role_name, "content": c.literal }),
                                );
                                i += 2; // Skip both the text and code nodes
                                continue;
                            }
                        }
                    }
                }
            }
        }
        walk_inline(children[i], state, &mut mark_stack, config);
        i += 1;
    }
}

fn walk_inline<'a>(
    node: &'a AstNode<'a>,
    state: &mut ImportState,
    mark_stack: &mut Vec<MarkEntry>,
    config: &MdConfig,
) {
    let value = node.data.borrow().value.clone();
    let ns = config.primary_ns;
    let gfm = config.gfm_ns.unwrap_or(ns);
    match value {
        NodeValue::Text(s) => match config.variant {
            FormatVariant::GitLab => scan_gitlab_text(&s, state, ns),
            FormatVariant::Obsidian => scan_obsidian_text(&s, state, ns),
            FormatVariant::MultiMarkdown => scan_mmd_text(&s, state, ns),
            FormatVariant::MyST => scan_myst_text(&s, state, ns),
            _ => scan_criticmarkup_text(&s, state, ns),
        },

        NodeValue::SoftBreak => {
            state.text.push('\n');
        }

        NodeValue::LineBreak => {
            push_inline_entity(state, "\n", "line-break", ns, json!({}));
        }

        NodeValue::Code(ref c) => {
            push_inline_entity(state, &c.literal, "code-span", ns, json!({}));
        }

        NodeValue::Emph => {
            push_mark_placeholder(state, mark_stack, "emphasis", ns, json!({}));
            for child in node.children() {
                walk_inline(child, state, mark_stack, config);
            }
            close_mark(state, mark_stack, "emphasis");
        }

        NodeValue::Strong => {
            push_mark_placeholder(state, mark_stack, "strong", ns, json!({}));
            for child in node.children() {
                walk_inline(child, state, mark_stack, config);
            }
            close_mark(state, mark_stack, "strong");
        }

        NodeValue::Strikethrough => {
            push_mark_placeholder(state, mark_stack, "strikethrough", gfm, json!({}));
            for child in node.children() {
                walk_inline(child, state, mark_stack, config);
            }
            close_mark(state, mark_stack, "strikethrough");
        }

        NodeValue::Superscript => {
            push_mark_placeholder(state, mark_stack, "superscript", ns, json!({}));
            for child in node.children() {
                walk_inline(child, state, mark_stack, config);
            }
            close_mark(state, mark_stack, "superscript");
        }

        NodeValue::Link(ref link) => {
            let uri = link.url.clone();
            let title = link.title.clone();
            let extra = if title.is_empty() {
                json!({ "uri": uri })
            } else {
                json!({ "uri": uri, "title": title })
            };
            push_mark_placeholder(state, mark_stack, "link", ns, extra);
            let text_before = state.text.len();
            for child in node.children() {
                walk_inline(child, state, mark_stack, config);
            }
            if state.text.len() == text_before {
                state.text.push('\u{200B}');
            }
            close_mark(state, mark_stack, "link");
        }

        NodeValue::Image(ref link) => {
            let src = link.url.clone();
            let title = link.title.clone();
            let alt = collect_plain_text(node);
            if alt.starts_with("embed:") {
                let rest = &alt["embed:".len()..];
                let space_idx = rest.find(' ');
                let embed_type = space_idx.map(|i| &rest[..i]).unwrap_or(rest);
                let embed_title = space_idx.map(|i| &rest[i + 1..]);
                let mut attrs = json!({ "url": src, "embedType": embed_type });
                if let Some(t) = embed_title {
                    attrs["title"] = json!(t);
                }
                // If the last facet is an empty paragraph that was just opened for this
                // image, replace it with the embed block instead of creating a second block.
                let replaced = if let Some(last) = state.facets.last_mut() {
                    let feats = last["features"].as_array();
                    let is_empty_para = feats
                        .map(|f| f.iter().any(|feat| feat["name"] == "paragraph"))
                        .unwrap_or(false);
                    if is_empty_para {
                        // Replace the paragraph feature with the embed feature
                        last["features"] = json!([{ "$type": ns, "name": "embed", "parents": state.container_stack.clone(), "attrs": attrs }]);
                        true
                    } else {
                        false
                    }
                } else {
                    false
                };
                if !replaced {
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
                        "features": [{ "$type": ns, "name": "embed", "parents": state.container_stack.clone(), "attrs": attrs }],
                    }));
                }
            } else {
                let img_start = state.text.len();
                state.text.push('\u{FFFC}');
                let img_end = state.text.len();
                let mut feat = json!({ "$type": ns, "name": "image", "src": src, "alt": alt });
                if !title.is_empty() {
                    feat["title"] = json!(title);
                }
                state.facets.push(json!({
                    "index": { "byteStart": img_start, "byteEnd": img_end },
                    "features": [feat],
                }));
            }
        }

        NodeValue::HtmlInline(s) => {
            // Store all inline HTML verbatim as raw-inline entities.
            // The FFFC placeholder is replaced by the raw content during HTML rendering.
            let start = state.text.len();
            state.text.push('\u{FFFC}');
            let end = state.text.len();
            state.facets.push(json!({
                "index": { "byteStart": start, "byteEnd": end },
                "features": [{ "$type": HTML_NS, "name": "raw-inline", "raw": s }],
            }));
        }

        NodeValue::FootnoteReference(ref r) => {
            push_inline_entity(
                state,
                &format!("[^{}]", r.name),
                "footnote-ref",
                ns,
                json!({ "key": r.name }),
            );
        }

        // WikiLink — Obsidian (wikilinks_title_after_pipe)
        NodeValue::WikiLink(ref wl) => {
            let url = &wl.url;
            let display = collect_plain_text(node);
            let (page_name, anchor) = if let Some(idx) = url.find('#') {
                (&url[..idx], Some(&url[idx + 1..]))
            } else {
                (url.as_str(), None)
            };
            let s = state.text.len();
            state.text.push_str(&display);
            let e = state.text.len();
            let mut feat = json!({ "$type": ns, "name": "wikilink", "page": page_name });
            if let Some(a) = anchor {
                feat["anchor"] = json!(a);
            }
            if display != page_name {
                feat["display"] = json!(&display);
            }
            state.facets.push(json!({
                "index": { "byteStart": s, "byteEnd": e },
                "features": [feat],
            }));
        }

        // Inline math ($math$) — GitLab and MyST
        NodeValue::Math(ref nm) if !nm.display_math => {
            push_inline_entity(
                state,
                &nm.literal,
                "math-inline",
                ns,
                json!({ "code": nm.literal }),
            );
        }

        // Display math ($$...$$) as inline — comrak wraps display math in a paragraph
        NodeValue::Math(ref nm) if nm.display_math => {
            // Emit as a math-block even though comrak treats it as inline display math
            open_primary(state, "math-block", json!({ "code": nm.literal }), config);
            state.text.push_str(&nm.literal);
        }

        _ => {
            for child in node.children() {
                walk_inline(child, state, mark_stack, config);
            }
        }
    }
}

// ─── Import ─────────────────────────────────────────────────────────────────────

pub fn do_import(raw: &str, config: &MdConfig) -> String {
    let md = if raw.trim_start().starts_with('{') {
        let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
        outer["text"]
            .as_str()
            .map(|s| s.to_owned())
            .unwrap_or_else(|| raw.to_owned())
    } else {
        raw.to_owned()
    };

    // MultiMarkdown metadata pre-processing: key-value pairs at document start,
    // terminated by a blank line. Format: "Key: Value" on each line.
    let mut state = ImportState::new();
    let md = if config.variant == FormatVariant::MultiMarkdown {
        let mut metadata_end = None;
        let mut has_metadata = false;
        for (i, line) in md.lines().enumerate() {
            if line.is_empty() {
                if has_metadata {
                    metadata_end = Some(i);
                }
                break;
            }
            // Check if line matches Key: Value pattern
            if let Some(colon_pos) = line.find(':') {
                let key_part = &line[..colon_pos];
                // Key must start with a letter and contain only letters, digits, spaces, underscores, hyphens
                let valid_key = !key_part.is_empty()
                    && key_part
                        .chars()
                        .next()
                        .map_or(false, |c| c.is_ascii_alphabetic())
                    && key_part
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == ' ' || c == '_' || c == '-');
                if valid_key {
                    has_metadata = true;
                } else {
                    break; // Not metadata
                }
            } else {
                break; // No colon, not metadata
            }
        }
        if let Some(blank_line_idx) = metadata_end {
            // Emit metadata blocks
            let lines: Vec<&str> = md.lines().collect();
            for line in &lines[..blank_line_idx] {
                if let Some(colon_pos) = line.find(':') {
                    let key = line[..colon_pos].trim();
                    let value = line[colon_pos + 1..].trim();
                    open_block(
                        &mut state,
                        "metadata",
                        json!({ "key": key, "value": value }),
                        config.primary_ns,
                    );
                }
            }
            // Strip metadata + blank line from text before passing to comrak
            let mut byte_offset = 0;
            for (i, line) in md.lines().enumerate() {
                byte_offset += line.len();
                if i <= blank_line_idx {
                    byte_offset += 1; // newline char
                }
                if i == blank_line_idx {
                    break;
                }
            }
            md[byte_offset..].to_owned()
        } else {
            md
        }
    } else {
        md
    };

    // MyST frontmatter pre-processing: --- delimited YAML at document start.
    let md = if config.variant == FormatVariant::MyST {
        let lines: Vec<&str> = md.lines().collect();
        if !lines.is_empty() && lines[0].trim() == "---" {
            // Find closing ---
            let mut end_idx = None;
            for i in 1..lines.len() {
                if lines[i].trim() == "---" {
                    end_idx = Some(i);
                    break;
                }
            }
            if let Some(close_idx) = end_idx {
                // Parse key: value pairs from frontmatter
                for line in &lines[1..close_idx] {
                    if let Some(colon_pos) = line.find(':') {
                        let key = line[..colon_pos].trim();
                        let value = line[colon_pos + 1..].trim();
                        if !key.is_empty() {
                            open_block(
                                &mut state,
                                "frontmatter",
                                json!({ "key": key, "value": value }),
                                config.primary_ns,
                            );
                        }
                    }
                }
                // Strip frontmatter from text before comrak parsing
                let mut byte_offset = 0;
                for i in 0..=close_idx {
                    byte_offset += lines[i].len() + 1; // +1 for newline
                }
                let rest = &md[byte_offset.min(md.len())..];
                rest.to_owned()
            } else {
                md
            }
        } else {
            md
        }
    } else {
        md
    };

    // MyST target label pre-processing: (label)= lines before headings.
    // Record labels by heading index (0-based) and strip target lines from text.
    let (md, myst_target_labels) = if config.variant == FormatVariant::MyST {
        let mut target_labels: Vec<(usize, String)> = Vec::new(); // (heading_index, label)
        let lines: Vec<&str> = md.lines().collect();
        let mut remaining: Vec<&str> = Vec::new();
        let mut pending_label: Option<String> = None;
        let mut heading_count = 0usize;
        for line in lines.iter() {
            let trimmed = line.trim();
            // Check for (label)= pattern
            if trimmed.starts_with('(') && trimmed.ends_with(")=") {
                let label = &trimmed[1..trimmed.len() - 2];
                if !label.is_empty()
                    && label
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
                {
                    pending_label = Some(label.to_owned());
                    continue; // Don't include this line
                }
            }
            if trimmed.starts_with('#') {
                if let Some(label) = pending_label.take() {
                    target_labels.push((heading_count, label));
                }
                heading_count += 1;
            } else {
                pending_label = None;
            }
            remaining.push(line);
        }
        (remaining.join("\n"), target_labels)
    } else {
        (md, Vec::new())
    };

    // MyST admonition pre-processing: :::{ } blocks.
    // Comrak doesn't understand ::: fences, so we handle them before parsing.
    let md = if config.variant == FormatVariant::MyST {
        let lines: Vec<&str> = md.lines().collect();
        let mut result_lines: Vec<String> = Vec::new();
        let mut i = 0;
        while i < lines.len() {
            let trimmed = lines[i].trim();
            // Check for :::{name} or :::{name} title
            if trimmed.starts_with(":::{") {
                let close_brace = trimmed.find('}');
                if let Some(cb) = close_brace {
                    let adm_name = &trimmed[4..cb];
                    let rest = trimmed[cb + 1..].trim();
                    let title = if rest.is_empty() {
                        None
                    } else {
                        Some(rest.to_owned())
                    };
                    // Collect body until closing :::
                    let mut body_lines: Vec<&str> = Vec::new();
                    i += 1;
                    while i < lines.len() {
                        let lt = lines[i].trim();
                        if lt == ":::" {
                            i += 1;
                            break;
                        }
                        body_lines.push(lines[i]);
                        i += 1;
                    }
                    let body = body_lines.join("\n");
                    // Emit admonition block
                    open_block(
                        &mut state,
                        "admonition",
                        match &title {
                            Some(t) => json!({ "type": adm_name, "title": t }),
                            None => json!({ "type": adm_name }),
                        },
                        config.primary_ns,
                    );
                    state.text.push_str(&body);
                    continue;
                }
            }
            result_lines.push(lines[i].to_owned());
            i += 1;
        }
        result_lines.join("\n")
    } else {
        md
    };

    // Footnote definition pre-processing: extract [^key]: text lines.
    // Comrak may not emit FootnoteDefinition nodes for standalone definitions
    // (without matching references). Handle them explicitly.
    let md = if matches!(
        config.variant,
        FormatVariant::GitLab | FormatVariant::MultiMarkdown | FormatVariant::CommonMark
    ) {
        let mut remaining_lines: Vec<&str> = Vec::new();
        let mut found_footnote_defs = false;
        for line in md.lines() {
            if line.starts_with("[^") {
                if let Some(bracket_end) = line.find("]:") {
                    let key = &line[2..bracket_end];
                    if !key.is_empty()
                        && key
                            .chars()
                            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
                    {
                        let value = line[bracket_end + 2..].trim();
                        open_block(
                            &mut state,
                            "footnote-def",
                            json!({ "key": key }),
                            config.primary_ns,
                        );
                        state.text.push_str(value);
                        found_footnote_defs = true;
                        continue;
                    }
                }
            }
            remaining_lines.push(line);
        }
        if found_footnote_defs {
            remaining_lines.join("\n")
        } else {
            md
        }
    } else {
        md
    };

    let opts = build_options(config);
    let arena = Arena::new();
    let root = parse_document(&arena, &md, &opts);

    walk_blocks(root, &mut state, config);

    // MyST target label post-processing: attach labels to heading facets.
    if !myst_target_labels.is_empty() {
        let mut heading_idx = 0usize;
        for facet in state.facets.iter_mut() {
            if let Some(features) = facet.get("features").and_then(|f| f.as_array()) {
                let is_heading = features
                    .iter()
                    .any(|f| f.get("name").and_then(|n| n.as_str()) == Some("heading"));
                if is_heading {
                    if let Some((_, label)) = myst_target_labels
                        .iter()
                        .find(|(idx, _)| *idx == heading_idx)
                    {
                        // Attach target to the heading's attrs
                        if let Some(features) =
                            facet.get_mut("features").and_then(|f| f.as_array_mut())
                        {
                            for feat in features.iter_mut() {
                                if feat.get("name").and_then(|n| n.as_str()) == Some("heading") {
                                    if let Some(attrs) = feat.get_mut("attrs") {
                                        attrs["target"] = json!(label);
                                    }
                                }
                            }
                        }
                    }
                    heading_idx += 1;
                }
            }
        }
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

// ─── Export ──────────────────────────────────────────────────────────────────────

/// Apply a single mark to `content`, using the feature name suffix for dispatch.
/// This is namespace-agnostic: `"org.commonmark.facet#strong"` and
/// `"com.gitlab.facet#strong"` both render as `**content**`.
fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    let feature = mark
        .kind
        .rfind('#')
        .map(|i| &mark.kind[i + 1..])
        .unwrap_or(&mark.kind);
    match feature {
        "strong" => format!("**{}**", content),
        "emphasis" => format!("*{}*", content),
        "strikethrough" => format!("~~{}~~", content),
        "code-span" => format!("`{}`", content),
        "superscript" => format!("^{}^", content),
        "subscript" => format!("~{}~", content),
        "highlight" => format!("=={}==", content),
        "ins" => format!("{{+{}+}}", content),
        "del" => format!("{{-{}-}}", content),
        "insertion" => format!("{{++{}++}}", content),
        "deletion" => format!("{{--{}--}}", content),
        "math-inline" => format!("${}$", content),
        "line-break" => "  \n".to_owned(),
        "link" => {
            let uri = mark
                .attrs
                .get("uri")
                .or_else(|| mark.attrs.get("url"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let title = mark.attrs.get("title").and_then(|v| v.as_str());
            let display = content.replace('\u{200B}', "");
            match title {
                Some(t) if !t.is_empty() => format!("[{}]({} \"{}\")", display, uri, t),
                _ => {
                    if display == uri {
                        uri.to_owned()
                    } else {
                        format!("[{}]({})", display, uri)
                    }
                }
            }
        }
        "image" => {
            let src = mark.attrs.get("src").and_then(|v| v.as_str()).unwrap_or("");
            let alt = mark.attrs.get("alt").and_then(|v| v.as_str()).unwrap_or("");
            let title = mark.attrs.get("title").and_then(|v| v.as_str());
            match title {
                Some(t) if !t.is_empty() => format!("![{}]({} \"{}\")", alt, src, t),
                _ => format!("![{}]({})", alt, src),
            }
        }
        "wikilink" => {
            let page = mark
                .attrs
                .get("page")
                .and_then(|v| v.as_str())
                .unwrap_or(content);
            let anchor = mark.attrs.get("anchor").and_then(|v| v.as_str());
            let display = mark.attrs.get("display").and_then(|v| v.as_str());
            let page_part = match anchor {
                Some(a) => format!("{}#{}", page, a),
                None => page.to_owned(),
            };
            match display {
                Some(d) => format!("[[{}|{}]]", page_part, d),
                None => format!("[[{}]]", page_part),
            }
        }
        "tag" => content.to_owned(), // content already includes the # prefix
        "footnote-ref" => {
            let key = mark.attrs.get("key").and_then(|v| v.as_str()).unwrap_or("");
            format!("[^{}]", key)
        }
        "role" => {
            let name_ = mark
                .attrs
                .get("name_")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            format!("{{{}}}`{}`", name_, content)
        }
        "mention" => content.to_owned(), // content includes @ prefix
        "issue-ref" => content.to_owned(), // content includes # prefix
        "mr-ref" => content.to_owned(),  // content includes ! prefix
        _ => content.to_owned(),
    }
}

fn render_inline(nodes: &[HirNode]) -> String {
    // Flatten into a list of (content, marks) segments, expanding blocks/containers.
    let mut segments: Vec<(String, Vec<MarkApplication>)> = Vec::new();
    flatten_inline_segments(nodes, &mut segments);

    // Group consecutive segments that share common outer marks, then render
    // with proper open/close to avoid duplicating delimiters at boundaries.
    render_segments_with_continuity(&segments)
}

fn flatten_inline_segments(nodes: &[HirNode], out: &mut Vec<(String, Vec<MarkApplication>)>) {
    for node in nodes {
        match node {
            HirNode::Text { content, marks } => {
                out.push((content.clone(), marks.clone()));
            }
            HirNode::Block { children, .. } | HirNode::Container { children, .. } => {
                flatten_inline_segments(children, out);
            }
        }
    }
}

fn mark_key(mark: &MarkApplication) -> String {
    // Key for comparing marks: kind + stable subset of attrs
    let mut key = mark.kind.clone();
    if !mark.attrs.is_empty() {
        // Include attrs in key for entity-like marks (links, etc.)
        key.push_str(&serde_json::to_string(&mark.attrs).unwrap_or_default());
    }
    key
}

fn render_segments_with_continuity(segments: &[(String, Vec<MarkApplication>)]) -> String {
    if segments.is_empty() {
        return String::new();
    }

    // Find the longest common mark prefix shared by ALL segments.
    // Apply those marks around the whole group, then recurse for inner differences.
    let first_marks = &segments[0].1;
    let mut common_len = first_marks.len();
    for seg in &segments[1..] {
        let matching = first_marks
            .iter()
            .zip(seg.1.iter())
            .take_while(|(a, b)| mark_key(a) == mark_key(b))
            .count();
        common_len = common_len.min(matching);
    }

    if common_len == 0 {
        // No common marks. Find the first position where marks diverge and split there.
        // Render each contiguous run of same first-mark segments together.
        let mut out = String::new();
        let mut i = 0;
        while i < segments.len() {
            if segments[i].1.is_empty() {
                // No marks: render content directly
                out.push_str(&segments[i].0);
                i += 1;
            } else {
                // Find run of segments sharing the same first mark
                let first_key = mark_key(&segments[i].1[0]);
                let mut j = i + 1;
                while j < segments.len()
                    && !segments[j].1.is_empty()
                    && mark_key(&segments[j].1[0]) == first_key
                {
                    j += 1;
                }
                // Render this run recursively
                out.push_str(&render_segments_with_continuity(&segments[i..j]));
                i = j;
            }
        }
        return out;
    }

    // Strip common prefix marks, render inner content, then wrap with common marks.
    let inner_segments: Vec<(String, Vec<MarkApplication>)> = segments
        .iter()
        .map(|(content, marks)| (content.clone(), marks[common_len..].to_vec()))
        .collect();
    let mut inner = render_segments_with_continuity(&inner_segments);

    // Apply common marks (outermost first, i.e. reverse order)
    for mark in first_marks[..common_len].iter().rev() {
        inner = apply_mark(&inner, mark);
    }
    inner
}

fn collect_text_hir(nodes: &[HirNode]) -> String {
    let mut out = String::new();
    for node in nodes {
        match node {
            HirNode::Text { content, .. } => out.push_str(content),
            HirNode::Block { children, .. } | HirNode::Container { children, .. } => {
                out.push_str(&collect_text_hir(children));
            }
        }
    }
    out
}

#[derive(Clone, Copy)]
pub(crate) struct ListCtx {
    list_type: u8,
    ordered_idx: usize,
}
impl ListCtx {
    fn none() -> Self {
        Self {
            list_type: 0,
            ordered_idx: 1,
        }
    }
}

pub(crate) fn render_node(node: &HirNode, out: &mut String, list_ctx: ListCtx) {
    match node {
        HirNode::Block {
            name,
            attrs,
            children,
        } => render_block_node(name, attrs, children, out, list_ctx),
        HirNode::Container { name, children, .. } => {
            render_container_node(name, children, out, list_ctx)
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

fn render_block_node(
    name: &str,
    attrs: &std::collections::HashMap<String, Value>,
    children: &[HirNode],
    out: &mut String,
    list_ctx: ListCtx,
) {
    match name {
        "blockquote-marker" | "bullet-list-marker" | "ordered-list-marker" | "list-item-marker" => {
        }

        "paragraph" => {
            out.push_str(render_inline(children).trim_end());
            out.push_str("\n\n");
        }

        "list-item-text" => {
            let inner = render_inline(children);
            if list_ctx.list_type == 3 {
                // Inside ordered-list-item/unordered-list-item container — emit text;
                // the container itself adds the bullet/number prefix.
                // Add a trailing newline so any subsequent nested content starts on the next line.
                out.push_str(inner.trim_end());
                out.push('\n');
            } else if list_ctx.list_type == 2 {
                out.push_str(&format!("{}. {}\n", list_ctx.ordered_idx, inner.trim_end()));
            } else {
                out.push_str(&format!("- {}\n", inner.trim_end()));
            }
        }

        "heading" => {
            let level = attrs.get("level").and_then(|v| v.as_u64()).unwrap_or(1) as usize;
            let level = level.max(1).min(6);
            // MyST target label
            if let Some(target) = attrs.get("target").and_then(|v| v.as_str()) {
                out.push_str(&format!("({})=\n", target));
            }
            out.push_str(&format!(
                "{} {}\n\n",
                "#".repeat(level),
                render_inline(children).trim_end()
            ));
        }

        "code-block" => {
            let lang = attrs.get("language").and_then(|v| v.as_str()).unwrap_or("");
            let code = collect_text_hir(children);
            let body = code.strip_suffix('\n').unwrap_or(&code);
            out.push_str(&format!("```{}\n{}\n```\n\n", lang, body));
        }

        "horizontal-rule" => out.push_str("---\n\n"),

        "html-block" => {
            let content = attrs.get("content").and_then(|v| v.as_str()).unwrap_or("");
            out.push_str(content);
            out.push_str("\n\n");
        }

        "definition-term" => {
            out.push_str(&format!("**{}**\n", render_inline(children).trim_end()));
        }

        "definition-detail" => {
            out.push_str(&format!(":   {}\n", render_inline(children).trim_end()));
        }

        "table" => {
            let headers = attrs
                .get("headers")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str())
                        .map(|s| s.to_owned())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let rows = attrs
                .get("rows")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|r| r.as_array())
                        .map(|row| {
                            row.iter()
                                .filter_map(|v| v.as_str())
                                .map(|s| s.to_owned())
                                .collect::<Vec<_>>()
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            if !headers.is_empty() {
                out.push_str(&format!("| {} |\n", headers.join(" | ")));
                out.push_str(&format!(
                    "| {} |\n",
                    headers
                        .iter()
                        .map(|_| "---")
                        .collect::<Vec<_>>()
                        .join(" | ")
                ));
                for row in &rows {
                    out.push_str(&format!("| {} |\n", row.join(" | ")));
                }
                out.push_str("\n\n");
            }
        }

        "embed" => {
            let url = attrs.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let embed_type = attrs
                .get("embedType")
                .and_then(|v| v.as_str())
                .unwrap_or("iframe");
            let title = attrs.get("title").and_then(|v| v.as_str());
            let alt = match title {
                Some(t) => format!("embed:{} {}", embed_type, t),
                None => format!("embed:{}", embed_type),
            };
            out.push_str(&format!("![{}]({})\n\n", alt, url));
        }

        // Math blocks (GitLab / MyST)
        "math-block" => {
            let code = attrs
                .get("code")
                .and_then(|v| v.as_str())
                .map(|s| s.to_owned())
                .unwrap_or_else(|| collect_text_hir(children));
            let body = code.strip_suffix('\n').unwrap_or(&code);
            out.push_str(&format!("$$\n{}\n$$\n\n", body));
        }

        // GitLab footnote definition
        "footnote-def" => {
            let key = attrs.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let inner = render_inline(children);
            out.push_str(&format!("[^{}]: {}\n\n", key, inner.trim_end()));
        }

        // MultiMarkdown metadata
        "metadata" => {
            let key = attrs.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let value = attrs.get("value").and_then(|v| v.as_str()).unwrap_or("");
            out.push_str(&format!("{}: {}\n", key, value));
        }

        // Obsidian callout
        "callout" => {
            let callout_type = attrs.get("type").and_then(|v| v.as_str()).unwrap_or("NOTE");
            out.push_str(&format!("> [!{}]\n", callout_type));
        }

        // MyST directive
        "directive" => {
            let dir_name = attrs
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let args = attrs.get("args").and_then(|v| v.as_str());
            let code = collect_text_hir(children);
            let body = code.strip_suffix('\n').unwrap_or(&code);
            let header = match args {
                Some(a) if !a.is_empty() => format!("```{{{}}} {}", dir_name, a),
                _ => format!("```{{{}}}", dir_name),
            };
            out.push_str(&format!("{}\n{}\n```\n\n", header, body));
        }

        // MyST admonition
        "admonition" => {
            let adm_type = attrs.get("type").and_then(|v| v.as_str()).unwrap_or("note");
            let title = attrs.get("title").and_then(|v| v.as_str());
            let code = collect_text_hir(children);
            let body = code.strip_suffix('\n').unwrap_or(&code);
            let header = match title {
                Some(t) if !t.is_empty() => format!(":::{{{}}} {}", adm_type, t),
                _ => format!(":::{{{}}}", adm_type),
            };
            out.push_str(&format!("{}\n{}\n:::\n\n", header, body));
        }

        // MyST frontmatter
        "frontmatter" => {
            let key = attrs.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let value = attrs.get("value").and_then(|v| v.as_str()).unwrap_or("");
            out.push_str(&format!("{}: {}\n", key, value));
        }

        _ => {
            let inline = render_inline(children);
            if !inline.is_empty() {
                out.push_str(inline.trim_end());
                out.push_str("\n\n");
            }
        }
    }
}

fn render_container_node(name: &str, children: &[HirNode], out: &mut String, list_ctx: ListCtx) {
    match name {
        "ul" => {
            let mut inner = String::new();
            let ctx = ListCtx {
                list_type: 1,
                ordered_idx: 1,
            };
            for child in children {
                render_node(child, &mut inner, ctx);
            }
            if !inner.ends_with("\n\n") {
                inner.push('\n');
            }
            out.push_str(&inner);
        }
        "ol" => {
            let mut n = 1usize;
            let mut inner = String::new();
            for child in children {
                let ctx = ListCtx {
                    list_type: 2,
                    ordered_idx: n,
                };
                let before = inner.len();
                render_node(child, &mut inner, ctx);
                let added = &inner[before..];
                if added.is_empty() {
                    continue;
                } // marker blocks add no output
                let count = added
                    .lines()
                    .filter(|l| {
                        l.trim_start()
                            .chars()
                            .next()
                            .map_or(false, |c| c.is_ascii_digit())
                    })
                    .count();
                n += count.max(1);
            }
            if !inner.ends_with("\n\n") {
                inner.push('\n');
            }
            out.push_str(&inner);
        }
        s if s.starts_with("ol:") => {
            let start: usize = s["ol:".len()..].parse().unwrap_or(1);
            let mut n = start;
            let mut inner = String::new();
            for child in children {
                let ctx = ListCtx {
                    list_type: 2,
                    ordered_idx: n,
                };
                let before = inner.len();
                render_node(child, &mut inner, ctx);
                let added = &inner[before..];
                if added.is_empty() {
                    continue;
                } // marker blocks add no output
                let count = added
                    .lines()
                    .filter(|l| {
                        l.trim_start()
                            .chars()
                            .next()
                            .map_or(false, |c| c.is_ascii_digit())
                    })
                    .count();
                n += count.max(1);
            }
            if !inner.ends_with("\n\n") {
                inner.push('\n');
            }
            out.push_str(&inner);
        }
        "unordered-list-item" => {
            let item_ctx = ListCtx {
                list_type: 3,
                ordered_idx: 0,
            };
            let mut inner = String::new();
            for child in children {
                render_node(child, &mut inner, item_ctx);
            }
            let trimmed = inner.trim_end();
            let prefix = "- ";
            let indent = "  ";
            let mut first = true;
            for line in trimmed.lines() {
                if first {
                    out.push_str(&format!("{}{}\n", prefix, line));
                    first = false;
                } else {
                    out.push_str(&format!("{}{}\n", indent, line));
                }
            }
        }
        "ordered-list-item" => {
            let n = if list_ctx.list_type == 2 {
                list_ctx.ordered_idx
            } else {
                1
            };
            let item_ctx = ListCtx {
                list_type: 3,
                ordered_idx: 0,
            };
            let mut inner = String::new();
            for child in children {
                render_node(child, &mut inner, item_ctx);
            }
            let trimmed = inner.trim_end();
            let prefix = format!("{}. ", n);
            let indent_width = prefix.len();
            let indent: String = " ".repeat(indent_width);
            let mut first = true;
            for line in trimmed.lines() {
                if first {
                    out.push_str(&format!("{}{}\n", prefix, line));
                    first = false;
                } else {
                    out.push_str(&format!("{}{}\n", indent, line));
                }
            }
        }
        "blockquote" => {
            let mut inner = String::new();
            for child in children {
                render_node(child, &mut inner, list_ctx);
            }
            let trimmed = inner.trim_end();
            for line in trimmed.lines() {
                if line.is_empty() {
                    out.push_str(">\n");
                } else {
                    out.push_str(&format!("> {}\n", line));
                }
            }
            out.push_str("\n\n");
        }
        "dl" => {
            for child in children {
                render_node(child, out, list_ctx);
            }
            out.push('\n');
        }
        _ => {
            for child in children {
                render_node(child, out, list_ctx);
            }
        }
    }
}

pub fn do_export(doc_json: &str, registry: &LexiconRegistry) -> String {
    let doc = match serde_atproto::from_json(doc_json) {
        Ok(d) => d,
        Err(_) => return String::new(),
    };
    let nodes = build_hir_from_doc(&doc, registry);
    let mut out = String::new();
    let ctx = ListCtx::none();

    // Collect frontmatter blocks and render them wrapped in ---
    let mut in_frontmatter = true;
    let mut fm_buf = String::new();
    for node in &nodes {
        if in_frontmatter {
            if let HirNode::Block { name, .. } = node {
                if name == "frontmatter" {
                    render_node(node, &mut fm_buf, ctx);
                    continue;
                }
            }
            // Done with frontmatter
            in_frontmatter = false;
            if !fm_buf.is_empty() {
                out.push_str("---\n");
                out.push_str(&fm_buf);
                out.push_str("---\n\n");
            }
        }
        render_node(node, &mut out, ctx);
    }
    // Handle case where document is only frontmatter
    if in_frontmatter && !fm_buf.is_empty() {
        out.push_str("---\n");
        out.push_str(&fm_buf);
        out.push_str("---\n\n");
    }

    while out.ends_with("\n\n") {
        out.pop();
    }
    out
}
