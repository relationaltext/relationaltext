//! MDX format adapter: import and export for RelationalText documents.
//!
//! MDX is Markdown + JSX. This adapter implements a practical subset:
//! - YAML frontmatter (---…---) → `frontmatter` blocks with attrs: { key, value }
//! - Top-level `import` statements → `import-stmt` blocks with attrs: { code: line }
//! - JSX block elements (<Component …>) → `jsx-block` blocks
//! - Inline JSX (<Tag />) → `jsx-inline` entities
//! - JS expressions ({expr}) → `expression` entities
//! - All standard CommonMark syntax (headings, fences, blockquotes, lists, HR, paragraphs)
//! - Inline marks: **strong**, *emphasis*, ~~strikethrough~~, `code-span`
//! - Links: [text](url), images: ![alt](src)
//!
//! Format namespace: `dev.mdxjs.facet`
//! WASM exports: `import_mdx` and `export_mdx`

use relationaltext_core::{
    hir::{build_hir_from_doc, HirNode, MarkApplication},
    serde_atproto, LexiconRegistry,
};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::{json, Value};
use std::sync::OnceLock;

const TYPE_ID: &str = "dev.mdxjs.facet";
const LEXICON_JSON: &[u8] = include_bytes!("../../../formats/dev.mdxjs/mdx.lexicon.json");

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
pub extern "C" fn import_mdx(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_import(input);
    write_result(result)
}

#[no_mangle]
pub extern "C" fn export_mdx(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_export(input);
    write_result(result)
}

// ─── Import state ─────────────────────────────────────────────────────────────

struct ImportState {
    text: String,
    facets: Vec<Value>,
    /// Tracks list context continuity: 0=none, 1=bullet, 2=ordered
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

/// Emit a block marker (U+FFFC for the first block, '\n' for subsequent)
/// and register the feature. Block attrs go under the nested "attrs" key.
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

/// Emit plain text with a named inline mark. Inline attrs go FLAT on the feature.
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

/// Emit a link feature with flat `uri` attr.
fn push_link(state: &mut ImportState, display: &str, uri: &str) {
    if display.is_empty() {
        return;
    }
    let s = state.text.len();
    state.text.push_str(display);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "link", "uri": uri }],
    }));
}

/// Emit an image feature with flat `src` and `alt` attrs.
fn push_image(state: &mut ImportState, alt: &str, src: &str) {
    let placeholder = if alt.is_empty() { " " } else { alt };
    let s = state.text.len();
    state.text.push_str(placeholder);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "image", "src": src, "alt": alt }],
    }));
}

/// Emit a jsx-inline entity with flat `tag` attr and optional flat `props`.
fn push_jsx_inline(state: &mut ImportState, tag: &str, props: Option<Value>) {
    let placeholder = format!("<{} />", tag);
    let s = state.text.len();
    state.text.push_str(&placeholder);
    let e = state.text.len();
    let mut feat = json!({ "$type": TYPE_ID, "name": "jsx-inline", "tag": tag });
    if let Some(p) = props {
        feat["props"] = p;
    }
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [feat],
    }));
}

/// Emit an expression entity with flat `code` attr.
fn push_expression(state: &mut ImportState, code: &str) {
    let placeholder = format!("{{{}}}", code);
    let s = state.text.len();
    state.text.push_str(&placeholder);
    let e = state.text.len();
    state.facets.push(json!({
        "index": { "byteStart": s, "byteEnd": e },
        "features": [{ "$type": TYPE_ID, "name": "expression", "code": code }],
    }));
}

// ─── JSX prop parsing ─────────────────────────────────────────────────────────

