//! Example RelationalText WASM transform: strip all inline marks from a document.
//!
//! Implements the RelationalText transform interface:
//!   alloc(size: i32) -> i32
//!   dealloc(ptr: i32, size: i32)
//!   transform(ptr: i32, len: i32) -> i32
//!   result_len() -> i32
//!
//! The transform function receives a DocumentJSON string and returns a
//! new DocumentJSON string with all facet features removed (marks stripped).

use std::alloc::{alloc as sys_alloc, dealloc as sys_dealloc, Layout};
use std::cell::RefCell;

thread_local! {
    static RESULT_BUF: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn alloc(size: i32) -> *mut u8 {
    let layout = Layout::from_size_align(size as usize, 1).unwrap();
    unsafe { sys_alloc(layout) }
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: i32) {
    let layout = Layout::from_size_align(size as usize, 1).unwrap();
    unsafe { sys_dealloc(ptr, layout) }
}

/// Returns the length of the most recent transform result.
#[no_mangle]
pub extern "C" fn result_len() -> i32 {
    RESULT_BUF.with(|buf| buf.borrow().len() as i32)
}

/// Transform a DocumentJSON: remove all features from all facets (strip marks).
///
/// - `ptr`: pointer to the UTF-8 JSON string in WASM memory
/// - `len`: byte length of the JSON string
///
/// Returns a pointer into the internal result buffer containing the transformed
/// DocumentJSON. Call `result_len()` to get the byte length.
#[no_mangle]
pub extern "C" fn transform(ptr: *const u8, len: i32) -> *const u8 {
    let input = unsafe {
        let slice = std::slice::from_raw_parts(ptr, len as usize);
        std::str::from_utf8_unchecked(slice)
    };

    // Parse as a simple JSON object to extract `text` and strip `facets`.
    // Use minimal JSON parsing: find the "text" value, output doc with empty facets.
    let output = strip_marks_json(input);

    RESULT_BUF.with(|buf| {
        let mut b = buf.borrow_mut();
        *b = output.into_bytes();
        b.as_ptr()
    })
}

/// Extract the "text" field from DocumentJSON and return a document with empty facets.
/// Uses simple string manipulation to avoid pulling in a JSON library.
fn strip_marks_json(input: &str) -> String {
    // Find the "text" field value.
    if let Some(text_val) = extract_text_field(input) {
        // Rebuild document with original text and empty facets.
        format!(r#"{{"text":{},"facets":[]}}"#, text_val)
    } else {
        // Fallback: return a minimal valid document.
        r#"{"text":"","facets":[]}"#.to_string()
    }
}

/// Extract the raw JSON value of the "text" field from a DocumentJSON string.
/// Returns the JSON-encoded value (including surrounding quotes for strings).
fn extract_text_field(json: &str) -> Option<&str> {
    // Look for `"text":` key
    let key = r#""text":"#;
    let start = json.find(key)?;
    let after_key = start + key.len();
    // Skip whitespace
    let value_start = json[after_key..].find(|c: char| !c.is_ascii_whitespace())?;
    let abs_start = after_key + value_start;

    // The text field is always a JSON string (starts with '"')
    if json.as_bytes().get(abs_start) != Some(&b'"') {
        return None;
    }

    // Find the end of the string (handle escaped quotes)
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
