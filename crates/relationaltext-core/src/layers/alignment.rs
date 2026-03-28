//! Alignment types for the Layers data model.
//!
//! Alignments map between parallel sequences (token-to-token across languages,
//! cross-tokenization mapping, interlinear glossing, etc.).

use serde::{Deserialize, Serialize};

use super::defs::{AlignmentLink, AnnotationMetadata, FeatureMap, ObjectRef};

/// An alignment between two parallel sequences.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Alignment {
    /// Reference to the source sequence (expression, tokenization, annotation layer, etc.).
    pub source_ref: ObjectRef,
    /// Reference to the target sequence.
    pub target_ref: ObjectRef,
    /// The alignment links.
    pub links: Vec<AlignmentLink>,
    /// Alignment kind (e.g., "word-alignment", "cross-tokenization", "interlinear").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<AnnotationMetadata>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::layers::defs::Uuid;

    #[test]
    fn alignment_roundtrip() {
        let alignment = Alignment {
            source_ref: ObjectRef {
                local_id: None,
                record_ref: Some("at://did:plc:abc/pub.layers.segmentation/seg-en".into()),
                object_id: Some(Uuid {
                    value: "tok-en".into(),
                }),
                knowledge_ref: None,
            },
            target_ref: ObjectRef {
                local_id: None,
                record_ref: Some("at://did:plc:abc/pub.layers.segmentation/seg-fr".into()),
                object_id: Some(Uuid {
                    value: "tok-fr".into(),
                }),
                knowledge_ref: None,
            },
            links: vec![
                AlignmentLink {
                    source_indices: Some(vec![0]),
                    target_indices: Some(vec![0, 1]),
                    confidence: Some(850),
                    label: None,
                    knowledge_refs: None,
                    features: None,
                },
                AlignmentLink {
                    source_indices: Some(vec![1]),
                    target_indices: Some(vec![2]),
                    confidence: None,
                    label: None,
                    knowledge_refs: None,
                    features: None,
                },
            ],
            kind: Some("word-alignment".into()),
            metadata: None,
            features: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&alignment).unwrap();
        let back: Alignment = serde_json::from_str(&json).unwrap();
        assert_eq!(alignment, back);
    }
}
