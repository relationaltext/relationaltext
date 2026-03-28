//! Markdoc format adapter: import and export for RelationalText documents.
//!
//! Markdoc is Stripe's CommonMark-based content authoring format. It extends
//! CommonMark with structured tags, variables, conditionals, and frontmatter.
//!
//! Import supports:
//! - YAML frontmatter (---…---) → `frontmatter` blocks with attrs: { key, value }
//! - Block tags ({% tagname key="val" %} … {% /tagname %}) → `tag` blocks
//! - Self-closing block tags ({% tagname … /%}) → `tag` blocks with selfClosing:true
//! - Conditional ({% if $cond %} … {% /if %}) → `conditional` blocks
//! - Heading id annotations (## Title {% #my-id %})
//! - Paragraph class annotations (text {% .class %})
//! - Inline variables ({% $varname %}) → `variable` entities
//! - Inline self-closing tags ({% tagname /%}) → `inline-tag` entities
//! - Standard CommonMark blocks and inline marks
//!
//! Format namespace: `com.markdoc.facet`
//! WASM exports: `import_markdoc` and `export_markdoc`

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "com.markdoc.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/com.markdoc/markdoc.lexicon.json");

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
pub extern "C" fn import_markdoc(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_import(input);
    write_result(result)
}

#[no_mangle]
pub extern "C" fn export_markdoc(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_export(input);
    write_result(result)
}

// ─── Import state ─────────────────────────────────────────────────────────────

struct ImportState {
    text: String,
    facets: Vec<Value>,
    /// 0=none, 1=bullet, 2=ordered
    prev_list_type: u8,
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

// ─── Block helpers ────────────────────────────────────────────────────────────

/// Emit a block marker (U+FFFC for first block, '\n' for subsequent) and
/// register the feature. Block attrs go under the nested "attrs" key.
fn open_block(state: &mut ImportState, name: &str, parents: &[&str], attrs: Value) {
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

// ─── Inline helpers ───────────────────────────────────────────────────────────

/// Emit plain text with a named inline mark. No attrs variant.
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

/// Emit a link with flat `uri` (and optional `title`) attrs.
fn push_link(state: &mut ImportState, display: &str, uri: &str, title: Option<&str>) {
    if display.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(display);
    let e = state.text.len();
    let mut feat = json!({ "$type": TYPE_ID, "name": "link", "uri": uri });
    if let Some(t) = title {
        feat["title"] = Value::String(t.to_owned());
    }
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [feat],
    }));
}

/// Emit an image with flat `src`, `alt` (and optional `title`) attrs.
fn push_image(state: &mut ImportState, alt: &str, src: &str, title: Option<&str>) {
    let placeholder = if alt.is_empty() { "\u{200B}" } else { alt };
    let s = state.text.len();
    state.text.push_str(placeholder);
    let e = state.text.len();
    let mut feat = json!({ "$type": TYPE_ID, "name": "image", "src": src, "alt": alt });
    if let Some(t) = title {
        feat["title"] = Value::String(t.to_owned());
    }
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [feat],
    }));
}

/// Emit a variable entity with flat `varname` attr.
fn push_variable(state: &mut ImportState, varname: &str) {
    let s = state.text.len();
    state.text.push('\u{FFFC}');
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "variable", "varname": varname }],
    }));
}

/// Emit an inline-tag entity with flat `tagname` (and optional `props`) attrs.
fn push_inline_tag(state: &mut ImportState, tagname: &str, props: Option<Value>) {
    let s = state.text.len();
    state.text.push('\u{FFFC}');
    let e = state.text.len();
    let mut feat = json!({ "$type": TYPE_ID, "name": "inline-tag", "tagname": tagname });
    if let Some(p) = props {
        feat["props"] = p;
    }
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [feat],
    }));
}

/// Emit a hard line-break entity.
fn push_line_break(state: &mut ImportState) {
    let s = state.text.len();
    state.text.push('\n');
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "line-break" }],
    }));
}

// ─── Tag prop parsing ─────────────────────────────────────────────────────────

