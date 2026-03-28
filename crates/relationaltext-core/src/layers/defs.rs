//! Shared definitions for the Layers data model.
//!
//! These types correspond to `pub.layers.defs` in the ATProto lexicons and provide
//! abstract anchoring primitives, selectors, alignment links, and universal metadata.

use serde::{Deserialize, Serialize};

/// A universally unique identifier for cross-referencing annotation objects.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Uuid {
    pub value: String,
}

/// A contiguous span of text defined by UTF-8 byte offsets.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Span {
    /// Inclusive start UTF-8 byte offset (0-indexed).
    pub byte_start: u32,
    /// Exclusive end UTF-8 byte offset.
    pub byte_end: u32,
    /// Inclusive start character offset (optional).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub char_start: Option<u32>,
    /// Exclusive end character offset (optional).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub char_end: Option<u32>,
}

/// A reference to a specific token within a tokenization, by index.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenRef {
    /// UUID of the tokenization containing the referenced token.
    pub tokenization_id: Uuid,
    /// 0-based index of the token within its tokenization.
    pub token_index: u32,
}

/// A sequence of token references, possibly non-contiguous, within a single tokenization.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenRefSequence {
    /// UUID of the tokenization containing the referenced tokens.
    pub tokenization_id: Uuid,
    /// 0-based indices of the tokens.
    pub token_indexes: Vec<u32>,
    /// Optional head/anchor token index within the sequence.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor_token_index: Option<u32>,
}

/// A temporal span within a media source, defined by start and end times in milliseconds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TemporalSpan {
    /// Start time in milliseconds.
    pub start: u64,
    /// End time in milliseconds.
    pub ending: u64,
}

/// A spatial bounding box for image or video frame annotation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BoundingBox {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// A spatial annotation at a specific time point.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Keyframe {
    /// Time in milliseconds.
    pub time_ms: u64,
    pub bbox: BoundingBox,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

/// Combined spatial and temporal anchor for video annotation with keyframe-based tracking.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpatioTemporalAnchor {
    pub temporal_span: TemporalSpan,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keyframes: Option<Vec<Keyframe>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interpolation_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interpolation: Option<String>,
}

/// Anchor to a specific page and region in a paged document.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageAnchor {
    /// 0-indexed page number.
    pub page: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bounding_box: Option<BoundingBox>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_span: Option<Span>,
}

/// W3C TextQuoteSelector: selects text by quoting it with surrounding context.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TextQuoteSelector {
    pub exact: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suffix: Option<String>,
}

/// W3C TextPositionSelector: selects by UTF-8 byte offsets.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextPositionSelector {
    pub byte_start: u32,
    pub byte_end: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub char_start: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub char_end: Option<u32>,
}

/// W3C FragmentSelector: selects by URI fragment identifier.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FragmentSelector {
    pub value: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conforms_to: Option<String>,
}

/// A W3C-compatible selector union.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "$type")]
pub enum Selector {
    #[serde(rename = "pub.layers.defs#textQuoteSelector")]
    TextQuote(TextQuoteSelector),
    #[serde(rename = "pub.layers.defs#textPositionSelector")]
    TextPosition(TextPositionSelector),
    #[serde(rename = "pub.layers.defs#fragmentSelector")]
    Fragment(FragmentSelector),
}

/// Target for annotating external resources (web pages, documents, etc.).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalTarget {
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selector: Option<Selector>,
}

/// Abstract anchor: how an annotation attaches to its source data.
/// Polymorphic — consumers dispatch on which field(s) are populated.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Anchor {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_span: Option<Span>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_ref: Option<TokenRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_ref_sequence: Option<TokenRefSequence>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temporal_span: Option<TemporalSpan>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spatio_temporal_anchor: Option<SpatioTemporalAnchor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_anchor: Option<PageAnchor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub external_target: Option<ExternalTarget>,
}

/// A reference to an external knowledge base entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeRef {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_uri: Option<String>,
    pub source: String,
    pub identifier: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// A composable reference to any agent (human annotator, ML model, etc.).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRef {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub did: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_ref: Option<KnowledgeRef>,
}

