//! A Document enriched with Layers annotation records.
//!
//! When the document text is edited, annotation anchors are automatically
//! adjusted. When annotations are modified, the document's facets can be
//! updated via the protolens pipeline.

use crate::document::Document;

use super::alignment::Alignment;
use super::annotation::{Annotation, AnnotationLayer};
use super::expression::Expression;
use super::graph::{GraphEdgeSet, GraphNode};
use super::ontology::Ontology;
use super::segmentation::Segmentation;

/// A Document enriched with Layers annotation records.
///
/// When the document text is edited, annotation anchors are automatically
/// adjusted. When annotations are modified, the document's facets can be
/// updated via the protolens pipeline.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LayeredDocument {
    /// The underlying expression (text + metadata).
    pub expression: Expression,
    /// Segmentations bound to this expression.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub segmentations: Vec<Segmentation>,
    /// Annotation layers on this expression.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub annotation_layers: Vec<AnnotationLayer>,
    /// Ontologies referenced by annotations.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ontologies: Vec<Ontology>,
    /// Graph nodes (entity graphs, dependency graphs, etc.).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub graph_nodes: Vec<GraphNode>,
    /// Graph edge sets.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub graph_edge_sets: Vec<GraphEdgeSet>,
    /// Alignments between layers or expressions.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub alignments: Vec<Alignment>,
}

impl LayeredDocument {
    /// Create from a [`Document`], wrapping it as an [`Expression`].
    pub fn from_document(doc: &Document) -> Self {
        let expression = Expression {
            id: String::new(),
            kind_uri: None,
            kind: "document".into(),
            text: Some(doc.text.clone()),
            parent_ref: None,
            anchor: None,
            media_ref: None,
            language: None,
            languages: None,
            metadata: None,
            features: None,
            source_url: None,
            source_ref: None,
            eprint_ref: None,
            knowledge_refs: None,
            created_at: String::new(),
        };
        Self {
            expression,
            segmentations: Vec::new(),
            annotation_layers: Vec::new(),
            ontologies: Vec::new(),
            graph_nodes: Vec::new(),
            graph_edge_sets: Vec::new(),
            alignments: Vec::new(),
        }
    }

    /// Project back to a [`Document`] (via annotation to facet conversion).
    ///
    /// Currently returns a Document with the expression text and no facets.
    /// Facet generation from annotations will be implemented when the
    /// protolens pipeline integration is complete.
    pub fn to_document(&self) -> Document {
        let text = self.expression.text.clone().unwrap_or_default();
        Document::new(text)
    }

    /// Get all annotations at a given byte offset.
    pub fn annotations_at(&self, byte_offset: u32) -> Vec<&Annotation> {
        let mut result = Vec::new();
        for layer in &self.annotation_layers {
            for ann in &layer.annotations {
                if let Some(ref anchor) = ann.anchor {
                    if let Some(ref span) = anchor.text_span {
                        if byte_offset >= span.byte_start && byte_offset < span.byte_end {
                            result.push(ann);
                        }
                    }
                }
            }
        }
        result
    }

    /// Get all annotations whose span overlaps with the given byte range.
    pub fn annotations_in_range(&self, start: u32, end: u32) -> Vec<&Annotation> {
        let mut result = Vec::new();
        for layer in &self.annotation_layers {
            for ann in &layer.annotations {
                if let Some(ref anchor) = ann.anchor {
                    if let Some(ref span) = anchor.text_span {
                        if span.byte_start < end && start < span.byte_end {
                            result.push(ann);
                        }
                    }
                }
            }
        }
        result
    }

    /// Query annotations by kind, subkind, or label.
    ///
    /// Each filter is optional; only annotations matching all provided
    /// filters are returned.
    pub fn query(
        &self,
        kind: Option<&str>,
        subkind: Option<&str>,
        label: Option<&str>,
    ) -> Vec<&Annotation> {
        let mut result = Vec::new();
        for layer in &self.annotation_layers {
            if let Some(k) = kind {
                if layer.kind != k {
                    continue;
                }
            }
            if let Some(sk) = subkind {
                if layer.subkind.as_deref() != Some(sk) {
                    continue;
                }
            }
            for ann in &layer.annotations {
                if let Some(l) = label {
                    if ann.label.as_deref() != Some(l) {
                        continue;
                    }
                }
                result.push(ann);
            }
        }
        result
    }