/// Parse a Markdoc props string: `key="val"`, `key='val'`, `key=$var`,
/// `key=true`, `key=false`, `key=number`.
fn parse_tag_props(props_str: &str) -> Option<Value> {
    let trimmed = props_str.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut props = serde_json::Map::new();
    let bytes = trimmed.as_bytes();
    let n = bytes.len();
    let mut i = 0;

    while i < n {
        // Skip whitespace
        while i < n && (bytes[i] == b' ' || bytes[i] == b'\t') {
            i += 1;
        }
        if i >= n {
            break;
        }

        // Read key (word chars and hyphens)
        let key_start = i;
        while i < n && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_' || bytes[i] == b'-') {
            i += 1;
        }
        if i == key_start {
            i += 1;
            continue;
        }
        let key = trimmed[key_start..i].to_owned();

        // Skip whitespace then expect '='
        while i < n && (bytes[i] == b' ' || bytes[i] == b'\t') {
            i += 1;
        }
        if i >= n || bytes[i] != b'=' {
            continue;
        }
        i += 1;

        if i >= n {
            continue;
        }

        let val = match bytes[i] {
            b'"' => {
                i += 1;
                let start = i;
                while i < n && bytes[i] != b'"' {
                    i += 1;
                }
                let v = trimmed[start..i].to_owned();
                if i < n {
                    i += 1;
                }
                Value::String(v)
            }
            b'\'' => {
                i += 1;
                let start = i;
                while i < n && bytes[i] != b'\'' {
                    i += 1;
                }
                let v = trimmed[start..i].to_owned();
                if i < n {
                    i += 1;
                }
                Value::String(v)
            }
            b'$' => {
                // Variable reference: $varname
                let start = i;
                i += 1;
                while i < n && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_') {
                    i += 1;
                }
                Value::String(trimmed[start..i].to_owned())
            }
            _ => {
                // Number, boolean, or bare word
                let start = i;
                while i < n && bytes[i] != b' ' && bytes[i] != b'\t' {
                    i += 1;
                }
                let raw = &trimmed[start..i];
                if raw == "true" {
                    Value::Bool(true)
                } else if raw == "false" {
                    Value::Bool(false)
                } else if let Ok(n) = raw.parse::<i64>() {
                    Value::Number(n.into())
                } else if let Ok(f) = raw.parse::<f64>() {
                    Value::Number(serde_json::Number::from_f64(f).unwrap_or(0.into()))
                } else {
                    Value::String(raw.to_owned())
                }
            }
        };
        props.insert(key, val);
    }

    if props.is_empty() {
        None
    } else {
        Some(Value::Object(props))
    }
}

/// Serialize props object back to `key="val" key2=true` string.
fn serialize_tag_props(props: &Value) -> String {
    let obj = match props.as_object() {
        Some(o) => o,
        None => return String::new(),
    };
    obj.iter()
        .map(|(k, v)| match v {
            Value::String(s) => format!("{}=\"{}\"", k, s),
            Value::Bool(b) => format!("{}={}", k, b),
            Value::Number(n) => format!("{}={}", k, n),
            _ => format!("{}=\"{}\"", k, v),
        })
        .collect::<Vec<_>>()
        .join(" ")
}

// ─── Frontmatter parsing ──────────────────────────────────────────────────────

struct FrontmatterResult {
    entries: Vec<(String, String)>,
    rest_start: usize, // index into lines after frontmatter
}

fn parse_frontmatter(lines: &[&str]) -> FrontmatterResult {
    if lines.is_empty() || lines[0].trim() != "---" {
        return FrontmatterResult {
            entries: Vec::new(),
            rest_start: 0,
        };
    }
    let closing = lines[1..].iter().position(|l| l.trim() == "---");
    let closing_idx = match closing {
        Some(idx) => idx + 1,
        None => {
            return FrontmatterResult {
                entries: Vec::new(),
                rest_start: 0,
            }
        }
    };
    let yaml_lines = &lines[1..closing_idx];
    let mut entries = Vec::new();
    for &line in yaml_lines {
        if let Some(colon) = line.find(':') {
            let key = line[..colon].trim();
            let raw_value = line[colon + 1..].trim();
            // Strip surrounding quotes
            let value = raw_value
                .strip_prefix('"')
                .and_then(|s| s.strip_suffix('"'))
                .or_else(|| {
                    raw_value
                        .strip_prefix('\'')
                        .and_then(|s| s.strip_suffix('\''))
                })
                .unwrap_or(raw_value);
            if !key.is_empty() {
                entries.push((key.to_owned(), value.to_owned()));
            }
        }
    }
    FrontmatterResult {
        entries,
        rest_start: closing_idx + 1,
    }
}

// ─── Block tag parsing ────────────────────────────────────────────────────────

struct OpenTag {
    name: String,
    props: Option<Value>,
    condition: Option<String>,
    is_conditional: bool,
    content_lines: Vec<String>,
}

/// Try to parse a Markdoc self-closing block tag: `{% tagname ... /%}`
/// Returns (name, props) or None.
fn parse_self_closing_tag(line: &str) -> Option<(String, Option<Value>)> {
    let trimmed = line.trim();
    if !trimmed.starts_with("{%") || !trimmed.ends_with("/%}") {
        return None;
    }
    let inner = trimmed[2..trimmed.len() - 3].trim();
    if inner.is_empty() {
        return None;
    }
    let (tag_name, props_str) = split_first_word(inner);
    if tag_name.is_empty() || tag_name == "/" || tag_name.starts_with('/') {
        return None;
    }
    let props = parse_tag_props(props_str);
    Some((tag_name.to_owned(), props))
}

