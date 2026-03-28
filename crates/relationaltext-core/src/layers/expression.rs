//! The Expression record — the primary document model in Layers.
//!
//! An Expression represents any linguistic unit (document, transcript, recording,
//! paragraph, sentence, word, morpheme) with recursive nesting via parent references.

use serde::{Deserialize, Serialize};

use super::defs::{Anchor, AnnotationMetadata, FeatureMap, KnowledgeRef};

/// An expression record representing a linguistic data source or unit at any granularity.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Expression {
    /// A corpus-level unique identifier.
    pub id: String,
    /// AT-URI of the expression kind definition node.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind_uri: Option<String>,
    /// Expression kind slug.
    pub kind: String,
    /// The full raw text of the expression.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// Reference to the parent Expression this one is nested within.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_ref: Option<String>,
    /// How this expression attaches to its parent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<Anchor>,
    /// Reference to an associated media record.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_ref: Option<String>,
    /// BCP-47 language tag for the primary language.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// Additional BCP-47 tags for multilingual or code-switching expressions.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub languages: Option<Vec<String>>,
    /// Annotation metadata.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<AnnotationMetadata>,
    /// Arbitrary document-level features and metadata.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
    /// URL of the external web resource this expression was derived from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    /// AT-URI of an external ATProto record this expression is derived from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_ref: Option<String>,
    /// Reference to an eprint record.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub eprint_ref: Option<String>,
    /// References to knowledge base entries.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_refs: Option<Vec<KnowledgeRef>>,
    /// When this expression was created.
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expression_minimal_roundtrip() {
        let expr = Expression {
            id: "doc-001".into(),
            kind_uri: None,
            kind: "document".into(),
            text: Some("Hello, world!".into()),
            parent_ref: None,
            anchor: None,
            media_ref: None,
            language: Some("en".into()),
            languages: None,
            metadata: None,
            features: None,
            source_url: None,
            source_ref: None,
            eprint_ref: None,
            knowledge_refs: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&expr).unwrap();
        let back: Expression = serde_json::from_str(&json).unwrap();
        assert_eq!(expr, back);
    }

    #[test]
    fn expression_camel_case_keys() {
        let expr = Expression {
            id: "test".into(),
            kind_uri: Some("at://did:plc:abc/pub.layers.ontology/doc".into()),
            kind: "document".into(),
            text: Some("test".into()),
            parent_ref: Some("at://did:plc:abc/pub.layers.expression/parent".into()),
            anchor: None,
            media_ref: None,
            language: None,
            languages: None,
            metadata: None,
            features: None,
            source_url: Some("https://example.com".into()),
            source_ref: None,
            eprint_ref: None,
            knowledge_refs: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&expr).unwrap();
        assert!(json.contains("kindUri"));
        assert!(json.contains("parentRef"));
        assert!(json.contains("sourceUrl"));
        assert!(json.contains("createdAt"));
    }
}