    /// Add an annotation layer.
    pub fn add_layer(&mut self, layer: AnnotationLayer) {
        self.annotation_layers.push(layer);
    }

    /// Adjust all annotation anchors after text insert at `byte_pos`.
    ///
    /// Spans starting at or after `byte_pos` are shifted right by `inserted_len`.
    /// Spans containing `byte_pos` have their end extended by `inserted_len`.
    pub fn adjust_for_insert(&mut self, byte_pos: u32, inserted_len: u32) {
        for layer in &mut self.annotation_layers {
            for ann in &mut layer.annotations {
                if let Some(ref mut anchor) = ann.anchor {
                    if let Some(ref mut span) = anchor.text_span {
                        if span.byte_start >= byte_pos {
                            span.byte_start += inserted_len;
                            span.byte_end += inserted_len;
                        } else if span.byte_end > byte_pos {
                            span.byte_end += inserted_len;
                        }
                    }
                }
            }
        }
        // Also adjust segmentation tokens.
        for seg in &mut self.segmentations {
            for tokenization in &mut seg.tokenizations {
                for token in &mut tokenization.tokens {
                    if let Some(ref mut span) = token.text_span {
                        if span.byte_start >= byte_pos {
                            span.byte_start += inserted_len;
                            span.byte_end += inserted_len;
                        } else if span.byte_end > byte_pos {
                            span.byte_end += inserted_len;
                        }
                    }
                }
            }
        }
    }

    /// Adjust all annotation anchors after text delete from `start` to `end`.
    ///
    /// Spans fully within the deleted range are collapsed to zero-width at `start`.
    /// Spans partially overlapping are shrunk. Spans after the deletion are shifted left.
    pub fn adjust_for_delete(&mut self, start: u32, end: u32) {
        let deleted_len = end.saturating_sub(start);
        for layer in &mut self.annotation_layers {
            for ann in &mut layer.annotations {
                if let Some(ref mut anchor) = ann.anchor {
                    if let Some(ref mut span) = anchor.text_span {
                        adjust_span_for_delete(span, start, end, deleted_len);
                    }
                }
            }
        }
        for seg in &mut self.segmentations {
            for tokenization in &mut seg.tokenizations {
                for token in &mut tokenization.tokens {
                    if let Some(ref mut span) = token.text_span {
                        adjust_span_for_delete(span, start, end, deleted_len);
                    }
                }
            }
        }
    }
}

