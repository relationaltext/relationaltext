//! SQLite loadable extension entry point.
//!
//! Build with:
//! ```bash
//! cargo build --example relationaltext_sqlite \
//!     --features loadable_extension \
//!     -p relationaltext-sqlite \
//!     --release
//! ```
//!
//! Then load in SQLite:
//! ```sql
//! .load ./target/release/examples/librelationaltext_sqlite
//! SELECT rt_version();
//! ```

use std::os::raw::{c_char, c_int};

use rusqlite::functions::FunctionFlags;
use rusqlite::vtab::eponymous_only_module;
use rusqlite::{ffi, Connection, Result};

use relationaltext_sqlite::{scalar, tvf};

fn register_all(conn: Connection) -> Result<bool> {
    let det = FunctionFlags::SQLITE_DETERMINISTIC;
    let none = FunctionFlags::empty();

    conn.create_scalar_function("rt_text", 1, det, scalar::rt_text)?;
    conn.create_scalar_function("rt_char_length", 1, det, scalar::rt_char_length)?;
    conn.create_scalar_function("rt_feature_count", 1, det, scalar::rt_feature_count)?;
    conn.create_scalar_function("rt_has_mark", 2, det, scalar::rt_has_mark_2)?;
    conn.create_scalar_function("rt_has_mark", 3, det, scalar::rt_has_mark_3)?;
    conn.create_scalar_function("rt_apply_lens", 2, none, scalar::rt_apply_lens)?;
    conn.create_scalar_function("rt_insert_text", 3, none, scalar::rt_insert_text)?;
    conn.create_scalar_function("rt_delete_text", 3, none, scalar::rt_delete_text)?;
    conn.create_scalar_function("rt_remove_mark", 4, none, scalar::rt_remove_mark)?;
    conn.create_scalar_function("rt_version", 0, det, scalar::rt_version)?;

    conn.create_module("rt_facets", eponymous_only_module::<tvf::RtFacets>(), None)?;
    conn.create_module("rt_blocks", eponymous_only_module::<tvf::RtBlocks>(), None)?;

    // Return false = non-persistent (unloaded when connection closes).
    // Return true  = persistent (remains for all connections in this process).
    Ok(false)
}

/// SQLite extension initialisation function.
///
/// SQLite calls this symbol when the extension is loaded via `.load` or
/// `sqlite3_load_extension()`.
#[allow(clippy::not_unsafe_ptr_arg_deref)]
#[no_mangle]
pub unsafe extern "C" fn sqlite3_relationaltext_sqlite_init(
    db: *mut ffi::sqlite3,
    pz_err_msg: *mut *mut c_char,
    p_api: *mut ffi::sqlite3_api_routines,
) -> c_int {
    Connection::extension_init2(db, pz_err_msg, p_api, register_all)
}
