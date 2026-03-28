//! Plaintext format adapter: pipe-`|`-delimited paragraphs.
//!
//! Format namespace: `my.plaintext.facet`
//! Feature:         `my.plaintext.facet#paragraph`  (block)
//!
//! Wire format: paragraphs separated by `|` (no newlines in content).
//!
//! This is the canonical proof-of-concept for the RelationalText in-lexicon
//! WASM format adapter pattern. Pair it with the lexicon JSON that embeds
//! the `wasmLens` and `lens` fields, then call `registerLexicon(json)` to
//! make the format discoverable at runtime — no npm package required.
//!
//! WASM interface (provided by the `relationaltext-wasm-format-adapter` lib):
//!   alloc / dealloc / result_len — memory boilerplate
//!   import(ptr, len) -> ptr     — raw pipe-delimited text → DocumentJSON
//!   export(ptr, len) -> ptr     — DocumentJSON → raw pipe-delimited text

use relationaltext_wasm_format_adapter::{read_str, write_result};

const TYPE_ID: &str = "my.plaintext.facet";
const FEATURE_NAME: &str = "paragraph";
/// UTF-8 byte length of U+FFFC (OBJECT REPLACEMENT CHARACTER) — the first block marker.
const FIRST_MARKER_BYTES: usize = 3; // 0xEF 0xBF 0xBC

// ─── import: raw pipe-delimited text → DocumentJSON ──────────────────────────

/// Parse pipe-delimited raw text into a DocumentJSON with paragraph blocks.
///
/// Each `|`-separated segment becomes one `my.plaintext.facet#paragraph` block.
/// The first block is delimited by U+FFFC; subsequent blocks by `\n`.
#[no_mangle]
pub extern "C" fn import(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_import(input);
    write_result(result)
}

fn do_import(raw: &str) -> String {
    let parts: Vec<&str> = raw.split('|').collect();
    if parts.is_empty() {
        return r#"{"text":"","facets":[]}"#.to_string();
    }

    // Build the document text: U+FFFC + parts[0] + (\n + parts[i] for i>0)
    let mut text = String::new();
    text.push('\u{FFFC}');
    for (i, part) in parts.iter().enumerate() {
        if i > 0 {
            text.push('\n');
        }
        text.push_str(part);
    }

    // Build facets — one per paragraph, covering its block marker.
    let mut facets_json = String::new();
    let mut byte_pos: usize = 0;
    for (i, part) in parts.iter().enumerate() {
        if i > 0 {
            facets_json.push(',');
        }
        let marker_start = byte_pos;
        let marker_end = if i == 0 {
            byte_pos + FIRST_MARKER_BYTES // U+FFFC = 3 UTF-8 bytes
        } else {
            byte_pos + 1 // '\n' = 1 byte
        };
        facets_json.push_str(&format!(
            r#"{{"index":{{"byteStart":{marker_start},"byteEnd":{marker_end}}},"features":[{{"$type":"{TYPE_ID}","name":"{FEATURE_NAME}"}}]}}"#
        ));
        byte_pos = marker_end + part.len();
    }

    let text_json = json_encode_str(&text);
    format!(r#"{{"text":{text_json},"facets":[{facets_json}]}}"#)
}

// ─── export: DocumentJSON → raw pipe-delimited text ──────────────────────────

/// Render a DocumentJSON back into pipe-delimited raw text.
///
/// Extracts the `text` field, strips the leading U+FFFC marker, and replaces
/// `\n` paragraph separators with `|`.
#[no_mangle]
pub extern "C" fn export(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    let result = do_export(input);
    write_result(result)
}

fn do_export(doc_json: &str) -> String {
    let json_text_val = match extract_text_field(doc_json) {
        Some(v) => v,
        None => return String::new(),
    };
    let text = decode_json_str_value(json_text_val);

    // Strip the leading U+FFFC block marker (3 UTF-8 bytes: EF BF BC).
    let start = if text.as_bytes().starts_with(&[0xEF, 0xBF, 0xBC]) {
        3
    } else {
        0
    };
    let body = &text[start..];

    // Replace '\n' paragraph separators with '|'.
    body.split('\n').collect::<Vec<_>>().join("|")
}

// ─── JSON helpers ─────────────────────────────────────────────────────────────

/// JSON-encode a string value, including surrounding double quotes.
fn json_encode_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Extract the raw JSON-encoded `"text"` value from a DocumentJSON string.
/// Returns the value including surrounding quotes, e.g. `"\"Hello\\nWorld\""`.
fn extract_text_field(json: &str) -> Option<&str> {
    let key = r#""text":"#;
    let start = json.find(key)?;
    let after_key = start + key.len();
    let value_start = json[after_key..].find(|c: char| !c.is_ascii_whitespace())?;
    let abs_start = after_key + value_start;

    if json.as_bytes().get(abs_start) != Some(&b'"') {
        return None;
    }

    let content = &json[abs_start + 1..];
    let mut end = 0;
    let mut escaped = false;
    for (i, b) in content.bytes().enumerate() {
        if escaped {
            escaped = false;
        } else if b == b'\\' {
            escaped = true;
        } else if b == b'"' {
            end = i;
            break;
        }
    }
    Some(&json[abs_start..abs_start + 1 + end + 1])
}

/// Decode a JSON string value (including surrounding quotes) to a Rust String.
fn decode_json_str_value(s: &str) -> String {
    // Strip surrounding quotes.
    let inner = if s.starts_with('"') && s.ends_with('"') && s.len() >= 2 {
        &s[1..s.len() - 1]
    } else {
        return String::new();
    };

    let bytes = inner.as_bytes();
    let mut result: Vec<u8> = Vec::with_capacity(inner.len());
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'\\' && i + 1 < bytes.len() {
            match bytes[i + 1] {
                b'n' => {
                    result.push(b'\n');
                    i += 2;
                }
                b'r' => {
                    result.push(b'\r');
                    i += 2;
                }
                b't' => {
                    result.push(b'\t');
                    i += 2;
                }
                b'\\' => {
                    result.push(b'\\');
                    i += 2;
                }
                b'"' => {
                    result.push(b'"');
                    i += 2;
                }
                b'/' => {
                    result.push(b'/');
                    i += 2;
                }
                b'b' => {
                    result.push(0x08);
                    i += 2;
                }
                b'f' => {
                    result.push(0x0C);
                    i += 2;
                }
                b'u' if i + 5 < bytes.len() => {
                    if let Ok(hex) = std::str::from_utf8(&bytes[i + 2..i + 6]) {
                        if let Ok(codepoint) = u32::from_str_radix(hex, 16) {
                            if let Some(ch) = char::from_u32(codepoint) {
                                let mut buf = [0u8; 4];
                                let encoded = ch.encode_utf8(&mut buf);
                                result.extend_from_slice(encoded.as_bytes());
                            }
                        }
                    }
                    i += 6;
                }
                _ => {
                    result.push(bytes[i]);
                    i += 1;
                }
            }
        } else {
            result.push(bytes[i]);
            i += 1;
        }
    }

    String::from_utf8(result).unwrap_or_default()
}