/// Parse a JSX attribute string like `prop="val" other={expr}` into a JSON object.
/// Handles: key="value", key='value', key={expr}, key (bare boolean true).
fn parse_jsx_props(attr_str: &str) -> Option<Value> {
    let trimmed = attr_str.trim();
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

        // Read key: word chars including . and -
        let key_start = i;
        while i < n
            && (bytes[i].is_ascii_alphanumeric()
                || bytes[i] == b'_'
                || bytes[i] == b'-'
                || bytes[i] == b'.')
        {
            i += 1;
        }
        if i == key_start {
            i += 1;
            continue;
        } // skip unexpected char

        let key = trimmed[key_start..i].to_owned();

        // Skip whitespace
        while i < n && (bytes[i] == b' ' || bytes[i] == b'\t') {
            i += 1;
        }

        if i >= n || bytes[i] != b'=' {
            // Bare attribute — boolean true
            props.insert(key, Value::Bool(true));
            continue;
        }
        i += 1; // consume '='

        // Read value
        if i >= n {
            props.insert(key, Value::Bool(true));
            break;
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
                } // consume closing "
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
                } // consume closing '
                Value::String(v)
            }
            b'{' => {
                i += 1;
                let start = i;
                let mut depth = 1usize;
                while i < n {
                    if bytes[i] == b'{' {
                        depth += 1;
                    } else if bytes[i] == b'}' {
                        depth -= 1;
                        if depth == 0 {
                            break;
                        }
                    }
                    i += 1;
                }
                let v = trimmed[start..i].to_owned();
                if i < n {
                    i += 1;
                } // consume closing }
                Value::String(v)
            }
            _ => {
                let start = i;
                while i < n
                    && bytes[i] != b' '
                    && bytes[i] != b'\t'
                    && bytes[i] != b'/'
                    && bytes[i] != b'>'
                {
                    i += 1;
                }
                Value::String(trimmed[start..i].to_owned())
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

// ─── JSX tag detection ────────────────────────────────────────────────────────

struct JsxTagInfo {
    tag: String,
    props: Option<Value>,
    self_closing: bool,
    is_close: bool,
}

/// Try to detect a JSX block tag on `line`.
/// Returns info or None if not a JSX tag line.
fn detect_jsx_tag(line: &str) -> Option<JsxTagInfo> {
    let trimmed = line.trim();
    if !trimmed.starts_with('<') {
        return None;
    }

    // Self-closing: <Foo ... /> (end must be />)
    if trimmed.ends_with("/>") || trimmed.ends_with("/ >") {
        // Try to parse: <TagName attrs... />
        let inner = trimmed.trim_start_matches('<');
        let end = inner.rfind("/>")?;
        let before_close = inner[..end].trim_end();
        // Extract tag name
        let (tag, attr_str) = split_tag_and_attrs(before_close);
        if is_valid_tag_char(tag) {
            let props = parse_jsx_props(attr_str);
            return Some(JsxTagInfo {
                tag: tag.to_owned(),
                props,
                self_closing: true,
                is_close: false,
            });
        }
    }

    // Closing tag: </Foo>
    if trimmed.starts_with("</") && trimmed.ends_with('>') {
        let inner = &trimmed[2..trimmed.len() - 1];
        let tag = inner.trim();
        if is_valid_tag_name(tag) {
            return Some(JsxTagInfo {
                tag: tag.to_owned(),
                props: None,
                self_closing: false,
                is_close: true,
            });
        }
    }

    // Opening tag: <Foo attrs...>
    if trimmed.ends_with('>') && !trimmed.starts_with("</") {
        let inner = trimmed.trim_start_matches('<');
        let before_close = &inner[..inner.len() - 1];
        let (tag, attr_str) = split_tag_and_attrs(before_close);
        if is_valid_tag_name(tag) {
            let props = parse_jsx_props(attr_str);
            return Some(JsxTagInfo {
                tag: tag.to_owned(),
                props,
                self_closing: false,
                is_close: false,
            });
        }
    }

    None
}

/// Split "TagName attr1 attr2" into (tag, attrs_str).
fn split_tag_and_attrs(s: &str) -> (&str, &str) {
    let trimmed = s.trim();
    let end = trimmed
        .find(|c: char| c == ' ' || c == '\t')
        .unwrap_or(trimmed.len());
    (&trimmed[..end], trimmed[end..].trim_start())
}

/// Check if tag name first char is a valid JSX identifier start (alpha or _).
fn is_valid_tag_char(tag: &str) -> bool {
    tag.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_')
}

/// Check if the whole string is a valid tag name (alphanumeric + . - _).
fn is_valid_tag_name(s: &str) -> bool {
    let s = s.trim();
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
}

/// Returns true if tag starts with an uppercase letter (JSX component convention).
fn is_uppercase_tag(tag: &str) -> bool {
    tag.starts_with(|c: char| c.is_ascii_uppercase())
}

// ─── Inline scanner ───────────────────────────────────────────────────────────

/// Scan one line of MDX for inline markup. Character-by-character state machine.
///
/// Recognized patterns (in priority order):
///   **bold** → "strong"
///   *italic* → "emphasis"
///   ~~strike~~ → "strikethrough"
///   `code` → "code-span"
///   ![alt](src) → "image"
///   [text](url) → "link"
///   <Tag ... /> (uppercase first) → "jsx-inline"
///   {expr} → "expression"
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

        // **bold** — two asterisks
        if b == b'*' && pos + 1 < len && bytes[pos + 1] == b'*' {
            if let Some(close_rel) = find_double(bytes, pos + 2, b'*') {
                let content = &line[pos + 2..pos + 2 + close_rel];
                flush_plain!(pos);
                plain_start = pos + 2 + close_rel + 2;
                push_inline(state, content, "strong");
                pos = plain_start;
                continue;
            }
        }

        // *italic* — single asterisk (only if not followed by another *)
        if b == b'*' && (pos + 1 >= len || bytes[pos + 1] != b'*') {
            if let Some(close) = find_byte_not_double(bytes, pos + 1, b'*') {
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
            if let Some(close_rel) = find_double(bytes, pos + 2, b'~') {
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
            if let Some(close) = find_byte(bytes, pos + 1, b'`') {
                let content = &line[pos + 1..pos + 1 + close];
                flush_plain!(pos);
                plain_start = pos + 1 + close + 1;
                push_inline(state, content, "code-span");
                pos = plain_start;
                continue;
            }
        }

        // ![alt](src) — image (must check before [text](url))
        if b == b'!' && pos + 1 < len && bytes[pos + 1] == b'[' {
            if let Some((alt, src, end)) = parse_link_or_image(line, pos + 1) {
                flush_plain!(pos);
                plain_start = end;
                push_image(state, alt, src);
                pos = plain_start;
                continue;
            }
        }

        // [text](url) — link
        if b == b'[' {
            if let Some((display, uri, end)) = parse_link_or_image(line, pos) {
                flush_plain!(pos);
                plain_start = end;
                push_link(state, display, uri);
                pos = plain_start;
                continue;
            }
        }

        // <Tag ... /> — inline JSX self-closing (uppercase tag)
        if b == b'<' {
            if let Some((tag, attr_str, end)) = parse_inline_jsx(line, pos) {
                if is_uppercase_tag(&tag) {
                    flush_plain!(pos);
                    plain_start = end;
                    let props = parse_jsx_props(attr_str);
                    push_jsx_inline(state, &tag, props);
                    pos = plain_start;
                    continue;
                }
            }
        }

        // {expression}
        if b == b'{' {
            if let Some(close) = find_byte(bytes, pos + 1, b'}') {
                let code = &line[pos + 1..pos + 1 + close];
                flush_plain!(pos);
                plain_start = pos + 1 + close + 1;
                push_expression(state, code);
                pos = plain_start;
                continue;
            }
        }

        pos += utf8_char_len(b);
    }

    // Flush remaining plain text
    if plain_start < len {
        state.text.push_str(&line[plain_start..]);
    }
}

/// Find a double occurrence of `target` starting at `start` in `bytes`.
/// Returns the relative offset of the first of the two chars within `bytes[start..]`.
fn find_double(bytes: &[u8], start: usize, target: u8) -> Option<usize> {
    let mut i = start;
    while i + 1 < bytes.len() {
        if bytes[i] == target && bytes[i + 1] == target {
            return Some(i - start);
        }
        i += utf8_char_len(bytes[i]);
    }
    None
}

/// Find a single `target` byte starting at `start` that is NOT immediately followed by another `target`.
/// Returns relative offset within `bytes[start..]`.
fn find_byte_not_double(bytes: &[u8], start: usize, target: u8) -> Option<usize> {
    let mut i = start;
    while i < bytes.len() {
        if bytes[i] == target {
            // Not followed by another target (or at end)
            if i + 1 >= bytes.len() || bytes[i + 1] != target {
                return Some(i - start);
            }
        }
        i += utf8_char_len(bytes[i]);
    }
    None
}

/// Find a single `target` byte starting at `start`.
/// Returns relative offset within `bytes[start..]`.
fn find_byte(bytes: &[u8], start: usize, target: u8) -> Option<usize> {
    bytes[start..].iter().position(|&b| b == target)
}

/// Try to parse `[display](uri)` or `[alt](src)` starting at byte offset `pos` in `line`.
/// Returns `(inner_text, url, end_byte_pos)` or None.
fn parse_link_or_image<'a>(line: &'a str, pos: usize) -> Option<(&'a str, &'a str, usize)> {
    let bytes = line.as_bytes();
    if pos >= bytes.len() || bytes[pos] != b'[' {
        return None;
    }
    let bracket_close = find_byte(bytes, pos + 1, b']')? + pos + 1;
    if bracket_close + 1 >= bytes.len() || bytes[bracket_close + 1] != b'(' {
        return None;
    }
    let paren_open = bracket_close + 1;
    let paren_close = find_byte(bytes, paren_open + 1, b')')? + paren_open + 1;
    let inner = &line[pos + 1..bracket_close];
    let url = &line[paren_open + 1..paren_close];
    Some((inner, url, paren_close + 1))
}

