//! Segmentation and tokenization types for the Layers data model.
//!
//! Corresponds to `pub.layers.segmentation.segmentation` and
//! `pub.layers.segmentation.defs`.

use serde::{Deserialize, Serialize};

use super::defs::{AnnotationMetadata, FeatureMap, KnowledgeRef, Span, TemporalSpan, Uuid};

/// A segmentation record that binds one or more tokenizations to an expression.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Segmentation {
    /// Reference to the expression this segmentation applies to.
    pub expression: String,
    /// The tokenizations in this segmentation.
    pub tokenizations: Vec<Tokenization>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<AnnotationMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_refs: Option<Vec<KnowledgeRef>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
    pub created_at: String,
}

/// An ordered sequence of tokens for an expression or sub-expression.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tokenization {
    pub uuid: Uuid,
    /// AT-URI of the tokenization kind definition node.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind_uri: Option<String>,
    /// Tokenization kind slug.
    pub kind: String,
    /// Reference to the specific sub-expression this tokenization covers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expression_ref: Option<String>,
    /// The ordered token sequence.
    pub tokens: Vec<Token>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<AnnotationMetadata>,
}

/// A single token within a tokenization.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Token {
    /// Position of this token in the tokenization (0-based).
    pub token_index: u32,
    /// The surface form of the token.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// UTF-8 byte offsets into the expression text.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_span: Option<Span>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temporal_span: Option<TemporalSpan>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_roundtrip() {
        let tok = Token {
            token_index: 0,
            text: Some("Hello".into()),
            text_span: Some(Span {
                byte_start: 0,
                byte_end: 5,
                char_start: None,
                char_end: None,
            }),
            temporal_span: None,
        };
        let json = serde_json::to_string(&tok).unwrap();
        let back: Token = serde_json::from_str(&json).unwrap();
        assert_eq!(tok, back);
    }

    #[test]
    fn tokenization_roundtrip() {
        let tokenization = Tokenization {
            uuid: Uuid {
                value: "tok-1".into(),
            },
            kind_uri: None,
            kind: "whitespace".into(),
            expression_ref: None,
            tokens: vec![
                Token {
                    token_index: 0,
                    text: Some("Hello".into()),
                    text_span: Some(Span {
                        byte_start: 0,
                        byte_end: 5,
                        char_start: None,
                        char_end: None,
                    }),
                    temporal_span: None,
                },
                Token {
                    token_index: 1,
                    text: Some("world".into()),
                    text_span: Some(Span {
                        byte_start: 6,
                        byte_end: 11,
                        char_start: None,
                        char_end: None,
                    }),
                    temporal_span: None,
                },
            ],
            metadata: None,
        };
        let json = serde_json::to_string(&tokenization).unwrap();
        let back: Tokenization = serde_json::from_str(&json).unwrap();
        assert_eq!(tokenization, back);
    }

    #[test]
    fn segmentation_roundtrip() {
        let seg = Segmentation {
            expression: "at://did:plc:abc/pub.layers.expression/doc1".into(),
            tokenizations: vec![Tokenization {
                uuid: Uuid {
                    value: "tok-1".into(),
                },
                kind_uri: None,
                kind: "whitespace".into(),
                expression_ref: None,
                tokens: vec![Token {
                    token_index: 0,
                    text: Some("Hello".into()),
                    text_span: None,
                    temporal_span: None,
                }],
                metadata: None,
            }],
            metadata: None,
            knowledge_refs: None,
            features: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&seg).unwrap();
        let back: Segmentation = serde_json::from_str(&json).unwrap();
        assert_eq!(seg, back);
    }
}
