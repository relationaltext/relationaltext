use serde::{Deserialize, Serialize};

/// A rich text document: raw UTF-8 text plus a sorted list of facets.
///
/// This is the top-level wire format. The `text` field is always valid as
/// plain text for clients that don't understand facets.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Document {
    pub text: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub facets: Vec<Facet>,
}

impl Document {
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            facets: Vec::new(),
        }
    }

    pub fn with_facets(mut self, facets: Vec<Facet>) -> Self {
        self.facets = facets;
        self
    }
}

/// A facet: a byte range into the document's text, with one or more features.
///
/// A facet may carry multiple features (e.g., a range that is both a link
/// and bold). Features within a facet apply to the same byte range.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Facet {
    pub index: ByteSlice,
    pub features: Vec<Feature>,
}

impl Facet {
    pub fn new(byte_start: u32, byte_end: u32, features: Vec<Feature>) -> Self {
        Self {
            index: ByteSlice {
                byte_start,
                byte_end,
            },
            features,
        }
    }
}

/// A half-open byte range `[byte_start, byte_end)` into the document's UTF-8 text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ByteSlice {
    pub byte_start: u32,
    pub byte_end: u32,
}

impl ByteSlice {
    pub fn len(&self) -> u32 {
        self.byte_end.saturating_sub(self.byte_start)
    }

    pub fn is_empty(&self) -> bool {
        self.byte_start >= self.byte_end
    }

    pub fn contains(&self, pos: u32) -> bool {
        pos >= self.byte_start && pos < self.byte_end
    }

    pub fn overlaps(&self, other: &ByteSlice) -> bool {
        self.byte_start < other.byte_end && other.byte_start < self.byte_end
    }
}

/// A generic feature — any `$type` with its full JSON data preserved.
///
/// Features are identified by their `$type` string (the `type_id` field).
/// All other JSON fields are stored verbatim in `data` for round-trip fidelity.
///
/// Use a `LexiconRegistry` to query semantic behavior (is it a block? does it
/// expand?). The registry maps `$type` strings (and `$type#name` compound keys)
/// to `LexiconBehavior` descriptors.
///
/// Per AT Protocol's open union semantics, unrecognized `$type` values are
/// preserved intact — no data loss.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Feature {
    #[serde(rename = "$type")]
    pub type_id: String,

    /// All fields except `$type`, preserved verbatim for round-trip fidelity.
    #[serde(flatten)]
    pub data: serde_json::Map<String, serde_json::Value>,
}

impl Feature {
    pub fn new(type_id: impl Into<String>) -> Self {
        Self {
            type_id: type_id.into(),
            data: Default::default(),
        }
    }

    pub fn with_data(mut self, key: impl Into<String>, value: serde_json::Value) -> Self {
        self.data.insert(key.into(), value);
        self
    }

    /// Get a string field from data.
    pub fn get_str(&self, key: &str) -> Option<&str> {
        self.data.get(key)?.as_str()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn byte_slice_overlaps() {
        let a = ByteSlice {
            byte_start: 0,
            byte_end: 10,
        };
        let b = ByteSlice {
            byte_start: 5,
            byte_end: 15,
        };
        let c = ByteSlice {
            byte_start: 10,
            byte_end: 20,
        };
        assert!(a.overlaps(&b));
        assert!(b.overlaps(&a));
        assert!(!a.overlaps(&c));
        assert!(!c.overlaps(&a));
    }

    #[test]
    fn feature_roundtrip_mention() {
        let f = Feature::new("app.bsky.richtext.facet#mention")
            .with_data("did", serde_json::Value::String("did:plc:abc".into()));
        let json = serde_json::to_string(&f).unwrap();
        let back: Feature = serde_json::from_str(&json).unwrap();
        assert_eq!(f, back);
    }

    #[test]
    fn feature_roundtrip_mark() {
        let f = Feature::new("org.relationaltext.richtext.mark")
            .with_data("name", serde_json::Value::String("bold".into()));
        let json = serde_json::to_string(&f).unwrap();
        let back: Feature = serde_json::from_str(&json).unwrap();
        assert_eq!(f, back);
    }

    #[test]
    fn feature_roundtrip_block() {
        let f = Feature::new("org.relationaltext.richtext.block")
            .with_data("name", serde_json::Value::String("paragraph".into()))
            .with_data("parents", serde_json::Value::Array(vec![]));
        let json = serde_json::to_string(&f).unwrap();
        let back: Feature = serde_json::from_str(&json).unwrap();
        assert_eq!(f, back);
    }

    #[test]
    fn generic_feature_roundtrip_unknown_type() {
        // Unknown $type with extra fields — round-trips perfectly (no data loss)
        let json = r#"{"$type":"com.example.custom","foo":42,"bar":"baz"}"#;
        let f: Feature = serde_json::from_str(json).unwrap();
        assert_eq!(f.type_id, "com.example.custom");
        assert_eq!(
            f.data.get("foo"),
            Some(&serde_json::Value::Number(42.into()))
        );
        let back = serde_json::to_string(&f).unwrap();
        let f2: Feature = serde_json::from_str(&back).unwrap();
        assert_eq!(f, f2);
    }

    #[test]
    fn document_serialization_roundtrip() {
        let doc = Document {
            text: "Hello world".into(),
            facets: vec![Facet::new(
                0,
                5,
                vec![Feature::new("org.relationaltext.richtext.mark")
                    .with_data("name", serde_json::Value::String("bold".into()))],
            )],
        };
        let json = serde_json::to_string(&doc).unwrap();
        let back: Document = serde_json::from_str(&json).unwrap();
        assert_eq!(doc, back);
    }
}