/// Try to parse a Markdoc opening block tag: `{% tagname ... %}` or `{% if $cond %}`
/// Does NOT match self-closing tags (/%}) or closing tags ({% /name %}).
fn parse_open_tag(line: &str) -> Option<OpenTag> {
    let trimmed = line.trim();
    if !trimmed.starts_with("{%") {
        return None;
    }
    if trimmed.ends_with("/%}") {
        return None;
    } // self-closing handled separately
    if !trimmed.ends_with("%}") {
        return None;
    }

    let inner = trimmed[2..trimmed.len() - 2].trim();
    if inner.is_empty() {
        return None;
    }

    // Closing tag starts with /
    if inner.starts_with('/') {
        return None;
    }

    // {% if $cond %}
    if inner.starts_with("if ") {
        let cond_str = inner["if ".len()..].trim();
        return Some(OpenTag {
            name: "if".to_owned(),
            props: None,
            condition: Some(cond_str.to_owned()),
            is_conditional: true,
            content_lines: Vec::new(),
        });
    }

    let (tag_name, props_str) = split_first_word(inner);
    if tag_name.is_empty() {
        return None;
    }

    let props = parse_tag_props(props_str);
    Some(OpenTag {
        name: tag_name.to_owned(),
        props,
        condition: None,
        is_conditional: false,
        content_lines: Vec::new(),
    })
}

/// Try to parse a Markdoc closing tag: `{% /tagname %}` or `{% /if %}`
/// Returns the tag name or None.
fn parse_close_tag(line: &str) -> Option<String> {
    let trimmed = line.trim();
    if !trimmed.starts_with("{%") || !trimmed.ends_with("%}") {
        return None;
    }
    let inner = trimmed[2..trimmed.len() - 2].trim();
    if !inner.starts_with('/') {
        return None;
    }
    let name = inner[1..].trim();
    if name.is_empty() {
        return None;
    }
    Some(name.to_owned())
}

/// Split "word rest" into ("word", "rest").
fn split_first_word(s: &str) -> (&str, &str) {
    let end = s.find(|c: char| c == ' ' || c == '\t').unwrap_or(s.len());
    (&s[..end], s[end..].trim_start())
}

// ─── Heading annotation parsing ───────────────────────────────────────────────

/// Strip Markdoc annotation from heading content.
/// `"My Heading {% #my-id %}"` → `(text: "My Heading", id: Some("my-id"), class: None)`
/// `"My Heading {% .my-class %}"` → `(text: "My Heading", id: None, class: Some("my-class"))`
fn parse_heading_annotation(content: &str) -> (String, Option<String>, Option<String>) {
    // Look for {% ... %} at end of content
    if let Some(tag_start) = content.rfind("{%") {
        if let Some(tag_end) = content[tag_start..].find("%}") {
            let inner = content[tag_start + 2..tag_start + tag_end].trim();
            let text = content[..tag_start].trim_end().to_owned();
            if let Some(id_part) = inner.strip_prefix('#') {
                return (text, Some(id_part.trim().to_owned()), None);
            }
            if let Some(class_part) = inner.strip_prefix('.') {
                return (text, None, Some(class_part.trim().to_owned()));
            }
        }
    }
    (content.to_owned(), None, None)
}

/// Strip paragraph class annotation: `"text {% .class %}"` → `(text, Some("class"))`.
fn parse_paragraph_annotation(content: &str) -> (String, Option<String>) {
    if let Some(tag_start) = content.rfind("{%") {
        if let Some(tag_end) = content[tag_start..].find("%}") {
            let inner = content[tag_start + 2..tag_start + tag_end].trim();
            if let Some(class_part) = inner.strip_prefix('.') {
                let text = content[..tag_start].trim_end().to_owned();
                return (text, Some(class_part.trim().to_owned()));
            }
        }
    }
    (content.to_owned(), None)
}

// ─── Inline scanner ───────────────────────────────────────────────────────────

