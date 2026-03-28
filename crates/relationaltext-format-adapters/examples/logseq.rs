//! Logseq Markdown format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `com.logseq.facet`
//!
//! Import: parses the bullet-indented Markdown format produced by Logseq's graph export.
//! Each `- ` line becomes a `com.logseq.facet#block` feature. Inline markup
//! (bold, italic, strikethrough, code, page refs, block refs, tags, links) is
//! parsed and emitted as inline features.
//!
//! Export: walks HIR and rebuilds indented bullet Markdown.
//!
//! WASM exports: `import_logseq` and `export_logseq`

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "com.logseq.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/com.logseq/logseq.lexicon.json");

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
pub extern "C" fn import_logseq(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_import(input);
    write_result(result)
}

#[no_mangle]
pub extern "C" fn export_logseq(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_export(input);
    write_result(result)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/// Emit a block marker (U+FFFC for the first block, '\n' for subsequent) and
/// register the corresponding block feature. Block attrs go under "attrs" key.
fn open_block(state: &mut ImportState, name: &str, parents: &[String], attrs: Value) {
    let marker = if state.text.is_empty() {
        '\u{FFFC}'
    } else {
        '\n'
    };
    let s = state.text.len();
    state.text.push(marker);
    let e = state.text.len();

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
        "index": { "byteStart": s, "byteEnd": e },
        "features": [feature],
    }));
}