/// Try to parse an inline JSX self-closing tag `<Tag attrs... />` starting at `pos`.
/// Returns `(tag, attr_str, end_byte_pos)` or None.
fn parse_inline_jsx<'a>(line: &'a str, pos: usize) -> Option<(&'a str, &'a str, usize)> {
    let bytes = line.as_bytes();
    if pos >= bytes.len() || bytes[pos] != b'<' {
        return None;
    }
    // Find closing >
    let close = find_byte(bytes, pos + 1, b'>')?;
    let inner = &line[pos + 1..pos + 1 + close];
    // Must end with /
    let inner_trimmed = inner.trim_end();
    if !inner_trimmed.ends_with('/') {
        return None;
    }
    let before_slash = inner_trimmed[..inner_trimmed.len() - 1].trim_end();
    let (tag, attr_str) = split_tag_and_attrs(before_slash);
    if !is_valid_tag_char(tag) {
        return None;
    }
    Some((tag, attr_str, pos + 1 + close + 1))
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

// ─── Ordered list prefix stripping ────────────────────────────────────────────

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

// ─── Import ───────────────────────────────────────────────────────────────────

fn do_import(raw: &str) -> String {
    // Input may be wrapped in DocumentJSON { text: "..." } or raw MDX text.
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
    let n = lines.len();

    // ── 1. YAML frontmatter ───────────────────────────────────────────────────
    if n > 0 && lines[0].trim() == "---" {
        i = 1;
        let mut fm_lines: Vec<&str> = Vec::new();
        while i < n && lines[i].trim() != "---" {
            fm_lines.push(lines[i]);
            i += 1;
        }
        if i < n {
            i += 1;
        } // consume closing ---

        for fm_line in &fm_lines {
            if let Some(colon) = fm_line.find(':') {
                let key = fm_line[..colon].trim();
                let value = fm_line[colon + 1..].trim();
                if !key.is_empty() {
                    open_block(
                        &mut state,
                        "frontmatter",
                        &[],
                        json!({ "key": key, "value": value }),
                    );
                }
            }
        }
    }

    // ── 2. Body lines ─────────────────────────────────────────────────────────
    let mut in_code_block = false;
    let mut code_fence: Option<&str> = None; // "```" or "~~~"
    let mut code_lines: Vec<&str> = Vec::new();
    let mut code_lang: Option<&str> = None;

    // JSX block accumulation
    let mut in_jsx_block = false;
    let mut jsx_block_tag = String::new();
    let mut jsx_block_props: Option<Value> = None;
    let mut jsx_block_content_lines: Vec<&str> = Vec::new();

    while i < n {
        let line = lines[i];
        i += 1;

        // ── Code fence ────────────────────────────────────────────────────────
        let fence_char = if line.starts_with("```") {
            Some("```")
        } else if line.starts_with("~~~") {
            Some("~~~")
        } else {
            None
        };

        if let Some(fc) = fence_char {
            if !in_code_block {
                in_code_block = true;
                code_fence = Some(fc);
                code_lines.clear();
                let info = line[3..].trim();
                code_lang = if info.is_empty() { None } else { Some(info) };
                continue;
            } else if Some(fc) == code_fence || line.trim() == code_fence.unwrap_or("```") {
                in_code_block = false;
                code_fence = None;
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

        // ── Import statement ──────────────────────────────────────────────────
        if line.starts_with("import ") {
            state.prev_list_type = 0;
            open_block(&mut state, "import-stmt", &[], json!({ "code": line }));
            continue;
        }

        // ── JSX block: closing tag ────────────────────────────────────────────
        if in_jsx_block {
            let close_tag = format!("</{}>", jsx_block_tag);
            let trimmed = line.trim();
            if trimmed == close_tag {
                let content = jsx_block_content_lines.join("\n");
                let mut block_attrs = json!({
                    "tag": jsx_block_tag,
                    "selfClosing": false,
                });
                if !content.is_empty() {
                    block_attrs["content"] = Value::String(content.clone());
                }
                if let Some(ref p) = jsx_block_props {
                    block_attrs["props"] = p.clone();
                }
                state.prev_list_type = 0;
                open_block(&mut state, "jsx-block", &[], block_attrs);
                if !content.is_empty() {
                    state.text.push_str(&content);
                }
                in_jsx_block = false;
                jsx_block_tag.clear();
                jsx_block_props = None;
                jsx_block_content_lines.clear();
            } else {
                jsx_block_content_lines.push(line);
            }
            continue;
        }

        // ── JSX block: detect opening ─────────────────────────────────────────
        if let Some(jsx_info) = detect_jsx_tag(line) {
            if is_uppercase_tag(&jsx_info.tag) {
                state.prev_list_type = 0;
                if jsx_info.self_closing {
                    let mut block_attrs = json!({
                        "tag": jsx_info.tag,
                        "selfClosing": true,
                    });
                    if let Some(p) = jsx_info.props {
                        block_attrs["props"] = p;
                    }
                    open_block(&mut state, "jsx-block", &[], block_attrs);
                } else if !jsx_info.is_close {
                    in_jsx_block = true;
                    jsx_block_tag = jsx_info.tag;
                    jsx_block_props = jsx_info.props;
                    jsx_block_content_lines.clear();
                }
                continue;
            }
        }

        // ── Headings ──────────────────────────────────────────────────────────
        if let Some(heading) = parse_heading(line) {
            state.prev_list_type = 0;
            open_block(&mut state, "heading", &[], json!({ "level": heading.0 }));
            scan_inline(heading.1, &mut state);
            continue;
        }

        // ── Horizontal rule ───────────────────────────────────────────────────
        if is_horizontal_rule(line) {
            state.prev_list_type = 0;
            open_block(&mut state, "horizontal-rule", &[], json!({}));
            continue;
        }

        // ── Blockquote ────────────────────────────────────────────────────────
        if line.starts_with("> ") || line == ">" {
            let content = if line.starts_with("> ") {
                &line[2..]
            } else {
                ""
            };
            state.prev_list_type = 0;
            open_block(&mut state, "blockquote-marker", &[], json!({}));
            open_block(&mut state, "paragraph", &["blockquote"], json!({}));
            scan_inline(content, &mut state);
            continue;
        }

        // ── Bullet list ───────────────────────────────────────────────────────
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

        // ── Ordered list ──────────────────────────────────────────────────────
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

        // ── Empty line ────────────────────────────────────────────────────────
        if line.trim().is_empty() {
            state.prev_list_type = 0;
            continue;
        }

        // ── Regular paragraph ─────────────────────────────────────────────────
        state.prev_list_type = 0;
        open_block(&mut state, "paragraph", &[], json!({}));
        scan_inline(line, &mut state);
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

    // Flush unclosed JSX block
    if in_jsx_block {
        let content = jsx_block_content_lines.join("\n");
        let mut block_attrs = json!({
            "tag": jsx_block_tag,
            "selfClosing": false,
        });
        if !content.is_empty() {
            block_attrs["content"] = Value::String(content.clone());
        }
        if let Some(p) = jsx_block_props {
            block_attrs["props"] = p;
        }
        open_block(&mut state, "jsx-block", &[], block_attrs);
        if !content.is_empty() {
            state.text.push_str(&content);
        }
    }

    json!({ "text": state.text, "facets": state.facets }).to_string()
}

/// Parse `# Heading` prefix. Returns (level, content) or None.
fn parse_heading(line: &str) -> Option<(usize, &str)> {
    if !line.starts_with('#') {
        return None;
    }
    let mut level = 0usize;
    let mut rest = line;
    while rest.starts_with('#') {
        level += 1;
        rest = &rest[1..];
        if level > 6 {
            break;
        }
    }
    if level == 0 || level > 6 {
        return None;
    }
    if rest.starts_with(' ') {
        Some((level, rest[1..].trim_end()))
    } else {
        None
    }
}

/// Check if line is a horizontal rule (--- / *** / ___).
fn is_horizontal_rule(line: &str) -> bool {
    let trimmed = line.trim();
    (trimmed.len() >= 3 && trimmed.chars().all(|c| c == '-'))
        || (trimmed.len() >= 3 && trimmed.chars().all(|c| c == '*'))
        || (trimmed.len() >= 3 && trimmed.chars().all(|c| c == '_'))
}

/// Strip `- `, `* `, or `+ ` bullet prefix. Returns content or None.
fn strip_bullet_prefix(line: &str) -> Option<&str> {
    for pfx in &["- ", "* ", "+ "] {
        if let Some(rest) = line.strip_prefix(pfx) {
            return Some(rest);
        }
    }
    None
}

// ─── Export ────────────────────────────────────────────────────────────────────

/// Render JSX props back to attribute string.
fn render_jsx_props(props: &Value) -> String {
    let obj = match props.as_object() {
        Some(o) => o,
        None => return String::new(),
    };
    obj.iter()
        .map(|(k, v)| match v {
            Value::Bool(true) => k.clone(),
            Value::String(s) => format!("{}=\"{}\"", k, s),
            _ => format!("{}={{{}}}", k, v),
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn apply_mark(content: &str, mark: &MarkApplication) -> String {
    match mark.kind.as_str() {
        "dev.mdxjs.facet#strong" => format!("**{}**", content),
        "dev.mdxjs.facet#emphasis" => format!("*{}*", content),
        "dev.mdxjs.facet#strikethrough" => format!("~~{}~~", content),
        "dev.mdxjs.facet#code-span" => format!("`{}`", content),
        "dev.mdxjs.facet#link" => {
            let uri = mark
                .attrs
                .get("uri")
                .or_else(|| mark.attrs.get("url"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            format!("[{}]({})", content, uri)
        }
        "dev.mdxjs.facet#image" => {
            let src = mark.attrs.get("src").and_then(|v| v.as_str()).unwrap_or("");
            let alt = mark
                .attrs
                .get("alt")
                .and_then(|v| v.as_str())
                .unwrap_or(content);
            format!("![{}]({})", alt, src)
        }
        "dev.mdxjs.facet#jsx-inline" => {
            let tag = mark
                .attrs
                .get("tag")
                .and_then(|v| v.as_str())
                .unwrap_or("Component");
            let prop_str = mark
                .attrs
                .get("props")
                .map(|p| format!(" {}", render_jsx_props(p)))
                .unwrap_or_default();
            format!("<{}{} />", tag, prop_str)
        }
        "dev.mdxjs.facet#expression" => {
            let code = mark
                .attrs
                .get("code")
                .and_then(|v| v.as_str())
                .unwrap_or(content);
            format!("{{{}}}", code)
        }
        "dev.mdxjs.facet#line-break" => "  \n".to_owned(),
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

struct MdxCtx {
    list_type: u8, // 0=none, 1=bullet, 2=ordered
    ordered_idx: usize,
}

impl MdxCtx {
    fn none() -> Self {
        Self {
            list_type: 0,
            ordered_idx: 1,
        }
    }
}

fn render_node(
    node: &HirNode,
    out: &mut String,
    ctx: &mut MdxCtx,
    frontmatter: &mut Vec<(String, String)>,
    import_lines: &mut Vec<String>,
) {
    match node {
        HirNode::Block {
            name,
            attrs,
            children,
        } => {
            render_block(name, attrs, children, out, ctx, frontmatter, import_lines);
        }
        HirNode::Container { name, children, .. } => {
            render_container(name, children, out, ctx, frontmatter, import_lines);
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

fn render_block(
    name: &str,
    attrs: &std::collections::HashMap<String, Value>,
    children: &[HirNode],
    out: &mut String,
    ctx: &mut MdxCtx,
    frontmatter: &mut Vec<(String, String)>,
    import_lines: &mut Vec<String>,
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

        "import-stmt" => {
            let code = attrs
                .get("code")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_owned();
            if !code.is_empty() {
                import_lines.push(code);
            }
        }

        // Invisible separator blocks
        "blockquote-marker" | "bullet-list-marker" | "ordered-list-marker" | "list-item-marker" => {
        }

        "paragraph" => {
            let inner = render_inline(children);
            if !inner.trim().is_empty() {
                out.push_str(&inner);
                out.push_str("\n\n");
            }
        }

        "heading" => {
            let level = attrs.get("level").and_then(|v| v.as_u64()).unwrap_or(1) as usize;
            let level = level.max(1).min(6);
            let inner = render_inline(children);
            out.push_str(&"#".repeat(level));
            out.push(' ');
            out.push_str(inner.trim_end());
            out.push_str("\n\n");
        }

        "code-block" => {
            let lang = attrs.get("language").and_then(|v| v.as_str()).unwrap_or("");
            let code = collect_text(children);
            let body = code.strip_suffix('\n').unwrap_or(&code);
            out.push_str("```");
            out.push_str(lang);
            out.push('\n');
            out.push_str(body);
            out.push_str("\n```\n\n");
        }

        "list-item-text" => {
            let inner = render_inline(children);
            if ctx.list_type == 2 {
                out.push_str(&format!("{}. {}\n", ctx.ordered_idx, inner));
                ctx.ordered_idx += 1;
            } else {
                out.push_str(&format!("- {}\n", inner));
            }
        }

        "horizontal-rule" => {
            out.push_str("---\n\n");
        }

        "jsx-block" => {
            let tag = attrs
                .get("tag")
                .and_then(|v| v.as_str())
                .unwrap_or("Fragment");
            let self_closing = attrs
                .get("selfClosing")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let content = attrs.get("content").and_then(|v| v.as_str());
            let prop_str = attrs
                .get("props")
                .map(|p| format!(" {}", render_jsx_props(p)))
                .unwrap_or_default();

            if self_closing {
                out.push_str(&format!("<{}{} />\n\n", tag, prop_str));
            } else {
                let inner = match content {
                    Some(c) if !c.is_empty() => format!("{}\n", c),
                    _ => {
                        let rendered = render_inline(children);
                        if rendered.trim().is_empty() {
                            String::new()
                        } else {
                            format!("{}\n", rendered)
                        }
                    }
                };
                out.push_str(&format!("<{}{}>\n{}</{}>\n\n", tag, prop_str, inner, tag));
            }
        }

        _ => {
            let inner = render_inline(children);
            if !inner.trim().is_empty() {
                out.push_str(&inner);
                out.push_str("\n\n");
            }
        }
    }
}

fn render_container(
    name: &str,
    children: &[HirNode],
    out: &mut String,
    ctx: &mut MdxCtx,
    frontmatter: &mut Vec<(String, String)>,
    import_lines: &mut Vec<String>,
) {
    match name {
        "ul" => {
            let mut child_ctx = MdxCtx {
                list_type: 1,
                ordered_idx: 1,
            };
            for child in children {
                render_node(child, out, &mut child_ctx, frontmatter, import_lines);
            }
        }
        "ol" => {
            let mut child_ctx = MdxCtx {
                list_type: 2,
                ordered_idx: 1,
            };
            for child in children {
                render_node(child, out, &mut child_ctx, frontmatter, import_lines);
            }
        }
        "blockquote" => {
            let mut inner = String::new();
            let mut child_ctx = MdxCtx::none();
            for child in children {
                render_node(child, &mut inner, &mut child_ctx, frontmatter, import_lines);
            }
            // Prefix each line with "> "
            for line in inner.lines() {
                out.push_str("> ");
                out.push_str(line);
                out.push('\n');
            }
            out.push('\n');
        }
        _ => {
            // Propagate parent ctx (e.g. list_type) into sub-containers like
            // "ordered-list-item" and "unordered-list-item" that don't reset context.
            for child in children {
                render_node(child, out, ctx, frontmatter, import_lines);
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
    let mut import_lines: Vec<String> = Vec::new();
    let mut body = String::new();
    let mut ctx = MdxCtx::none();

    for node in &nodes {
        render_node(
            node,
            &mut body,
            &mut ctx,
            &mut frontmatter,
            &mut import_lines,
        );
    }

    let mut out = String::new();

    // Emit frontmatter block
    if !frontmatter.is_empty() {
        out.push_str("---\n");
        for (key, value) in &frontmatter {
            out.push_str(key);
            out.push_str(": ");
            out.push_str(value);
            out.push('\n');
        }
        out.push_str("---\n\n");
    }

    // Emit import statements
    for line in &import_lines {
        out.push_str(line);
        out.push('\n');
    }
    if !import_lines.is_empty() {
        out.push('\n');
    }

    out.push_str(&body);

    // Strip trailing newline to match TS behaviour
    if out.ends_with('\n') {
        out.pop();
    }
    out
}
