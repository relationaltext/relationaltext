//! DokuWiki markup format adapter: import and export for RelationalText documents.
//!
//! Format namespace: `org.dokuwiki.facet`
//! Inline: **bold**, //italic//, __underline__, ''monospace'', <del>strikethrough</del>
//! Entities: [[wikilink]], [[page|display]], [[https://url]], {{image}}, \\
//! Block: paragraph, heading (==h1== through ======h6======), code-block,
//!        blockquote-marker, bullet-list-marker, ordered-list-marker,
//!        list-item-marker, list-item-text, horizontal-rule

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "org.dokuwiki.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/org.dokuwiki/dokuwiki.lexicon.json");

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
pub extern "C" fn import_dokuwiki(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_import(input);
    write_result(result)
}

#[no_mangle]
pub extern "C" fn export_dokuwiki(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_export(input);
    write_result(result)
}

// ─── Import state ─────────────────────────────────────────────────────────────

struct ImportState {
    text: String,
    facets: Vec<Value>,
    prev_list_type: u8, // 0=none, 1=bullet, 2=ordered
}

impl ImportState {
    fn new() -> Self {
        Self {
            text: String::new(),
            facets: Vec::new(),
            prev_list_type: 0,
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

fn push_mark(state: &mut ImportState, content: &str, name: &str) {
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

fn push_entity(state: &mut ImportState, display: &str, feature: Value) {
    if display.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(display);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [feature],
    }));
}

fn push_entity_placeholder(state: &mut ImportState, feature: Value) {
    // Use a newline as placeholder — zero-width is not easily done in UTF-8
    // but we use '\n' only outside blocks. We actually use a single space as
    // placeholder for inline entities with no visible text (line-break char).
    // The TS uses state.text += '\n' for line-break entity.
    let s = state.text.len();
    state.text.push('\n');
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [feature],
    }));
}

// ─── DokuWiki inline scanner ───────────────────────────────────────────────────
//
// Scans one line of DokuWiki markup for inline patterns and appends to state.
// Pattern priority (left-to-right, first match wins):
//   **bold**  //italic//  __underline__  ''monospace''  <del>strikethrough</del>
//   [[target|display]]  [[target]]  {{src|alt}}  {{src}}
//   \\  (forced line break)
//   %%literal%%  <nowiki>literal</nowiki>
//   plain text

