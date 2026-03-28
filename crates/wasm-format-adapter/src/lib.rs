//! Memory boilerplate for RelationalText WASM format adapters.
//!
//! Format adapter WASM modules use a simple memory interface:
//!   alloc(size: i32) -> i32    — allocate input buffer
//!   dealloc(ptr: i32, size: i32) — free input buffer
//!   result_len() -> i32        — length of the last result
//!   <importFn>(ptr: i32, len: i32) -> i32  — raw string → DocumentJSON
//!   <exportFn>(ptr: i32, len: i32) -> i32  — DocumentJSON → raw string
//!
//! Link this crate into your adapter cdylib example. It exports `alloc`,
//! `dealloc`, and `result_len`, plus two unsafe helpers for reading input
//! and writing output.

use std::alloc::{alloc as sys_alloc, dealloc as sys_dealloc, Layout};
use std::cell::RefCell;

thread_local! {
    static RESULT_BUF: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

/// Allocate a buffer of `size` bytes for passing input into the WASM module.
#[no_mangle]
pub extern "C" fn alloc(size: i32) -> *mut u8 {
    let layout = Layout::from_size_align(size as usize, 1).unwrap();
    unsafe { sys_alloc(layout) }
}

/// Free a previously allocated input buffer.
#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: i32) {
    let layout = Layout::from_size_align(size as usize, 1).unwrap();
    unsafe { sys_dealloc(ptr, layout) }
}

/// Return the byte length of the most recent result written by `write_result`.
#[no_mangle]
pub extern "C" fn result_len() -> i32 {
    RESULT_BUF.with(|buf| buf.borrow().len() as i32)
}

/// Read a UTF-8 string from a WASM linear memory pointer.
///
/// # Safety
/// Caller must ensure `ptr..ptr+len` is a valid, initialized UTF-8 slice.
/// The returned reference borrows WASM linear memory and is only valid for
/// the duration of the current WASM call.
pub unsafe fn read_str<'a>(ptr: *mut u8, len: i32) -> &'a str {
    let slice = std::slice::from_raw_parts(ptr, len as usize);
    std::str::from_utf8_unchecked(slice)
}

/// Store `s` as the current result and return a pointer to it.
///
/// The caller should immediately read `result_len()` bytes from the returned
/// pointer — the buffer is overwritten on the next call to `write_result`.
///
/// # Safety
/// The returned pointer is only valid until the next call to `write_result`.
pub fn write_result(s: String) -> *mut u8 {
    RESULT_BUF.with(|buf| {
        let mut b = buf.borrow_mut();
        *b = s.into_bytes();
        b.as_mut_ptr()
    })
}
