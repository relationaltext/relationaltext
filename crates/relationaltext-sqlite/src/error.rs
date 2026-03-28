//! Error conversion helpers for the SQLite extension.

use rusqlite::Error as RusqliteError;

/// Wrap a string error message into a `rusqlite::Error::UserFunctionError`.
pub fn user_error(msg: impl std::fmt::Display) -> RusqliteError {
    RusqliteError::UserFunctionError(Box::new(StringError(msg.to_string())))
}

/// Parse a DocumentJSON string, returning a `rusqlite::Error` on failure.
pub fn parse_doc(json: &str) -> Result<relationaltext_core::document::Document, RusqliteError> {
    relationaltext_core::serde_atproto::from_json(json)
        .map_err(|e| user_error(format!("rt: invalid document JSON: {e}")))
}

// ─── Internal ─────────────────────────────────────────────────────────────────

#[derive(Debug)]
struct StringError(String);

impl std::fmt::Display for StringError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for StringError {}