/// Scan inline Markdoc markup in `line`, appending text and facets to state.
///
/// Recognized patterns (in priority order):
///   **bold** → "strong"
///   *italic* → "emphasis"
///   ~~strike~~ → "strikethrough"
///   `code` → "code-span"
///   ![alt](src "title") → "image"
///   [text](url "title") → "link"
///   {% $varname %} → "variable"
///   {% tagname ... /%} → "inline-tag"
///   two trailing spaces → "line-break"
///   plain text
fn scan_inline(line: &str, state: &mut ImportState) {
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
        let b = bytes[pos];

        // **bold**
        if b == b'*' && pos + 1 < len && bytes[pos + 1] == b'*' {
            if let Some(close_rel) = find_double_byte(bytes, pos + 2, b'*') {
                let content = &line[pos + 2..pos + 2 + close_rel];
                flush_plain!(pos);
                plain_start = pos + 2 + close_rel + 2;
                push_inline(state, content, "strong");
                pos = plain_start;
                continue;
            }
        }

        // *italic* (single asterisk, not double)
        if b == b'*' && (pos + 1 >= len || bytes[pos + 1] != b'*') {
            if let Some(close) = find_single_byte_not_double(bytes, pos + 1, b'*') {
                let content = &line[pos + 1..pos + 1 + close];
                flush_plain!(pos);
                plain_start = pos + 1 + close + 1;
                push_inline(state, content, "emphasis");
                pos = plain_start;
                continue;
            }
        }

        // ~~strikethrough~~
        if b == b'~' && pos + 1 < len && bytes[pos + 1] == b'~' {
            if let Some(close_rel) = find_double_byte(bytes, pos + 2, b'~') {
                let content = &line[pos + 2..pos + 2 + close_rel];
                flush_plain!(pos);
                plain_start = pos + 2 + close_rel + 2;
                push_inline(state, content, "strikethrough");
                pos = plain_start;
                continue;
            }
        }

        // `code-span`
        if b == b'`' {
            if let Some(close) = find_byte_from(bytes, pos + 1, b'`') {
                let content = &line[pos + 1..pos + 1 + close];
                flush_plain!(pos);
                plain_start = pos + 1 + close + 1;
                push_inline(state, content, "code-span");
                pos = plain_start;
                continue;
            }
        }

        // ![alt](src "title") — image
        if b == b'!' && pos + 1 < len && bytes[pos + 1] == b'[' {
            if let Some((alt, src, title, end)) = parse_md_image(line, pos + 1) {
                flush_plain!(pos);
                plain_start = end;
                push_image(state, alt, src, title);
                pos = plain_start;
                continue;
            }
        }

        // [text](url "title") — link
        if b == b'[' {
            if let Some((display, uri, title, end)) = parse_md_link(line, pos) {
                flush_plain!(pos);
                plain_start = end;
                push_link(state, display, uri, title);
                pos = plain_start;
                continue;
            }
        }

        // {% ... %} — Markdoc inline tokens
        if b == b'{' && pos + 1 < len && bytes[pos + 1] == b'%' {
            if let Some(close) = find_close_markdoc(bytes, pos + 2) {
                let inner = line[pos + 2..pos + 2 + close].trim();
                let end_pos = pos + 2 + close + 2;
                flush_plain!(pos);
                plain_start = end_pos;

                if let Some(varname) = inner.strip_prefix('$') {
                    // {% $varname %}
                    push_variable(state, varname.trim());
                } else if inner.ends_with('/') {
                    // {% tagname ... /% } — inline self-closing tag
                    let tag_and_props = inner[..inner.len() - 1].trim();
                    let (tagname, props_str) = split_first_word(tag_and_props);
                    if !tagname.is_empty() {
                        let props = parse_tag_props(props_str);
                        push_inline_tag(state, tagname, props);
                    } else {
                        state.text.push_str(&line[pos..end_pos]);
                    }
                } else {
                    // Unknown markdoc inline token — emit as plain text
                    state.text.push_str(&line[pos..end_pos]);
                }

                pos = plain_start;
                continue;
            }
        }

        // Hard line break: two trailing spaces before end
        if b == b' ' && pos + 1 < len && bytes[pos + 1] == b' ' && pos + 2 >= len {
            flush_plain!(pos);
            plain_start = len;
            push_line_break(state);
            pos = len;
            continue;
        }

        pos += utf8_char_len(b);
    }

    if plain_start < len {
        state.text.push_str(&line[plain_start..]);
    }
}

/// Find a double occurrence of `target` in `bytes` starting at `start`.
/// Returns relative offset of the first occurrence of the pair within `bytes[start..]`.
fn find_double_byte(bytes: &[u8], start: usize, target: u8) -> Option<usize> {
    let mut i = start;
    while i + 1 < bytes.len() {
        if bytes[i] == target && bytes[i + 1] == target {
            return Some(i - start);
        }
        i += utf8_char_len(bytes[i]);
    }
    None
}

/// Find a single `target` byte (not followed by another `target`) in `bytes[start..]`.
/// Returns relative offset.
fn find_single_byte_not_double(bytes: &[u8], start: usize, target: u8) -> Option<usize> {
    let mut i = start;
    while i < bytes.len() {
        if bytes[i] == target && (i + 1 >= bytes.len() || bytes[i + 1] != target) {
            return Some(i - start);
        }
        i += utf8_char_len(bytes[i]);
    }
    None
}