/// Metadata about who or what produced an annotation, when, and with what confidence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<AgentRef>,
    pub tool: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub persona_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dependencies: Option<Vec<ObjectRef>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub digest: Option<String>,
}

/// A single key-value feature.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FeatureEntry {
    pub key: String,
    pub value: String,
}

/// An open-ended set of typed key-value features.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FeatureMap {
    pub entries: Vec<FeatureEntry>,
}

/// A composable reference to any Layers object, whether local, remote, or external.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectRef {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub record_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub object_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_ref: Option<KnowledgeRef>,
}

/// A normalized temporal value representing a point, interval, duration, or uncertain range.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemporalEntity {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub instant: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interval_start: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interval_end: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub earliest: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub granularity_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub granularity: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recurrence: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

/// Qualitative modification of a temporal value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemporalModifier {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mod_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "mod")]
    pub mod_slug: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

/// A complete temporal annotation packaging type, value, modifier, anchoring, and function.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemporalExpression {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub type_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "type")]
    pub type_slug: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<TemporalEntity>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modifier: Option<TemporalModifier>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor_ref: Option<ObjectRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub function_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub function: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

/// A normalized spatial value representing a point, region, line, or complex geometry.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpatialEntity {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bbox: Option<BoundingBox>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub type_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "type")]
    pub type_slug: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry_format_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub geometry_format: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crs_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crs: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dimensions: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uncertainty: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

/// Qualitative modification of a spatial value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpatialModifier {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mod_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "mod")]
    pub mod_slug: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

/// A complete spatial annotation packaging type, value, modifier, anchoring, and function.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpatialExpression {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub type_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "type")]
    pub type_slug: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<SpatialEntity>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modifier: Option<SpatialModifier>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor_ref: Option<ObjectRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub function_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub function: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