/// Emit an inline mark: inline attrs go FLAT on the feature object.
fn push_inline_mark(state: &mut ImportState, content: &str, name: &str) {
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

/// Emit an inline entity with extra flat attrs on the feature object.
fn push_inline_entity(state: &mut ImportState, display: &str, name: &str, extra: Value) {
    if display.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(display);
    let e = state.text.len();
    let mut feat = json!({ "$type": TYPE_ID, "name": name });
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

// ─── Inline scanner ────────────────────────────────────────────────────────────

/// Scan one line of Logseq Markdown for inline markup.
/// Handles: **bold**, *italic*, ~~strike~~, `code`, [[page-ref]], ((block-ref)),
/// #[[tag with spaces]], #word, [text](url), plain text.
fn scan_inline(line: &str, state: &mut ImportState) {
    let chars: Vec<char> = line.chars().collect();
    let n = chars.len();
    let mut i = 0;

    // Accumulate plain text characters between markup spans.
    let mut plain_chars: Vec<char> = Vec::new();

    macro_rules! flush_plain {
        () => {
            if !plain_chars.is_empty() {
                let s: String = plain_chars.drain(..).collect();
                state.text.push_str(&s);
            }
        };
    }

    while i < n {
        // **bold**
        if chars[i] == '*' && i + 1 < n && chars[i + 1] == '*' {
            if let Some(close) = find_two_char(&chars, i + 2, '*', '*') {
                flush_plain!();
                let content: String = chars[i + 2..close].iter().collect();
                push_inline_mark(state, &content, "bold");
                i = close + 2;
                continue;
            }
        }

        // *italic* (single star, not double)
        if chars[i] == '*' && (i == 0 || chars[i - 1] != '*') {
            // ensure it's not the start of ** bold **
            let is_double = i + 1 < n && chars[i + 1] == '*';
            if !is_double {
                if let Some(close) = find_single_char_not_double(&chars, i + 1, '*') {
                    flush_plain!();
                    let content: String = chars[i + 1..close].iter().collect();
                    push_inline_mark(state, &content, "italic");
                    i = close + 1;
                    continue;
                }
            }
        }

        // ~~strikethrough~~
        if chars[i] == '~' && i + 1 < n && chars[i + 1] == '~' {
            if let Some(close) = find_two_char(&chars, i + 2, '~', '~') {
                flush_plain!();
                let content: String = chars[i + 2..close].iter().collect();
                push_inline_mark(state, &content, "strikethrough");
                i = close + 2;
                continue;
            }
        }

        // `code`
        if chars[i] == '`' {
            if let Some(close) = find_char(&chars, i + 1, '`') {
                flush_plain!();
                let content: String = chars[i + 1..close].iter().collect();
                push_inline_mark(state, &content, "code");
                i = close + 1;
                continue;
            }
        }

        // #[[tag with spaces]]
        if chars[i] == '#' && i + 1 < n && chars[i + 1] == '[' && i + 2 < n && chars[i + 2] == '[' {
            if let Some(close) = find_two_char(&chars, i + 3, ']', ']') {
                flush_plain!();
                let tag_name: String = chars[i + 3..close].iter().collect();
                let display = format!("#{}", tag_name);
                let extra = json!({ "tagName": tag_name });
                push_inline_entity(state, &display, "tag", extra);
                i = close + 2;
                continue;
            }
        }

        // [[page-ref]]
        if chars[i] == '[' && i + 1 < n && chars[i + 1] == '[' {
            if let Some(close) = find_two_char(&chars, i + 2, ']', ']') {
                flush_plain!();
                let page_name: String = chars[i + 2..close].iter().collect();
                let extra = json!({ "title": page_name });
                push_inline_entity(state, &page_name, "page-ref", extra);
                i = close + 2;
                continue;
            }
        }

        // ((block-ref))
        if chars[i] == '(' && i + 1 < n && chars[i + 1] == '(' {
            if let Some(close) = find_two_char(&chars, i + 2, ')', ')') {
                flush_plain!();
                let uuid: String = chars[i + 2..close].iter().collect();
                let display = format!("(({}))", uuid);
                let extra = json!({ "uuid": uuid });
                push_inline_entity(state, &display, "block-ref", extra);
                i = close + 2;
                continue;
            }
        }

        // [text](url)
        if chars[i] == '[' {
            if let Some(close_bracket) = find_char(&chars, i + 1, ']') {
                let link_text: String = chars[i + 1..close_bracket].iter().collect();
                let after = close_bracket + 1;
                if after < n && chars[after] == '(' {
                    if let Some(close_paren) = find_char(&chars, after + 1, ')') {
                        flush_plain!();
                        let url: String = chars[after + 1..close_paren].iter().collect();
                        let extra = json!({ "uri": url });
                        push_inline_entity(state, &link_text, "link", extra);
                        i = close_paren + 1;
                        continue;
                    }
                }
            }
        }

        // #word (simple hashtag: alphanumeric or _ or -)
        if chars[i] == '#' && i + 1 < n && (chars[i + 1].is_alphanumeric() || chars[i + 1] == '_') {
            flush_plain!();
            let word_start = i + 1;
            let word_end = chars[word_start..]
                .iter()
                .take_while(|&&c| c.is_alphanumeric() || c == '_' || c == '-')
                .count()
                + word_start;
            let tag_word: String = chars[word_start..word_end].iter().collect();
            let display = format!("#{}", tag_word);
            let extra = json!({ "tagName": tag_word });
            push_inline_entity(state, &display, "tag", extra);
            i = word_end;
            continue;
        }

        plain_chars.push(chars[i]);
        i += 1;
    }

    flush_plain!();
}

// ─── Char-based search helpers ─────────────────────────────────────────────────

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

/// Find a single occurrence of `target` that is not immediately followed by another `target`.
fn find_single_char_not_double(chars: &[char], start: usize, target: char) -> Option<usize> {
    let mut i = start;
    while i < chars.len() {
        if chars[i] == target {
            // Make sure we aren't looking at **
            let next_is_same = i + 1 < chars.len() && chars[i + 1] == target;
            if !next_is_same {
                return Some(i);
            }
            // Skip both chars of the double
            i += 2;
            continue;
        }
        i += 1;
    }
    None
}

// ─── Indent detection ──────────────────────────────────────────────────────────

/// Detect indent depth: each tab = 1 level, every 2 spaces = 1 level.
fn detect_indent(line: &str) -> usize {
    let mut spaces = 0usize;
    let mut tabs = 0usize;
    for ch in line.chars() {
        if ch == ' ' {
            spaces += 1;
        } else if ch == '\t' {
            tabs += 1;
        } else {
            break;
        }
    }
    tabs + spaces / 2
}

/// Build a parents array of `depth` entries all equal to `"block"`.
fn build_parents(depth: usize) -> Vec<String> {
    vec!["block".to_owned(); depth]
}

// ─── Import ────────────────────────────────────────────────────────────────────

fn do_import(raw: &str) -> String {
    // Input may be wrapped in DocumentJSON { text: "..." } or raw text.
    let text = if raw.trim_start().starts_with('{') {
        let outer: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
        outer["text"]
            .as_str()
            .map(|s| s.to_owned())
            .unwrap_or_else(|| raw.to_owned())
    } else {
        raw.to_owned()
    };

    let mut state = ImportState::new();

    for line in text.split('\n') {
        // Skip empty lines
        if line.trim().is_empty() {
            continue;
        }

        let depth = detect_indent(line);
        let stripped = line.trim_start();

        // Must be a bullet line: - , * , or + followed by space
        let bullet_content = if stripped.starts_with("- ") {
            &stripped[2..]
        } else if stripped.starts_with("* ") {
            &stripped[2..]
        } else if stripped.starts_with("+ ") {
            &stripped[2..]
        } else {
            // Non-bullet lines are skipped (Logseq export is always indented bullets)
            continue;
        };

        let parents = build_parents(depth);

        // Check for property line: key:: value
        if let Some((key, value)) = parse_property(bullet_content) {
            let attrs = json!({ "key": key, "value": value });
            open_block(&mut state, "property", &parents, attrs);
            // Property blocks have no inline content
            continue;
        }

        // Check for TODO / DONE prefix
        let mut content = bullet_content;
        let mut block_attrs = json!({});

        if let Some(rest) = content.strip_prefix("TODO ") {
            block_attrs["todo"] = Value::String("TODO".to_owned());
            content = rest;
        } else if let Some(rest) = content.strip_prefix("DONE ") {
            block_attrs["todo"] = Value::String("DONE".to_owned());
            content = rest;
        }

        open_block(&mut state, "block", &parents, block_attrs);
        scan_inline(content, &mut state);
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

/// Parse `key:: value` — returns `(key, value)` if the pattern matches.
fn parse_property(content: &str) -> Option<(String, String)> {
    let sep = ":: ";
    if let Some(idx) = content.find(sep) {
        let key = &content[..idx];
        // Key must be word characters: alphanumeric or `-`
        if !key.is_empty()
            && key
                .chars()
                .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
        {
            let value = content[idx + sep.len()..].trim().to_owned();
            if !value.is_empty() {
                return Some((key.to_owned(), value));
            }
        }
    }
    None
}

// ─── Export ────────────────────────────────────────────────────────────────────

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    match mark.kind.as_str() {
        "com.logseq.facet#bold" => format!("**{}**", content),
        "com.logseq.facet#italic" => format!("*{}*", content),
        "com.logseq.facet#strikethrough" => format!("~~{}~~", content),
        "com.logseq.facet#code" => format!("`{}`", content),
        "com.logseq.facet#page-ref" => {
            // The content IS the page title; emit [[title]]
            format!("[[{}]]", content)
        }
        "com.logseq.facet#block-ref" => {
            // The content is the display "((uuid))"; emit as-is or reconstruct
            let uuid = mark
                .attrs
                .get("uuid")
                .and_then(|v| v.as_str())
                .unwrap_or(content);
            format!("(({}))", uuid)
        }
        "com.logseq.facet#tag" => {
            let tag_name = mark
                .attrs
                .get("tagName")
                .and_then(|v| v.as_str())
                .unwrap_or(content);
            format!("#{}", tag_name)
        }
        "com.logseq.facet#link" => {
            let uri = mark
                .attrs
                .get("uri")
                .or_else(|| mark.attrs.get("url"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("[{}]({})", content, uri)
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

/// Compute nesting depth from the HIR node's parent container chain.
/// In the HIR, `parents` depth is encoded in the Container hierarchy above a block.
/// We track it via the `depth` parameter threaded through render_node calls.
fn render_node(node: &HirNode, out: &mut String, depth: usize) {
    match node {
        HirNode::Block {
            name,
            attrs,
            children,
        } => {
            match name.as_str() {
                "block" => {
                    let indent = "  ".repeat(depth);
                    let inner = render_inline(children);
                    // Reconstruct TODO/DONE prefix
                    let todo_prefix = attrs
                        .get("todo")
                        .and_then(|v| v.as_str())
                        .map(|t| format!("{} ", t))
                        .unwrap_or_default();
                    out.push_str(&format!("{}- {}{}\n", indent, todo_prefix, inner));
                }
                "property" => {
                    let indent = "  ".repeat(depth);
                    let key = attrs.get("key").and_then(|v| v.as_str()).unwrap_or("key");
                    let value = attrs.get("value").and_then(|v| v.as_str()).unwrap_or("");
                    out.push_str(&format!("{}- {}:: {}\n", indent, key, value));
                }
                _ => {
                    // Fallback: render inline content as a bullet
                    let indent = "  ".repeat(depth);
                    let inner = render_inline(children);
                    if !inner.is_empty() {
                        out.push_str(&format!("{}- {}\n", indent, inner));
                    }
                }
            }
        }
        HirNode::Container { children, .. } => {
            // Container nodes represent the nesting created by parents[].
            // Depth increases by 1 for each container level.
            for child in children {
                render_node(child, out, depth + 1);
            }
        }
        HirNode::Text { .. } => {
            // Top-level bare text (no block) — ignore in Logseq format
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
        render_node(node, &mut out, 0);
    }
    // Strip trailing newline to match TS behaviour
    if out.ends_with('\n') {
        out.pop();
    }
    out
}
