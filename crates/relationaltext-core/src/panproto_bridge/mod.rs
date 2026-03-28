//! Bridge between RelationalText and panproto.
//!
//! All lexicons (RT format lexicons, RT schema lexicons, Layers lexicons)
//! are ATProto Lexicon JSON — parsed by `atproto::parse_lexicon`.
//!
//! - [`schema`]: Lexicon parsing via panproto's ATProto parser
//! - [`instance`]: Document ↔ WInstance bidirectional conversion
//! - [`protolens`]: LensSpec → ProtolensChain translation (composes elementary constructors)
//! - [`layers`]: Layers ↔ RelationalText bridge (reads Layers lexicons from disk)

pub mod format_lexicon;
mod instance;
pub mod layers;
pub mod ontology;
pub mod protolens;
mod schema;
pub mod value_convert;

pub use format_lexicon::format_lexicon_to_atproto;
pub use instance::{document_to_winstance, winstance_to_document};
pub use protolens::lens_spec_to_protolens_chain;
pub use schema::parse_lexicon;

/// Ensure a lexicon JSON is in ATProto format.
///
/// If the input has `"lexicon": 1`, it is returned as-is.
/// If it has `"$type": "org.relationaltext.format-lexicon"`, it is
/// converted to an ATProto lexicon via [`format_lexicon_to_atproto`].
/// Otherwise returned as-is (best-effort).
pub fn ensure_atproto_lexicon(lex: &serde_json::Value) -> serde_json::Value {
    match format_lexicon_to_atproto(lex) {
        Ok(converted) => converted,
        Err(_) => lex.clone(),
    }
}

/// Build a panproto Schema from a WInstance (for dynamic-vertex documents).
///
/// This is the public interface to the schema-from-instance derivation
/// used by `apply_lens_to_doc` and `convert_via_panproto`.
pub fn build_instance_schema(
    instance: &panproto_inst::WInstance,
    protocol: &panproto_schema::Protocol,
) -> panproto_schema::Schema {
    crate::lens::build_schema_from_instance(instance, protocol)
}

/// Errors from the panproto bridge.
#[derive(Debug, thiserror::Error)]
pub enum BridgeError {
    #[error("protocol error: {0}")]
    Protocol(#[from] panproto_protocols::ProtocolError),
    #[error("lens error: {0}")]
    Lens(#[from] panproto_lens::LensError),
    #[error("missing root node in WInstance")]
    MissingRoot,
    #[error("invalid structure: {0}")]
    InvalidStructure(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}
