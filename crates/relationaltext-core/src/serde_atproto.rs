//! Serialization helpers for the atproto wire format.
//!
//! The primary wire format is JSON (serde_json). DAG-CBOR support is
//! structured as a feature flag for atproto's native encoding.
//!
//! Key invariants for atproto compatibility:
//! - `text` is always a UTF-8 string
//! - `facets` is an array sorted in canonical order
//! - Unknown `$type` values are preserved (open union semantics)
//! - byte ranges are u32 (fits all realistic text lengths)

use crate::document::Document;
use crate::lexicon::LexiconRegistry;
use crate::normalize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SerdeError {
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("document validation error: {0}")]
    Validation(String),
}

/// Parse a document from AT Protocol JSON.
///
/// The JSON must have a `text` field (string) and an optional `facets` array.
/// All feature `$type` values are preserved verbatim (open union semantics).
pub fn from_json(json: &str) -> Result<Document, SerdeError> {
    let doc: Document = serde_json::from_str(json)?;
    Ok(doc)
}

/// Serialize a document to AT Protocol JSON.
///
/// Normalizes facet order before serializing.
pub fn to_json(doc: &Document, registry: &LexiconRegistry) -> Result<String, SerdeError> {
    let mut doc = doc.clone();
    normalize::normalize(&mut doc, registry);
    Ok(serde_json::to_string(&doc)?)
}

/// Serialize a document to pretty-printed AT Protocol JSON.
pub fn to_json_pretty(doc: &Document, registry: &LexiconRegistry) -> Result<String, SerdeError> {
    let mut doc = doc.clone();
    normalize::normalize(&mut doc, registry);
    Ok(serde_json::to_string_pretty(&doc)?)
}

/// Parse a document from a `serde_json::Value`.
pub fn from_value(value: serde_json::Value) -> Result<Document, SerdeError> {
    let doc: Document = serde_json::from_value(value)?;
    Ok(doc)
}

/// Serialize a document to a `serde_json::Value`.
pub fn to_value(
    doc: &Document,
    registry: &LexiconRegistry,
) -> Result<serde_json::Value, SerdeError> {
    let mut doc = doc.clone();
    normalize::normalize(&mut doc, registry);
    Ok(serde_json::to_value(&doc)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::{Document, Facet, Feature};
    use crate::lexicon::{FeatureClass, LexiconBehavior, LexiconRegistry};

    fn test_registry() -> LexiconRegistry {
        let mut r = LexiconRegistry::new();
        r.register(
            "org.relationaltext.richtext.block#paragraph",
            LexiconBehavior {
                feature_class: FeatureClass::Block,
                expand_start: false,
                expand_end: false,
                void: false,
            },
        );
        r.register(
            "org.relationaltext.richtext.mark#bold",
            LexiconBehavior {
                feature_class: FeatureClass::InlineMark,
                expand_start: true,
                expand_end: true,
                void: false,
            },
        );
        r
    }

    #[test]
    fn roundtrip_simple_mention() {
        let registry = test_registry();
        let doc = Document {
            text: "@alice hello".into(),
            facets: vec![Facet::new(
                0,
                6,
                vec![Feature::new("app.bsky.richtext.facet#mention")
                    .with_data("did", serde_json::Value::String("did:plc:abc".into()))],
            )],
        };
        let json = to_json(&doc, &registry).unwrap();
        let back = from_json(&json).unwrap();
        assert_eq!(doc, back);
    }

    #[test]
    fn roundtrip_with_blocks_and_marks() {
        let registry = test_registry();
        let doc = Document {
            text: "Hello world\n".into(),
            facets: vec![
                Facet::new(
                    0,
                    12,
                    vec![Feature::new("org.relationaltext.richtext.block")
                        .with_data("name", serde_json::Value::String("paragraph".into()))],
                ),
                Facet::new(
                    6,
                    11,
                    vec![Feature::new("org.relationaltext.richtext.mark")
                        .with_data("name", serde_json::Value::String("bold".into()))],
                ),
            ],
        };
        let json = to_json(&doc, &registry).unwrap();
        let back = from_json(&json).unwrap();
        // After normalize, blocks come first (wider range at same start)
        assert_eq!(back.text, doc.text);
        assert_eq!(back.facets.len(), 2);
    }

    #[test]
    fn from_json_preserves_unknown_types() {
        let json = r#"{
            "text": "hello",
            "facets": [{
                "index": { "byteStart": 0, "byteEnd": 5 },
                "features": [{ "$type": "com.example.unknown", "someField": 42 }]
            }]
        }"#;
        let doc = from_json(json).unwrap();
        assert_eq!(doc.facets.len(), 1);
        // Unknown features now preserved with all fields intact
        assert_eq!(doc.facets[0].features[0].type_id, "com.example.unknown");
        assert_eq!(
            doc.facets[0].features[0].data.get("someField"),
            Some(&serde_json::Value::Number(42.into()))
        );
    }
}
