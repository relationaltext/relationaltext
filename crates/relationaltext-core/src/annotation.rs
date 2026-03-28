//! atjson-compatible annotation model.
//!
//! This module provides a clean annotation abstraction that sits between the
//! raw `Document` (wire format) and the `HirNode` tree (render format).
//!
//! An `Annotation` is a typed, positioned marker on a text string. The
//! `AnnotationKind` enum distinguishes block-level from inline annotations,
//! mirroring atjson's `BlockAnnotation` / `InlineAnnotation` distinction.

use crate::document::{ByteSlice, Document, Feature};
use crate::lexicon::{FeatureClass, LexiconRegistry};
use std::collections::HashMap;

/// The kind of an annotation: block-level or inline.
#[derive(Debug, Clone, PartialEq)]
pub enum AnnotationKind {
    /// A block annotation covers a contiguous block of text (paragraph, heading, etc.).
    /// Block annotations must not overlap at the same nesting level.
    Block,
    /// An inline annotation covers a span within text (bold, link, mention, etc.).
    /// Inline annotations may freely overlap.
    Inline,
}

/// A typed, positioned annotation on a text string.
///
/// This is the atjson-style intermediate representation. It separates the
/// "what is this annotation?" question from the "where does it apply?" question.
#[derive(Debug, Clone, PartialEq)]
pub struct Annotation {
    pub kind: AnnotationKind,
    pub range: ByteSlice,
    pub type_name: String,
    pub attrs: HashMap<String, serde_json::Value>,
}

impl Annotation {
    pub fn is_block(&self) -> bool {
        self.kind == AnnotationKind::Block
    }

    pub fn is_inline(&self) -> bool {
        self.kind == AnnotationKind::Inline
    }
}

/// Extract a flat list of `Annotation`s from a `Document`.
///
/// Each feature in each facet becomes one annotation. This is the "exploded"
/// view of the document — one annotation per feature per facet.
pub fn extract_annotations(doc: &Document, registry: &LexiconRegistry) -> Vec<Annotation> {
    let mut annotations = Vec::new();

    for facet in &doc.facets {
        for feature in &facet.features {
            let (kind, type_name, attrs) = feature_to_annotation_parts(feature, registry);
            annotations.push(Annotation {
                kind,
                range: facet.index.clone(),
                type_name,
                attrs,
            });
        }
    }

    annotations.sort_by(|a, b| {
        a.range
            .byte_start
            .cmp(&b.range.byte_start)
            .then(b.range.byte_end.cmp(&a.range.byte_end))
    });

    annotations
}

fn feature_to_annotation_parts(
    feature: &Feature,
    registry: &LexiconRegistry,
) -> (AnnotationKind, String, HashMap<String, serde_json::Value>) {
    let class = registry.feature_class(feature);
    let kind = if class == FeatureClass::Block {
        AnnotationKind::Block
    } else {
        AnnotationKind::Inline
    };

    // type_name is the compound key: "$type#name" when name is present, else "$type"
    let type_name = if let Some(name) = feature.get_str("name") {
        format!("{}#{}", feature.type_id, name)
    } else {
        feature.type_id.clone()
    };

    let attrs: HashMap<String, serde_json::Value> = feature
        .data
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    (kind, type_name, attrs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::{Document, Facet, Feature};
    use crate::lexicon::{FeatureClass, LexiconBehavior, LexiconRegistry};

    fn test_registry() -> LexiconRegistry {
        let mut r = LexiconRegistry::new();
        r.register(
            "app.bsky.richtext.facet#mention",
            LexiconBehavior {
                feature_class: FeatureClass::Entity,
                expand_start: false,
                expand_end: false,
                void: false,
            },
        );
        r.register(
            "org.relationaltext.richtext.block#paragraph",
            LexiconBehavior {
                feature_class: FeatureClass::Block,
                expand_start: false,
                expand_end: false,
                void: false,
            },
        );
        r
    }

    #[test]
    fn mention_becomes_inline_annotation() {
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
        let annotations = extract_annotations(&doc, &registry);
        assert_eq!(annotations.len(), 1);
        assert_eq!(annotations[0].kind, AnnotationKind::Inline);
        assert_eq!(annotations[0].type_name, "app.bsky.richtext.facet#mention");
    }

    #[test]
    fn block_becomes_block_annotation() {
        let registry = test_registry();
        let doc = Document {
            text: "Hello\n".into(),
            facets: vec![Facet::new(
                0,
                6,
                vec![Feature::new("org.relationaltext.richtext.block")
                    .with_data("name", serde_json::Value::String("paragraph".into()))],
            )],
        };
        let annotations = extract_annotations(&doc, &registry);
        assert_eq!(annotations.len(), 1);
        assert_eq!(annotations[0].kind, AnnotationKind::Block);
        assert!(annotations[0].type_name.contains("paragraph"));
    }
}