/// Find a single `target` byte in `bytes[start..]`. Returns relative offset.
fn find_byte_from(bytes: &[u8], start: usize, target: u8) -> Option<usize> {
    bytes[start..].iter().position(|&b| b == target)
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

/// Find the closing `%}` in `bytes[start..]`.
/// Returns the byte count from `start` to the `%` of `%}`.
fn find_close_markdoc(bytes: &[u8], start: usize) -> Option<usize> {
    let mut i = start;
    while i + 1 < bytes.len() {
        if bytes[i] == b'%' && bytes[i + 1] == b'}' {
            return Some(i - start);
        }
        i += 1;
    }
    None
}

/// Parse `[display](url "optional title")` at `pos` in `line`.
/// Returns `(display, url, title, end)` or None.
fn parse_md_link<'a>(
    line: &'a str,
    pos: usize,
) -> Option<(&'a str, &'a str, Option<&'a str>, usize)> {
    let bytes = line.as_bytes();
    if pos >= bytes.len() || bytes[pos] != b'[' {
        return None;
    }
    let bracket_close = find_byte_from(bytes, pos + 1, b']')? + pos + 1;
    if bracket_close + 1 >= bytes.len() || bytes[bracket_close + 1] != b'(' {
        return None;
    }
    let paren_open = bracket_close + 2;
    // Find closing ), accounting for optional title "..."
    let paren_close = find_byte_from(bytes, paren_open, b')')? + paren_open;
    let display = &line[pos + 1..bracket_close];
    let url_and_title = &line[paren_open..paren_close];
    let (url, title) = split_url_and_title(url_and_title);
    Some((display, url, title, paren_close + 1))
}

/// Parse `[alt](src "optional title")` for images. `pos` is position of `[`.
fn parse_md_image<'a>(
    line: &'a str,
    pos: usize,
) -> Option<(&'a str, &'a str, Option<&'a str>, usize)> {
    parse_md_link(line, pos)
}

/// Split `url "optional title"` into (url, title).
fn split_url_and_title(s: &str) -> (&str, Option<&str>) {
    let trimmed = s.trim();
    // Find space followed by "title"
    if let Some(space) = trimmed.find(|c: char| c == ' ' || c == '\t') {
        let after = trimmed[space..].trim();
        if after.starts_with('"') && after.ends_with('"') && after.len() >= 2 {
            let url = trimmed[..space].trim();
            let title = &after[1..after.len() - 1];
            return (url, Some(title));
        }
    }
    (trimmed, None)
}

/// Strip `N. ` or `N) ` ordered list prefix. Returns rest of line or None.
fn strip_ordered_prefix(line: &str) -> Option<&str> {
    let bytes = line.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i == 0 {
        return None;
    }
    if i < bytes.len() && (bytes[i] == b'.' || bytes[i] == b')') {
        let after = i + 1;
        if after < bytes.len() && (bytes[after] == b' ' || bytes[after] == b'\t') {
            return Some(&line[after + 1..]);
        }
    }
    None
}

/// Strip `- ` or `* ` bullet prefix. Returns content or None.
fn strip_bullet_prefix(line: &str) -> Option<&str> {
    if let Some(rest) = line.strip_prefix("- ") {
        return Some(rest);
    }
    if let Some(rest) = line.strip_prefix("* ") {
        return Some(rest);
    }
    None
}

// ─── Import ───────────────────────────────────────────────────────────────────