fn adjust_span_for_delete(span: &mut super::defs::Span, start: u32, end: u32, deleted_len: u32) {
    if span.byte_start >= end {
        // Entirely after deletion.
        span.byte_start -= deleted_len;
        span.byte_end -= deleted_len;
    } else if span.byte_end <= start {
        // Entirely before deletion — no change.
    } else if span.byte_start >= start && span.byte_end <= end {
        // Fully contained — collapse to zero-width at start.
        span.byte_start = start;
        span.byte_end = start;
    } else if span.byte_start < start && span.byte_end > end {
        // Deletion is inside this span.
        span.byte_end -= deleted_len;
    } else if span.byte_start < start {
        // Overlaps at end.
        span.byte_end = start;
    } else {
        // Overlaps at start (span.byte_start >= start && span.byte_end > end).
        span.byte_start = start;
        span.byte_end -= deleted_len;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::layers::annotation::{Annotation, AnnotationLayer};
    use crate::layers::defs::{Anchor, Span, Uuid};

    fn make_span_annotation(id: &str, byte_start: u32, byte_end: u32, label: &str) -> Annotation {
        Annotation {
            uuid: Uuid { value: id.into() },
            anchor: Some(Anchor {
                text_span: Some(Span {
                    byte_start,
                    byte_end,
                    char_start: None,
                    char_end: None,
                }),
                token_ref: None,
                token_ref_sequence: None,
                temporal_span: None,
                spatio_temporal_anchor: None,
                page_anchor: None,
                external_target: None,
            }),
            token_index: None,
            label: Some(label.into()),
            value: None,
            text: None,
            parent_id: None,
            child_ids: None,
            head_index: None,
            target_index: None,
            arguments: None,
            confidence: None,
            ontology_type_ref: None,
            knowledge_refs: None,
            temporal: None,
            spatial: None,
            features: None,
        }
    }

    fn make_layer(
        kind: &str,
        subkind: Option<&str>,
        annotations: Vec<Annotation>,
    ) -> AnnotationLayer {
        AnnotationLayer {
            expression: "at://test/pub.layers.expression/doc1".into(),
            kind_uri: None,
            kind: kind.into(),
            subkind_uri: None,
            subkind: subkind.map(String::from),
            formalism_uri: None,
            formalism: None,
            source_method_uri: None,
            source_method: None,
            label_set: None,
            ontology_ref: None,
            tokenization_id: None,
            rank: None,
            alternatives_ref: None,
            parent_layer_ref: None,
            language: None,
            annotations,
            metadata: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        }
    }

    #[test]
    fn from_document_preserves_text() {
        let doc = Document::new("Hello, world!");
        let layered = LayeredDocument::from_document(&doc);
        assert_eq!(layered.expression.text.as_deref(), Some("Hello, world!"));
        assert_eq!(layered.expression.kind, "document");
    }

    #[test]
    fn to_document_recovers_text() {
        let doc = Document::new("Hello, world!");
        let layered = LayeredDocument::from_document(&doc);
        let recovered = layered.to_document();
        assert_eq!(recovered.text, "Hello, world!");
    }

    #[test]
    fn annotations_at_finds_matching() {
        let mut layered = LayeredDocument::from_document(&Document::new("Alice saw Bob"));
        layered.add_layer(make_layer(
            "span",
            Some("ner"),
            vec![
                make_span_annotation("a1", 0, 5, "PER"),   // "Alice"
                make_span_annotation("a2", 10, 13, "PER"), // "Bob"
            ],
        ));

        let at_0 = layered.annotations_at(0);
        assert_eq!(at_0.len(), 1);
        assert_eq!(at_0[0].label.as_deref(), Some("PER"));
        assert_eq!(at_0[0].uuid.value, "a1");

        let at_10 = layered.annotations_at(10);
        assert_eq!(at_10.len(), 1);
        assert_eq!(at_10[0].uuid.value, "a2");

        // Between spans — no match.
        let at_7 = layered.annotations_at(7);
        assert!(at_7.is_empty());
    }

    #[test]
    fn annotations_in_range_finds_overlapping() {
        let mut layered = LayeredDocument::from_document(&Document::new("Alice saw Bob"));
        layered.add_layer(make_layer(
            "span",
            Some("ner"),
            vec![
                make_span_annotation("a1", 0, 5, "PER"),
                make_span_annotation("a2", 10, 13, "PER"),
            ],
        ));

        // Range covering "Alice saw" — should find a1.
        let in_range = layered.annotations_in_range(0, 9);
        assert_eq!(in_range.len(), 1);
        assert_eq!(in_range[0].uuid.value, "a1");

        // Range covering everything.
        let all = layered.annotations_in_range(0, 13);
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn query_by_kind_and_subkind() {
        let mut layered = LayeredDocument::from_document(&Document::new("test"));
        layered.add_layer(make_layer(
            "span",
            Some("ner"),
            vec![make_span_annotation("a1", 0, 4, "PER")],
        ));
        layered.add_layer(make_layer(
            "token-tag",
            Some("pos"),
            vec![Annotation {
                uuid: Uuid { value: "a2".into() },
                anchor: None,
                token_index: Some(0),
                label: Some("NOUN".into()),
                value: None,
                text: None,
                parent_id: None,
                child_ids: None,
                head_index: None,
                target_index: None,
                arguments: None,
                confidence: None,
                ontology_type_ref: None,
                knowledge_refs: None,
                temporal: None,
                spatial: None,
                features: None,
            }],
        ));

        let ner = layered.query(Some("span"), Some("ner"), None);
        assert_eq!(ner.len(), 1);

        let pos = layered.query(Some("token-tag"), Some("pos"), None);
        assert_eq!(pos.len(), 1);

        let nouns = layered.query(None, None, Some("NOUN"));
        assert_eq!(nouns.len(), 1);

        let verbs = layered.query(None, None, Some("VERB"));
        assert!(verbs.is_empty());
    }

    #[test]
    fn adjust_for_insert_shifts_spans() {
        let mut layered = LayeredDocument::from_document(&Document::new("AB"));
        layered.add_layer(make_layer(
            "span",
            None,
            vec![
                make_span_annotation("before", 0, 1, "X"), // "A" [0,1)
                make_span_annotation("after", 1, 2, "Y"),  // "B" [1,2)
            ],
        ));

        // Insert 3 bytes at position 1 (between A and B).
        layered.adjust_for_insert(1, 3);

        let anns = &layered.annotation_layers[0].annotations;
        // "before" span [0,1) should be unchanged (entirely before insert point at boundary).
        // Actually: byte_start=0 < byte_pos=1, and byte_end=1 is not > byte_pos=1, so no change.
        let before = &anns[0];
        let before_span = before.anchor.as_ref().unwrap().text_span.as_ref().unwrap();
        assert_eq!(before_span.byte_start, 0);
        assert_eq!(before_span.byte_end, 1);

        // "after" span [1,2) should become [4,5).
        let after = &anns[1];
        let after_span = after.anchor.as_ref().unwrap().text_span.as_ref().unwrap();
        assert_eq!(after_span.byte_start, 4);
        assert_eq!(after_span.byte_end, 5);
    }

    #[test]
    fn adjust_for_insert_extends_containing_span() {
        let mut layered = LayeredDocument::from_document(&Document::new("Hello"));
        layered.add_layer(make_layer(
            "span",
            None,
            vec![make_span_annotation("s1", 0, 5, "WORD")], // "Hello" [0,5)
        ));

        // Insert 3 bytes at position 2 (inside the span).
        layered.adjust_for_insert(2, 3);

        let span = layered.annotation_layers[0].annotations[0]
            .anchor
            .as_ref()
            .unwrap()
            .text_span
            .as_ref()
            .unwrap();
        assert_eq!(span.byte_start, 0);
        assert_eq!(span.byte_end, 8);
    }

    #[test]
    fn adjust_for_delete_shrinks_and_shifts() {
        let mut layered = LayeredDocument::from_document(&Document::new("ABCDE"));
        layered.add_layer(make_layer(
            "span",
            None,
            vec![
                make_span_annotation("s1", 0, 2, "X"), // "AB" [0,2)
                make_span_annotation("s2", 1, 4, "Y"), // "BCD" [1,4)
                make_span_annotation("s3", 4, 5, "Z"), // "E" [4,5)
            ],
        ));

        // Delete bytes [2,4) — removing "CD".
        layered.adjust_for_delete(2, 4);

        let anns = &layered.annotation_layers[0].annotations;

        // s1 [0,2) — entirely before deletion, no change.
        let s1 = anns[0].anchor.as_ref().unwrap().text_span.as_ref().unwrap();
        assert_eq!(s1.byte_start, 0);
        assert_eq!(s1.byte_end, 2);

        // s2 [1,4) — overlaps at end: byte_start < start(2), so byte_end = start(2).
        let s2 = anns[1].anchor.as_ref().unwrap().text_span.as_ref().unwrap();
        assert_eq!(s2.byte_start, 1);
        assert_eq!(s2.byte_end, 2);

        // s3 [4,5) — entirely after deletion, shifted left by 2.
        let s3 = anns[2].anchor.as_ref().unwrap().text_span.as_ref().unwrap();
        assert_eq!(s3.byte_start, 2);
        assert_eq!(s3.byte_end, 3);
    }

    #[test]
    fn adjust_for_delete_collapses_contained_span() {
        let mut layered = LayeredDocument::from_document(&Document::new("ABCDE"));
        layered.add_layer(make_layer(
            "span",
            None,
            vec![make_span_annotation("s1", 1, 3, "X")], // "BC" [1,3)
        ));

        // Delete [0,5) — the entire text.
        layered.adjust_for_delete(0, 5);

        let s1 = layered.annotation_layers[0].annotations[0]
            .anchor
            .as_ref()
            .unwrap()
            .text_span
            .as_ref()
            .unwrap();
        // Fully contained — collapsed to zero-width at start.
        assert_eq!(s1.byte_start, 0);
        assert_eq!(s1.byte_end, 0);
    }

    #[test]
    fn layered_document_serde_roundtrip() {
        let mut layered = LayeredDocument::from_document(&Document::new("test"));
        layered.add_layer(make_layer(
            "span",
            Some("ner"),
            vec![make_span_annotation("a1", 0, 4, "ORG")],
        ));

        let json = serde_json::to_string(&layered).unwrap();
        let back: LayeredDocument = serde_json::from_str(&json).unwrap();
        assert_eq!(back.expression.text, layered.expression.text);
        assert_eq!(back.annotation_layers.len(), 1);
        assert_eq!(back.annotation_layers[0].annotations.len(), 1);
    }
}