fn walk_inline(line: &str, state: &mut ImportState) {
    let bytes = line.as_bytes();
    let len = bytes.len();
    let mut pos = 0;
    let mut plain_start = 0;

    macro_rules! flush_plain {
        ($end:expr) => {
            if plain_start < $end {
                state.text.push_str(&line[plain_start..$end]);
            }
        };
    }

    while pos < len {
        // **bold**
        if bytes[pos] == b'*' && pos + 1 < len && bytes[pos + 1] == b'*' {
            if let Some(close) = find_delim(&line[pos + 2..], "**") {
                flush_plain!(pos);
                let content = &line[pos + 2..pos + 2 + close];
                push_mark(state, content, "bold");
                pos = pos + 2 + close + 2;
                plain_start = pos;
                continue;
            }
        }

        // //italic//
        if bytes[pos] == b'/' && pos + 1 < len && bytes[pos + 1] == b'/' {
            if let Some(close) = find_delim(&line[pos + 2..], "//") {
                flush_plain!(pos);
                let content = &line[pos + 2..pos + 2 + close];
                push_mark(state, content, "italic");
                pos = pos + 2 + close + 2;
                plain_start = pos;
                continue;
            }
        }

        // __underline__
        if bytes[pos] == b'_' && pos + 1 < len && bytes[pos + 1] == b'_' {
            if let Some(close) = find_delim(&line[pos + 2..], "__") {
                flush_plain!(pos);
                let content = &line[pos + 2..pos + 2 + close];
                push_mark(state, content, "underline");
                pos = pos + 2 + close + 2;
                plain_start = pos;
                continue;
            }
        }

        // ''monospace''
        if bytes[pos] == b'\'' && pos + 1 < len && bytes[pos + 1] == b'\'' {
            if let Some(close) = find_delim(&line[pos + 2..], "''") {
                flush_plain!(pos);
                let content = &line[pos + 2..pos + 2 + close];
                push_mark(state, content, "monospace");
                pos = pos + 2 + close + 2;
                plain_start = pos;
                continue;
            }
        }

        // <del>strikethrough</del>
        if line[pos..].starts_with("<del>") {
            if let Some(close) = line[pos + 5..].find("</del>") {
                flush_plain!(pos);
                let content = &line[pos + 5..pos + 5 + close];
                push_mark(state, content, "strikethrough");
                pos = pos + 5 + close + 6;
                plain_start = pos;
                continue;
            }
        }

        // [[target|display]] or [[target]]
        if bytes[pos] == b'[' && pos + 1 < len && bytes[pos + 1] == b'[' {
            if let Some(close_rel) = line[pos + 2..].find("]]") {
                flush_plain!(pos);
                let inner = &line[pos + 2..pos + 2 + close_rel];
                if let Some(pipe) = inner.find('|') {
                    let target = &inner[..pipe];
                    let display = &inner[pipe + 1..];
                    let is_external =
                        target.starts_with("http://") || target.starts_with("https://");
                    if is_external {
                        push_entity(
                            state,
                            display,
                            json!({
                                "$type": TYPE_ID, "name": "extlink", "uri": target
                            }),
                        );
                    } else {
                        push_entity(
                            state,
                            display,
                            json!({
                                "$type": TYPE_ID, "name": "wikilink", "page": target, "display": display
                            }),
                        );
                    }
                } else {
                    let target = inner;
                    let is_external =
                        target.starts_with("http://") || target.starts_with("https://");
                    if is_external {
                        push_entity(
                            state,
                            target,
                            json!({
                                "$type": TYPE_ID, "name": "extlink", "uri": target
                            }),
                        );
                    } else {
                        push_entity(
                            state,
                            target,
                            json!({
                                "$type": TYPE_ID, "name": "wikilink", "page": target
                            }),
                        );
                    }
                }
                pos = pos + 2 + close_rel + 2;
                plain_start = pos;
                continue;
            }
        }

        // {{src|alt}} or {{src}}
        if bytes[pos] == b'{' && pos + 1 < len && bytes[pos + 1] == b'{' {
            if let Some(close_rel) = line[pos + 2..].find("}}") {
                flush_plain!(pos);
                let inner = &line[pos + 2..pos + 2 + close_rel];
                // Find first | that's not part of a nested construct
                if let Some(pipe) = inner.find('|') {
                    let src = &inner[..pipe];
                    let alt = &inner[pipe + 1..];
                    let display = if !alt.is_empty() { alt } else { src };
                    push_entity(
                        state,
                        display,
                        json!({
                            "$type": TYPE_ID, "name": "image", "src": src, "alt": alt
                        }),
                    );
                } else {
                    let src = inner;
                    push_entity(
                        state,
                        src,
                        json!({
                            "$type": TYPE_ID, "name": "image", "src": src
                        }),
                    );
                }
                pos = pos + 2 + close_rel + 2;
                plain_start = pos;
                continue;
            }
        }

        // \\ (forced line break — two backslashes)
        if bytes[pos] == b'\\' && pos + 1 < len && bytes[pos + 1] == b'\\' {
            flush_plain!(pos);
            push_entity_placeholder(
                state,
                json!({
                    "$type": TYPE_ID, "name": "line-break"
                }),
            );
            pos = pos + 2;
            plain_start = pos;
            continue;
        }

        // %%literal%% — no-parse, emit as plain text
        if line[pos..].starts_with("%%") {
            if let Some(close) = line[pos + 2..].find("%%") {
                flush_plain!(pos);
                state.text.push_str(&line[pos + 2..pos + 2 + close]);
                pos = pos + 2 + close + 2;
                plain_start = pos;
                continue;
            }
        }

        // <nowiki>literal</nowiki> — no-parse, emit as plain text
        if line[pos..].starts_with("<nowiki>") {
            if let Some(close) = line[pos + 8..].find("</nowiki>") {
                flush_plain!(pos);
                state.text.push_str(&line[pos + 8..pos + 8 + close]);
                pos = pos + 8 + close + 9;
                plain_start = pos;
                continue;
            }
        }

        // Advance by one UTF-8 character
        pos += utf8_char_len(bytes[pos]);
    }

    // Flush any remaining plain text
    if plain_start < len {
        state.text.push_str(&line[plain_start..]);
    }
}