fn do_import(raw: &str) -> String {
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
    let all_lines: Vec<&str> = text.split('\n').collect();

    // ── 1. Frontmatter ────────────────────────────────────────────────────────
    let fm = parse_frontmatter(&all_lines);
    for (key, value) in &fm.entries {
        open_block(
            &mut state,
            "frontmatter",
            &[],
            json!({ "key": key, "value": value }),
        );
    }

    // ── 2. Body lines ─────────────────────────────────────────────────────────
    let body_lines = &all_lines[fm.rest_start..];
    let mut i = 0;
    let n = body_lines.len();

    let mut in_code_block = false;
    let mut code_lines: Vec<&str> = Vec::new();
    let mut code_lang: Option<&str> = None;

    // Stack for nested block tags
    let mut tag_stack: Vec<OpenTag> = Vec::new();

    while i < n {
        let line = body_lines[i];
        i += 1;

        // ── Code fence ────────────────────────────────────────────────────────
        if line.starts_with("```") {
            if !in_code_block {
                in_code_block = true;
                code_lines.clear();
                let info = line[3..].trim();
                code_lang = if info.is_empty() { None } else { Some(info) };
                continue;
            } else {
                in_code_block = false;
                let code_content: String = code_lines.join("\n") + "\n";
                let attrs = match code_lang {
                    Some(l) => json!({ "language": l }),
                    None => json!({}),
                };
                state.prev_list_type = 0;
                open_block(&mut state, "code-block", &[], attrs);
                state.text.push_str(&code_content);
                code_lines.clear();
                code_lang = None;
                continue;
            }
        }

        if in_code_block {
            code_lines.push(line);
            continue;
        }

        // ── Inside a tag block ────────────────────────────────────────────────
        if !tag_stack.is_empty() {
            let close_name = parse_close_tag(line);
            let top_name = tag_stack.last().map(|t| t.name.clone());

            if let (Some(close), Some(top)) = (&close_name, &top_name) {
                if close == top {
                    let finished = tag_stack.pop().unwrap();
                    let tag_content = finished.content_lines.join("\n");

                    if finished.is_conditional {
                        let cond = finished.condition.as_deref().unwrap_or("$condition");
                        open_block(&mut state, "conditional", &[], json!({ "condition": cond }));
                        if !tag_content.is_empty() {
                            state.text.push_str(&tag_content);
                        }
                    } else {
                        let mut tag_attrs = json!({ "name": finished.name });
                        if let Some(p) = finished.props {
                            tag_attrs["props"] = p;
                        }
                        open_block(&mut state, "tag", &[], tag_attrs);
                        if !tag_content.is_empty() {
                            state.text.push_str(&tag_content);
                        }
                    }
                    continue;
                }
            }

            // Check for nested open tag
            if let Some(nested) = parse_open_tag(line) {
                tag_stack.push(nested);
            } else {
                if let Some(top) = tag_stack.last_mut() {
                    top.content_lines.push(line.to_owned());
                }
            }
            continue;
        }

        // ── Self-closing block tag ────────────────────────────────────────────
        if let Some((tag_name, props)) = parse_self_closing_tag(line) {
            state.prev_list_type = 0;
            let mut tag_attrs = json!({ "name": tag_name, "selfClosing": true });
            if let Some(p) = props {
                tag_attrs["props"] = p;
            }
            open_block(&mut state, "tag", &[], tag_attrs);
            continue;
        }

        // ── Opening block tag ─────────────────────────────────────────────────
        if let Some(open_tag) = parse_open_tag(line) {
            state.prev_list_type = 0;
            tag_stack.push(open_tag);
            continue;
        }

        // ── Standard block types ──────────────────────────────────────────────

        // Headings (#1–#6)
        if let Some((level, raw_content)) = parse_heading_prefix(line) {
            state.prev_list_type = 0;
            let (text, id, _class) = parse_heading_annotation(raw_content);
            let mut attrs = json!({ "level": level });
            if let Some(id_val) = id {
                attrs["id"] = Value::String(id_val);
            }
            open_block(&mut state, "heading", &[], attrs);
            scan_inline(&text, &mut state);
            continue;
        }

        // Blockquote
        if line.starts_with("> ") {
            let content = &line[2..];
            state.prev_list_type = 0;
            open_block(&mut state, "blockquote-marker", &[], json!({}));
            open_block(&mut state, "paragraph", &["blockquote"], json!({}));
            scan_inline(content, &mut state);
            continue;
        }

        // Bullet list
        if let Some(content) = strip_bullet_prefix(line) {
            if state.prev_list_type != 1 {
                open_block(&mut state, "bullet-list-marker", &[], json!({}));
            }
            open_block(&mut state, "list-item-marker", &["ul"], json!({}));
            open_block(
                &mut state,
                "list-item-text",
                &["ul", "unordered-list-item"],
                json!({}),
            );
            scan_inline(content, &mut state);
            state.prev_list_type = 1;
            continue;
        }

        // Ordered list
        if let Some(content) = strip_ordered_prefix(line) {
            if state.prev_list_type != 2 {
                open_block(&mut state, "ordered-list-marker", &[], json!({}));
            }
            open_block(&mut state, "list-item-marker", &["ol"], json!({}));
            open_block(
                &mut state,
                "list-item-text",
                &["ol", "ordered-list-item"],
                json!({}),
            );
            scan_inline(content, &mut state);
            state.prev_list_type = 2;
            continue;
        }

        // Horizontal rule
        if line == "---" || line == "***" || line == "___" {
            state.prev_list_type = 0;
            open_block(&mut state, "horizontal-rule", &[], json!({}));
            continue;
        }

        // Empty line
        if line.trim().is_empty() {
            state.prev_list_type = 0;
            continue;
        }

        // Regular paragraph — strip class annotation
        state.prev_list_type = 0;
        let (text, class) = parse_paragraph_annotation(line);
        let attrs = match class {
            Some(c) => json!({ "class": c }),
            None => json!({}),
        };
        open_block(&mut state, "paragraph", &[], attrs);
        scan_inline(&text, &mut state);
    }

    // Flush unclosed code block
    if in_code_block && !code_lines.is_empty() {
        let code_content: String = code_lines.join("\n") + "\n";
        let attrs = match code_lang {
            Some(l) => json!({ "language": l }),
            None => json!({}),
        };
        open_block(&mut state, "code-block", &[], attrs);
        state.text.push_str(&code_content);
    }

    // Flush any unclosed tag blocks — degrade to paragraph
    while let Some(tag) = tag_stack.pop() {
        open_block(&mut state, "paragraph", &[], json!({}));
        let content = tag.content_lines.join("\n");
        state.text.push_str(&content);
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

/// Parse `# `, `## ` … `###### ` heading prefix.
/// Returns `(level, content_after_space)` or None.
fn parse_heading_prefix(line: &str) -> Option<(usize, &str)> {
    if !line.starts_with('#') {
        return None;
    }
    let mut level = 0usize;
    let chars: Vec<char> = line.chars().collect();
    while level < chars.len() && chars[level] == '#' {
        level += 1;
    }
    if level == 0 || level > 6 {
        return None;
    }
    if level < chars.len() && chars[level] == ' ' {
        // byte offset: level '#' chars (all ASCII) + 1 space
        Some((level, &line[level + 1..]))
    } else {
        None
    }
}

// ─── Export ────────────────────────────────────────────────────────────────────

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    match mark.kind.as_str() {
        "com.markdoc.facet#strong" => format!("**{}**", content),
        "com.markdoc.facet#emphasis" => format!("*{}*", content),
        "com.markdoc.facet#strikethrough" => format!("~~{}~~", content),
        "com.markdoc.facet#code-span" => format!("`{}`", content),
        "com.markdoc.facet#link" => {
            let uri = mark
                .attrs
                .get("uri")
                .or_else(|| mark.attrs.get("href"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let title = mark.attrs.get("title").and_then(|v| v.as_str());
            let title_str = title.map(|t| format!(" \"{}\"", t)).unwrap_or_default();
            format!("[{}]({}{})", content, uri, title_str)
        }
        "com.markdoc.facet#image" => {
            let src = mark.attrs.get("src").and_then(|v| v.as_str()).unwrap_or("");
            let alt = mark
                .attrs
                .get("alt")
                .and_then(|v| v.as_str())
                .unwrap_or(content);
            format!("![{}]({})", alt, src)
        }
        "com.markdoc.facet#variable" => {
            let varname = mark
                .attrs
                .get("varname")
                .or_else(|| mark.attrs.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("var");
            format!("{{% ${} %}}", varname)
        }
        "com.markdoc.facet#inline-tag" => {
            let tagname = mark
                .attrs
                .get("tagname")
                .or_else(|| mark.attrs.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("tag");
            let prop_str = mark
                .attrs
                .get("props")
                .map(|p| format!(" {}", serialize_tag_props(p)))
                .unwrap_or_default();
            format!("{{% {}{}/%}}", tagname, prop_str)
        }
        "com.markdoc.facet#line-break" => "  \n".to_owned(),
        // Cross-format marks
        "org.commonmark.facet#strong" => format!("**{}**", content),
        "org.commonmark.facet#emphasis" => format!("*{}*", content),
        "org.commonmark.facet#strikethrough" => format!("~~{}~~", content),
        "org.commonmark.facet#code-span" => format!("`{}`", content),
        "org.commonmark.facet#link" => {
            let uri = mark.attrs.get("uri").and_then(|v| v.as_str()).unwrap_or("");
            let title = mark.attrs.get("title").and_then(|v| v.as_str());
            let title_str = title.map(|t| format!(" \"{}\"", t)).unwrap_or_default();
            format!("[{}]({}{})", content, uri, title_str)
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

struct MarkdocCtx {
    list_type: u8, // 0=none, 1=bullet, 2=ordered
    ordered_idx: usize,
    in_blockquote: bool,
}

impl MarkdocCtx {
    fn none() -> Self {
        Self {
            list_type: 0,
            ordered_idx: 1,
            in_blockquote: false,
        }
    }
}

fn render_node(
    node: &HirNode,
    lines: &mut Vec<String>,
    ctx: &mut MarkdocCtx,
    frontmatter: &mut Vec<(String, String)>,
) {
    match node {
        HirNode::Block {
            name,
            attrs,
            children,
        } => {
            render_block(name, attrs, children, lines, ctx, frontmatter);
        }
        HirNode::Container { name, children, .. } => {
            render_container(name, children, lines, ctx, frontmatter);
        }
        HirNode::Text { content, marks } => {
            let mut s = content.clone();
            for mark in marks.iter().rev() {
                s = apply_mark(&s, mark);
            }
            lines.push(s);
        }
    }
}

fn render_block(
    name: &str,
    attrs: &std::collections::HashMap<String, Value>,
    children: &[HirNode],
    lines: &mut Vec<String>,
    ctx: &mut MarkdocCtx,
    frontmatter: &mut Vec<(String, String)>,
) {
    match name {
        "frontmatter" => {
            let key = attrs
                .get("key")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_owned();
            let value = attrs
                .get("value")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_owned();
            if !key.is_empty() {
                frontmatter.push((key, value));
            }
        }

        // Invisible separator blocks
        "blockquote-marker" | "bullet-list-marker" | "ordered-list-marker" | "list-item-marker" => {
        }

        "paragraph" => {
            let inner = render_inline(children);
            if inner.trim().is_empty() {
                return;
            }
            let class = attrs.get("class").and_then(|v| v.as_str());
            let suffix = class
                .map(|c| format!(" {{% .{} %}}", c))
                .unwrap_or_default();
            if ctx.in_blockquote {
                lines.push(format!("> {}{}\n", inner, suffix));
            } else {
                lines.push(format!("{}{}\n", inner, suffix));
            }
        }

        "heading" => {
            let level = attrs.get("level").and_then(|v| v.as_u64()).unwrap_or(1) as usize;
            let level = level.max(1).min(6);
            let id = attrs.get("id").and_then(|v| v.as_str());
            let inner = render_inline(children);
            let prefix = "#".repeat(level);
            let suffix = match id {
                Some(id_val) => format!(" {{%% #{} %%}}", id_val)
                    .replace("{%%", "{%")
                    .replace("%%}", "%}"),
                None => String::new(),
            };
            lines.push(format!("{} {}{}\n", prefix, inner, suffix));
        }

        "code-block" => {
            let lang = attrs.get("language").and_then(|v| v.as_str()).unwrap_or("");
            let code = collect_text(children);
            let body = code.strip_suffix('\n').unwrap_or(&code);
            let fence = if lang.is_empty() {
                "```".to_owned()
            } else {
                format!("```{}", lang)
            };
            lines.push(format!("{}\n{}\n```\n", fence, body));
        }

        "list-item-text" => {
            let inner = render_inline(children);
            if ctx.list_type == 2 {
                lines.push(format!("{}. {}\n", ctx.ordered_idx, inner));
                ctx.ordered_idx += 1;
            } else {
                lines.push(format!("- {}\n", inner));
            }
        }

        "horizontal-rule" => {
            lines.push("---\n".to_owned());
        }

        "tag" => {
            let tag_name = match attrs.get("name").and_then(|v| v.as_str()) {
                Some(n) => n.to_owned(),
                None => return,
            };
            let self_closing = attrs
                .get("selfClosing")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let props = attrs.get("props");
            let props_str = props
                .map(|p| format!(" {}", serialize_tag_props(p)))
                .unwrap_or_default();

            if self_closing {
                lines.push(format!("{{% {}{} /%}}\n", tag_name, props_str));
            } else {
                let inner = render_inline(children);
                lines.push(format!("{{% {}{} %}}\n", tag_name, props_str));
                if !inner.trim().is_empty() {
                    lines.push(format!("{}\n", inner));
                }
                lines.push(format!("{{% /{} %}}\n", tag_name));
            }
        }

        "conditional" => {
            let condition = attrs
                .get("condition")
                .and_then(|v| v.as_str())
                .unwrap_or("$condition");
            let inner = render_inline(children);
            lines.push(format!("{{% if {} %}}\n", condition));
            if !inner.trim().is_empty() {
                lines.push(format!("{}\n", inner));
            }
            lines.push("{% /if %}\n".to_owned());
        }

        _ => {
            let inner = render_inline(children);
            if !inner.trim().is_empty() {
                lines.push(format!("{}\n", inner));
            }
        }
    }
}

fn render_container(
    name: &str,
    children: &[HirNode],
    lines: &mut Vec<String>,
    ctx: &mut MarkdocCtx,
    frontmatter: &mut Vec<(String, String)>,
) {
    match name {
        "ul" => {
            let mut child_ctx = MarkdocCtx {
                list_type: 1,
                ordered_idx: 1,
                in_blockquote: ctx.in_blockquote,
            };
            for child in children {
                render_node(child, lines, &mut child_ctx, frontmatter);
            }
        }
        "ol" => {
            let mut child_ctx = MarkdocCtx {
                list_type: 2,
                ordered_idx: 1,
                in_blockquote: ctx.in_blockquote,
            };
            for child in children {
                render_node(child, lines, &mut child_ctx, frontmatter);
            }
        }
        "blockquote" => {
            let mut inner_lines: Vec<String> = Vec::new();
            let mut child_ctx = MarkdocCtx {
                list_type: 0,
                ordered_idx: 1,
                in_blockquote: true,
            };
            for child in children {
                render_node(child, &mut inner_lines, &mut child_ctx, frontmatter);
            }
            for l in &inner_lines {
                if !l.starts_with("> ") {
                    lines.push(format!("> {}", l));
                } else {
                    lines.push(l.clone());
                }
            }
        }
        _ => {
            // Propagate the parent ctx (e.g. list_type) into sub-containers like
            // "ordered-list-item" and "unordered-list-item" that don't reset context.
            for child in children {
                render_node(child, lines, ctx, frontmatter);
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

    let mut frontmatter: Vec<(String, String)> = Vec::new();
    let mut body_lines: Vec<String> = Vec::new();
    let mut ctx = MarkdocCtx::none();

    for node in &nodes {
        render_node(node, &mut body_lines, &mut ctx, &mut frontmatter);
    }

    let mut out = String::new();

    // Emit frontmatter
    if !frontmatter.is_empty() {
        out.push_str("---\n");
        for (key, value) in &frontmatter {
            out.push_str(key);
            out.push_str(": ");
            out.push_str(value);
            out.push('\n');
        }
        out.push_str("---\n");
    }

    for line in &body_lines {
        out.push_str(line);
    }

    if out.ends_with('\n') {
        out.pop();
    }
    out
}