/// An abstract constraint expression.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Constraint {
    pub expression: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expression_format_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expression_format: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// A single link in an alignment between two parallel sequences.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignmentLink {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_indices: Option<Vec<u32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_indices: Option<Vec<u32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_refs: Option<Vec<KnowledgeRef>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub features: Option<FeatureMap>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn span_roundtrip() {
        let span = Span {
            byte_start: 0,
            byte_end: 10,
            char_start: None,
            char_end: None,
        };
        let json = serde_json::to_string(&span).unwrap();
        let back: Span = serde_json::from_str(&json).unwrap();
        assert_eq!(span, back);
    }

    #[test]
    fn span_with_char_offsets_roundtrip() {
        let span = Span {
            byte_start: 0,
            byte_end: 10,
            char_start: Some(0),
            char_end: Some(5),
        };
        let json = serde_json::to_string(&span).unwrap();
        let back: Span = serde_json::from_str(&json).unwrap();
        assert_eq!(span, back);
    }

    #[test]
    fn uuid_roundtrip() {
        let uuid = Uuid {
            value: "abc-123".into(),
        };
        let json = serde_json::to_string(&uuid).unwrap();
        let back: Uuid = serde_json::from_str(&json).unwrap();
        assert_eq!(uuid, back);
    }

    #[test]
    fn anchor_text_span_roundtrip() {
        let anchor = Anchor {
            text_span: Some(Span {
                byte_start: 5,
                byte_end: 20,
                char_start: None,
                char_end: None,
            }),
            token_ref: None,
            token_ref_sequence: None,
            temporal_span: None,
            spatio_temporal_anchor: None,
            page_anchor: None,
            external_target: None,
        };
        let json = serde_json::to_string(&anchor).unwrap();
        let back: Anchor = serde_json::from_str(&json).unwrap();
        assert_eq!(anchor, back);
    }

    #[test]
    fn knowledge_ref_roundtrip() {
        let kr = KnowledgeRef {
            source_uri: None,
            source: "wikidata".into(),
            identifier: "Q42".into(),
            uri: Some("https://www.wikidata.org/wiki/Q42".into()),
            label: Some("Douglas Adams".into()),
        };
        let json = serde_json::to_string(&kr).unwrap();
        let back: KnowledgeRef = serde_json::from_str(&json).unwrap();
        assert_eq!(kr, back);
    }

    #[test]
    fn annotation_metadata_roundtrip() {
        let meta = AnnotationMetadata {
            agent: Some(AgentRef {
                did: Some("did:plc:abc".into()),
                id: None,
                name: Some("Alice".into()),
                knowledge_ref: None,
            }),
            tool: "spaCy 3.7".into(),
            timestamp: Some("2024-01-01T00:00:00Z".into()),
            confidence: Some(950),
            persona_ref: None,
            dependencies: None,
            digest: None,
        };
        let json = serde_json::to_string(&meta).unwrap();
        let back: AnnotationMetadata = serde_json::from_str(&json).unwrap();
        assert_eq!(meta, back);
    }

    #[test]
    fn feature_map_roundtrip() {
        let fm = FeatureMap {
            entries: vec![
                FeatureEntry {
                    key: "pos".into(),
                    value: "NOUN".into(),
                },
                FeatureEntry {
                    key: "number".into(),
                    value: "singular".into(),
                },
            ],
        };
        let json = serde_json::to_string(&fm).unwrap();
        let back: FeatureMap = serde_json::from_str(&json).unwrap();
        assert_eq!(fm, back);
    }

    #[test]
    fn object_ref_local_roundtrip() {
        let oref = ObjectRef {
            local_id: Some(Uuid {
                value: "local-1".into(),
            }),
            record_ref: None,
            object_id: None,
            knowledge_ref: None,
        };
        let json = serde_json::to_string(&oref).unwrap();
        let back: ObjectRef = serde_json::from_str(&json).unwrap();
        assert_eq!(oref, back);
    }

    #[test]
    fn constraint_roundtrip() {
        let c = Constraint {
            expression: "self.pos == \"VERB\"".into(),
            expression_format_uri: None,
            expression_format: Some("python-expr".into()),
            scope_uri: None,
            scope: Some("slot".into()),
            context: None,
            description: Some("Must be a verb".into()),
        };
        let json = serde_json::to_string(&c).unwrap();
        let back: Constraint = serde_json::from_str(&json).unwrap();
        assert_eq!(c, back);
    }

    #[test]
    fn temporal_entity_roundtrip() {
        let te = TemporalEntity {
            instant: Some("2024-03-15".into()),
            interval_start: None,
            interval_end: None,
            duration: None,
            earliest: None,
            latest: None,
            granularity_uri: None,
            granularity: Some("day".into()),
            calendar_uri: None,
            calendar: None,
            recurrence: None,
            features: None,
        };
        let json = serde_json::to_string(&te).unwrap();
        let back: TemporalEntity = serde_json::from_str(&json).unwrap();
        assert_eq!(te, back);
    }

    #[test]
    fn spatial_entity_roundtrip() {
        let se = SpatialEntity {
            bbox: Some(BoundingBox {
                x: 10,
                y: 20,
                width: 100,
                height: 50,
            }),
            geometry: None,
            type_uri: None,
            type_slug: Some("box".into()),
            geometry_format_uri: None,
            geometry_format: None,
            crs_uri: None,
            crs: Some("pixel".into()),
            dimensions: Some(2),
            uncertainty: None,
            features: None,
        };
        let json = serde_json::to_string(&se).unwrap();
        let back: SpatialEntity = serde_json::from_str(&json).unwrap();
        assert_eq!(se, back);
    }

    #[test]
    fn alignment_link_roundtrip() {
        let link = AlignmentLink {
            source_indices: Some(vec![0, 1]),
            target_indices: Some(vec![0]),
            confidence: Some(900),
            label: None,
            knowledge_refs: None,
            features: None,
        };
        let json = serde_json::to_string(&link).unwrap();
        let back: AlignmentLink = serde_json::from_str(&json).unwrap();
        assert_eq!(link, back);
    }
}