/// Find the byte offset of `delim` in `s`, returning `None` if not found.
fn find_delim(s: &str, delim: &str) -> Option<usize> {
    s.find(delim)
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

// ─── Import ────────────────────────────────────────────────────────────────────

fn do_import(raw: &str) -> String {
    // Accept either a plain text string or a JSON object with a "text" field.
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
    let lines: Vec<&str> = text.split('\n').collect();

    let mut i = 0;
    let mut in_code_block = false;
    let mut code_lines: Vec<&str> = Vec::new();
    let mut code_lang: Option<&str> = None;
    let mut in_blockquote_tag = false;

    while i < lines.len() {
        let line = lines[i];

        // ── <blockquote>...</blockquote> tag handling ─────────────────────────
        if !in_code_block && (line.trim() == "<blockquote>" || line.starts_with("<blockquote>")) {
            in_blockquote_tag = true;
            state.prev_list_type = 0;
            open_block(&mut state, "blockquote-marker", &[]);
            open_block(&mut state, "paragraph", &["blockquote"]);
            let inner = line
                .trim_start_matches("<blockquote>")
                .trim_end_matches("</blockquote>")
                .trim();
            if !inner.is_empty() {
                walk_inline(inner, &mut state);
            }
            if line.contains("</blockquote>") {
                in_blockquote_tag = false;
            }
            i += 1;
            continue;
        }

        if in_blockquote_tag {
            if line.contains("</blockquote>") {
                in_blockquote_tag = false;
            } else {
                walk_inline(line, &mut state);
            }
            i += 1;
            continue;
        }

        // ── <code ...>...</code> block handling ───────────────────────────────
        if !in_code_block {
            // Match <code> or <code lang>
            if let Some(rest) = strip_code_open(line) {
                in_code_block = true;
                code_lines = Vec::new();
                code_lang = rest.lang;
                if let Some(after) = rest.after {
                    if let Some(close) = after.find("</code>") {
                        // Single-line code block
                        in_code_block = false;
                        let code_content = &after[..close];
                        let attrs = code_lang_attrs(code_lang);
                        state.prev_list_type = 0;
                        open_block_attrs(&mut state, "code-block", &[], attrs);
                        state.text.push_str(code_content);
                        state.text.push('\n');
                        code_lang = None;
                        i += 1;
                        continue;
                    }
                }
                i += 1;
                continue;
            }
        }

        if in_code_block {
            if line.contains("</code>") {
                in_code_block = false;
                let before = &line[..line.find("</code>").unwrap()];
                if !before.is_empty() {
                    code_lines.push(before);
                }
                let code_content = code_lines.join("\n");
                let attrs = code_lang_attrs(code_lang);
                state.prev_list_type = 0;
                open_block_attrs(&mut state, "code-block", &[], attrs);
                state.text.push_str(&code_content);
                state.text.push('\n');
                code_lines = Vec::new();
                code_lang = None;
            } else {
                code_lines.push(line);
            }
            i += 1;
            continue;
        }

        // ── Heading: ={2,6} text ={2,6} ──────────────────────────────────────
        if let Some((level, content)) = parse_heading(line) {
            state.prev_list_type = 0;
            open_block_attrs(&mut state, "heading", &[], json!({ "level": level }));
            walk_inline(content, &mut state);
            i += 1;
            continue;
        }

        // ── Horizontal rule: ----+ ────────────────────────────────────────────
        if is_horizontal_rule(line) {
            state.prev_list_type = 0;
            open_block(&mut state, "horizontal-rule", &[]);
            i += 1;
            continue;
        }

        // ── Bullet list: 2+ spaces + * + space ───────────────────────────────
        if let Some((indent, content)) = parse_bullet(line) {
            let nest_level = indent / 2;
            if state.prev_list_type != 1 {
                open_block(&mut state, "bullet-list-marker", &[]);
            }
            open_block(&mut state, "list-item-marker", &["ul"]);
            open_block(&mut state, "list-item-text", &["ul", "unordered-list-item"]);
            // The TS code builds parents for deeper nesting but uses ["ul","unordered-list-item"]
            // for the actual block calls regardless of nest_level in the reference impl.
            // nest_level is captured but the TS always uses those two parents.
            let _ = nest_level;
            walk_inline(content, &mut state);
            state.prev_list_type = 1;
            i += 1;
            continue;
        }

        // ── Ordered list: 2+ spaces + - + space ──────────────────────────────
        if let Some((indent, content)) = parse_ordered(line) {
            let nest_level = indent / 2;
            if state.prev_list_type != 2 {
                open_block(&mut state, "ordered-list-marker", &[]);
            }
            open_block(&mut state, "list-item-marker", &["ol"]);
            open_block(&mut state, "list-item-text", &["ol", "ordered-list-item"]);
            let _ = nest_level;
            walk_inline(content, &mut state);
            state.prev_list_type = 2;
            i += 1;
            continue;
        }

        // ── Blockquote: > text ────────────────────────────────────────────────
        if line.starts_with("> ") {
            let content = &line[2..];
            state.prev_list_type = 0;
            open_block(&mut state, "blockquote-marker", &[]);
            open_block(&mut state, "paragraph", &["blockquote"]);
            walk_inline(content, &mut state);
            i += 1;
            continue;
        }

        // ── Empty line — skip ─────────────────────────────────────────────────
        if line.trim().is_empty() {
            state.prev_list_type = 0;
            i += 1;
            continue;
        }

        // ── Regular paragraph ─────────────────────────────────────────────────
        state.prev_list_type = 0;
        open_block(&mut state, "paragraph", &[]);
        walk_inline(line, &mut state);
        i += 1;
    }

    // Flush unclosed code block at EOF
    if in_code_block && !code_lines.is_empty() {
        let code_content = code_lines.join("\n");
        let attrs = code_lang_attrs(code_lang);
        open_block_attrs(&mut state, "code-block", &[], attrs);
        state.text.push_str(&code_content);
        state.text.push('\n');
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

struct CodeOpenResult<'a> {
    lang: Option<&'a str>,
    after: Option<&'a str>,
}

fn strip_code_open(line: &str) -> Option<CodeOpenResult<'_>> {
    if line.starts_with("<code>") {
        Some(CodeOpenResult {
            lang: None,
            after: Some(&line[6..]),
        })
    } else if line.starts_with("<code ") {
        // <code lang>
        if let Some(close_bracket) = line.find('>') {
            let lang_str = &line[6..close_bracket];
            let lang = if lang_str.trim().is_empty() {
                None
            } else {
                Some(lang_str.trim())
            };
            Some(CodeOpenResult {
                lang,
                after: Some(&line[close_bracket + 1..]),
            })
        } else {
            None
        }
    } else {
        None
    }
}

fn code_lang_attrs(lang: Option<&str>) -> Value {
    match lang {
        Some(l) if !l.is_empty() => json!({ "language": l }),
        _ => json!({}),
    }
}

/// Parse a DokuWiki heading line. Returns (level, content_str).
/// DokuWiki: ====== h1 ====== (6 equals = level 1), == h5 == (2 equals = level 5).
/// level = 7 - equalsCount (capped 1..=5).
fn parse_heading(line: &str) -> Option<(u32, &str)> {
    // Require at least 2 leading =
    if !line.starts_with("==") {
        return None;
    }
    let eq_count = line.bytes().take_while(|&b| b == b'=').count();
    if eq_count < 2 {
        return None;
    }
    let rest = &line[eq_count..];
    // Must end with matching = signs
    let trimmed = rest.trim_end();
    let trailing = trimmed.bytes().rev().take_while(|&b| b == b'=').count();
    if trailing < 2 {
        return None;
    }
    let content = trimmed[..trimmed.len() - trailing].trim();
    if content.is_empty() {
        return None;
    }
    let level = (7u32).saturating_sub(eq_count as u32).max(1);
    Some((level, content))
}

fn is_horizontal_rule(line: &str) -> bool {
    let t = line.trim_end();
    t.len() >= 4 && t.bytes().all(|b| b == b'-')
}

/// Parse DokuWiki bullet: 2+ spaces + "* " + content. Returns (indent, content).
fn parse_bullet(line: &str) -> Option<(usize, &str)> {
    let indent = line.bytes().take_while(|&b| b == b' ').count();
    if indent < 2 {
        return None;
    }
    let rest = &line[indent..];
    if rest.starts_with("* ") {
        Some((indent, &rest[2..]))
    } else {
        None
    }
}

/// Parse DokuWiki ordered: 2+ spaces + "- " + content. Returns (indent, content).
fn parse_ordered(line: &str) -> Option<(usize, &str)> {
    let indent = line.bytes().take_while(|&b| b == b' ').count();
    if indent < 2 {
        return None;
    }
    let rest = &line[indent..];
    if rest.starts_with("- ") {
        Some((indent, &rest[2..]))
    } else {
        None
    }
}

// ─── Export ────────────────────────────────────────────────────────────────────

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    match mark.kind.as_str() {
        "org.dokuwiki.facet#bold" => format!("**{}**", content),
        "org.dokuwiki.facet#italic" => format!("//{}//", content),
        "org.dokuwiki.facet#underline" => format!("__{}__", content),
        "org.dokuwiki.facet#strikethrough" => format!("<del>{}</del>", content),
        "org.dokuwiki.facet#monospace" => format!("''{}''", content),
        "org.dokuwiki.facet#wikilink" => {
            let page = mark
                .attrs
                .get("page")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let display = mark
                .attrs
                .get("display")
                .and_then(|v| v.as_str())
                .unwrap_or(content);
            if !display.is_empty() && display != page {
                format!("[[{}|{}]]", page, display)
            } else {
                format!("[[{}]]", page)
            }
        }
        "org.dokuwiki.facet#extlink" => {
            let uri = mark.attrs.get("uri").and_then(|v| v.as_str()).unwrap_or("");
            if !content.is_empty() && content != uri {
                format!("[[{}|{}]]", uri, content)
            } else {
                format!("[[{}]]", uri)
            }
        }
        "org.dokuwiki.facet#image" => {
            let src = mark.attrs.get("src").and_then(|v| v.as_str()).unwrap_or("");
            let alt = mark.attrs.get("alt").and_then(|v| v.as_str());
            if let Some(alt) = alt {
                format!("{{{{{}|{}}}}}", src, alt)
            } else {
                format!("{{{{{}}}}}", src)
            }
        }
        "org.dokuwiki.facet#line-break" => "\\\\".to_owned(),
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

fn render_node(node: &HirNode, out: &mut String, list_type: &mut u8) {
    match node {
        HirNode::Block {
            name,
            attrs,
            children,
        } => match name.as_str() {
            "blockquote-marker"
            | "bullet-list-marker"
            | "ordered-list-marker"
            | "list-item-marker" => {
                // Invisible separator — no output
            }
            "paragraph" => {
                let inner = render_inline(children);
                out.push_str(&inner);
                out.push('\n');
                *list_type = 0;
            }
            "heading" => {
                let level = attrs.get("level").and_then(|v| v.as_u64()).unwrap_or(1) as u32;
                // DokuWiki: level 1 = ====== (6 equals), level 5 = == (2 equals)
                let eq_count = (7u32.saturating_sub(level)).max(2) as usize;
                let eq = "=".repeat(eq_count);
                let inner = render_inline(children);
                out.push_str(&format!("{} {} {}\n", eq, inner, eq));
                *list_type = 0;
            }
            "code-block" => {
                let lang = attrs.get("language").and_then(|v| v.as_str()).unwrap_or("");
                let code = collect_text(children);
                let body = code.strip_suffix('\n').unwrap_or(&code);
                let open_tag = if !lang.is_empty() {
                    format!("<code {}>", lang)
                } else {
                    "<code>".to_owned()
                };
                out.push_str(&format!("{}\n{}\n</code>\n", open_tag, body));
                *list_type = 0;
            }
            "list-item-text" => {
                let inner = render_inline(children);
                if *list_type == 2 {
                    out.push_str(&format!("  - {}\n", inner));
                } else {
                    out.push_str(&format!("  * {}\n", inner));
                }
            }
            "horizontal-rule" => {
                out.push_str("----\n");
                *list_type = 0;
            }
            _ => {
                let inner = render_inline(children);
                if !inner.is_empty() {
                    out.push_str(&inner);
                    out.push('\n');
                }
                *list_type = 0;
            }
        },
        HirNode::Container { name, children, .. } => {
            let saved = *list_type;
            match name.as_str() {
                "ul" => *list_type = 1,
                "ol" => *list_type = 2,
                _ => {}
            }
            for child in children {
                render_node(child, out, list_type);
            }
            if name != "ul" && name != "ol" {
                *list_type = saved;
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
    let mut list_type: u8 = 0;
    for node in &nodes {
        render_node(node, &mut out, &mut list_type);
    }
    if out.ends_with('\n') {
        out.pop();
    }
    out
}
