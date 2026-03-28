//! Facet normalization: sorting, validation, deduplication, and coalescing.
//!
//! Canonical sort order (§3.3 of the research doc):
//!   1. byteStart ascending
//!   2. byteEnd descending (wider ranges first — matches HTML nesting)
//!   3. same range: stable (preserves insertion order — outer marks first)

use crate::document::{Document, Facet};
use crate::lexicon::{FeatureClass, LexiconRegistry};
use thiserror::Error;

#[derive(Debug, Error, PartialEq)]
pub enum NormalizeError {
    #[error("block facets overlap: [{s1_start},{s1_end}) and [{s2_start},{s2_end})")]
    OverlappingBlocks {
        s1_start: u32,
        s1_end: u32,
        s2_start: u32,
        s2_end: u32,
    },
    #[error("byte range [{start},{end}) extends past text length {len}")]
    RangeOutOfBounds { start: u32, end: u32, len: u32 },
    #[error("byte range [{start},{end}) is inverted")]
    InvertedRange { start: u32, end: u32 },
    #[error("facet has an empty features array")]
    EmptyFeatures,
    #[error("block marker at [{start},{end}) must be '\\n' (U+000A, 1 byte) or '\\u{{FFFC}}' (U+FFFC, 3 bytes)")]
    BlockMarkerInvalidWidth { start: u32, end: u32 },
}

/// Sort facets into canonical order in-place.
pub fn sort_facets(facets: &mut Vec<Facet>) {
    facets.sort_by(|a, b| {
        let start_cmp = a.index.byte_start.cmp(&b.index.byte_start);
        if start_cmp.is_ne() {
            return start_cmp;
        }
        // Wider ranges first (byteEnd descending)
        let end_cmp = b.index.byte_end.cmp(&a.index.byte_end);
        if end_cmp.is_ne() {
            return end_cmp;
        }
        // Same range: stable sort preserves insertion order (outer marks inserted first)
        std::cmp::Ordering::Equal
    });
}

/// Validate that block facets don't overlap and all ranges are in bounds.
pub fn validate(doc: &Document, registry: &LexiconRegistry) -> Result<(), Vec<NormalizeError>> {
    let text_len = doc.text.len() as u32;
    let mut errors = Vec::new();

    for facet in &doc.facets {
        if facet.features.is_empty() {
            errors.push(NormalizeError::EmptyFeatures);
        }
        if facet.index.byte_start > facet.index.byte_end {
            errors.push(NormalizeError::InvertedRange {
                start: facet.index.byte_start,
                end: facet.index.byte_end,
            });
        }
        if facet.index.byte_end > text_len {
            errors.push(NormalizeError::RangeOutOfBounds {
                start: facet.index.byte_start,
                end: facet.index.byte_end,
                len: text_len,
            });
        }
    }

    // Check block markers: each block facet must cover exactly "\n" or "\u{FFFC}"
    for facet in &doc.facets {
        if facet
            .features
            .iter()
            .any(|feat| registry.feature_class(feat) == FeatureClass::Block)
            && facet.index.byte_start <= facet.index.byte_end
            && (facet.index.byte_end as usize) <= doc.text.len()
            && doc.text.is_char_boundary(facet.index.byte_start as usize)
            && doc.text.is_char_boundary(facet.index.byte_end as usize)
        {
            let marker = &doc.text[facet.index.byte_start as usize..facet.index.byte_end as usize];
            if marker != "\n" && marker != "\u{FFFC}" {
                errors.push(NormalizeError::BlockMarkerInvalidWidth {
                    start: facet.index.byte_start,
                    end: facet.index.byte_end,
                });
            }
        }
    }

    // Check blocks don't overlap
    let blocks: Vec<&Facet> = doc
        .facets
        .iter()
        .filter(|f| {
            f.features
                .iter()
                .any(|feat| registry.feature_class(feat) == FeatureClass::Block)
        })
        .collect();

    for i in 0..blocks.len() {
        for j in (i + 1)..blocks.len() {
            let a = &blocks[i].index;
            let b = &blocks[j].index;
            if a.overlaps(b) {
                errors.push(NormalizeError::OverlappingBlocks {
                    s1_start: a.byte_start,
                    s1_end: a.byte_end,
                    s2_start: b.byte_start,
                    s2_end: b.byte_end,
                });
            }
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

/// Remove facets with empty features arrays and deduplicate exact duplicates.
pub fn deduplicate(facets: &mut Vec<Facet>) {
    facets.retain(|f| !f.features.is_empty());
    facets.dedup_by(|a, b| {
        a.index == b.index && {
            // Merge features from `a` into `b` (dedup_by keeps `b`)
            b.features.extend(a.features.drain(..));
            true
        }
    });
}

/// Merge adjacent mark facets with identical features into a single facet.
///
/// Example: bold[0..5] + bold[5..10] → bold[0..10]
pub fn coalesce_marks(facets: &mut Vec<Facet>, registry: &LexiconRegistry) {
    if facets.len() < 2 {
        return;
    }

    let mut result: Vec<Facet> = Vec::with_capacity(facets.len());
    for facet in facets.drain(..) {
        if let Some(last) = result.last_mut() {
            // Only coalesce if adjacent and features are identical (and neither is a block)
            if last.index.byte_end == facet.index.byte_start
                && last.features == facet.features
                && !last
                    .features
                    .iter()
                    .any(|f| registry.feature_class(f) == FeatureClass::Block)
            {
                last.index.byte_end = facet.index.byte_end;
                continue;
            }
        }
        result.push(facet);
    }
    *facets = result;
}

/// Normalize a document in-place: sort, deduplicate, and coalesce marks.
pub fn normalize(doc: &mut Document, registry: &LexiconRegistry) {
    sort_facets(&mut doc.facets);
    deduplicate(&mut doc.facets);
    coalesce_marks(&mut doc.facets, registry);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::{Facet, Feature};
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

    fn bold(start: u32, end: u32) -> Facet {
        Facet::new(
            start,
            end,
            vec![Feature::new("org.relationaltext.richtext.mark")
                .with_data("name", serde_json::Value::String("bold".into()))],
        )
    }

    fn paragraph(start: u32, end: u32) -> Facet {
        Facet::new(
            start,
            end,
            vec![Feature::new("org.relationaltext.richtext.block")
                .with_data("name", serde_json::Value::String("paragraph".into()))],
        )
    }

    #[test]
    fn sort_by_start() {
        let mut facets = vec![bold(10, 20), bold(0, 5)];
        sort_facets(&mut facets);
        assert_eq!(facets[0].index.byte_start, 0);
        assert_eq!(facets[1].index.byte_start, 10);
    }

    #[test]
    fn sort_wider_first() {
        let mut facets = vec![bold(0, 5), bold(0, 10)];
        sort_facets(&mut facets);
        assert_eq!(facets[0].index.byte_end, 10); // wider first
        assert_eq!(facets[1].index.byte_end, 5);
    }

    #[test]
    fn validate_overlapping_blocks_error() {
        let doc = Document {
            text: "hello world".into(),
            facets: vec![paragraph(0, 6), paragraph(5, 11)],
        };
        assert!(validate(&doc, &test_registry()).is_err());
    }

    #[test]
    fn validate_out_of_bounds_error() {
        let doc = Document {
            text: "hi".into(),
            facets: vec![bold(0, 100)],
        };
        assert!(validate(&doc, &test_registry()).is_err());
    }

    #[test]
    fn coalesce_adjacent_marks() {
        let registry = test_registry();
        let mut facets = vec![bold(0, 5), bold(5, 10)];
        coalesce_marks(&mut facets, &registry);
        assert_eq!(facets.len(), 1);
        assert_eq!(facets[0].index.byte_start, 0);
        assert_eq!(facets[0].index.byte_end, 10);
    }

    #[test]
    fn coalesce_does_not_merge_blocks() {
        let registry = test_registry();
        let mut facets = vec![paragraph(0, 6), paragraph(6, 12)];
        coalesce_marks(&mut facets, &registry);
        assert_eq!(facets.len(), 2);
    }

    #[test]
    fn coalesce_does_not_merge_non_adjacent() {
        let registry = test_registry();
        let mut facets = vec![bold(0, 5), bold(6, 10)];
        coalesce_marks(&mut facets, &registry);
        assert_eq!(facets.len(), 2);
    }

    #[test]
    fn validate_block_marker_invalid_width_error() {
        // A block facet that covers "Hello" (5 bytes) — not a valid marker character
        let doc = Document {
            text: "Hello\n".into(),
            facets: vec![paragraph(0, 5)],
        };
        let errs = validate(&doc, &test_registry()).unwrap_err();
        assert!(errs
            .iter()
            .any(|e| matches!(e, NormalizeError::BlockMarkerInvalidWidth { .. })));
    }

    #[test]
    fn validate_block_marker_newline_is_valid() {
        let doc = Document {
            text: "\u{FFFC}Hello\nWorld".into(),
            facets: vec![
                paragraph(0, 3), // \uFFFC marker
                paragraph(8, 9), // \n marker
            ],
        };
        assert!(validate(&doc, &test_registry()).is_ok());
    }

    #[test]
    fn validate_block_marker_fffc_is_valid() {
        let doc = Document {
            text: "\u{FFFC}Hello".into(),
            facets: vec![paragraph(0, 3)],
        };
        assert!(validate(&doc, &test_registry()).is_ok());
    }
}

/// Remove a mark matching `type_key` from facets that exactly cover `[byte_start, byte_end)`.
///
/// `type_key` is a compound key (`$type#name`) or plain `$type`. Matching logic:
/// - If `type_key` contains `#`, split into `type_id` and `name`; match features where
///   both `type_id` and `data["name"]` agree.
/// - Otherwise match features whose `type_id` equals `type_key`.
///
/// Facets that become empty after feature removal are dropped entirely.
/// Returns `true` if any feature was removed.
pub fn remove_mark(doc: &mut Document, byte_start: u32, byte_end: u32, type_key: &str) -> bool {
    // Parse type_key for matching. Two strategies:
    // 1. Exact type_id match: feature.type_id == type_key (e.g. "app.bsky.richtext.facet#mention")
    // 2. Compound-key match: type_key = "$type#name" → split and match feature.type_id + feature.data["name"]
    //    (e.g. "org.relationaltext.richtext.mark#bold")
    let (match_type_id, match_name) = if let Some(hash_pos) = type_key.find('#') {
        (&type_key[..hash_pos], Some(&type_key[hash_pos + 1..]))
    } else {
        (type_key, None)
    };

    let mut removed = false;
    doc.facets.retain_mut(|facet| {
        if facet.index.byte_start == byte_start && facet.index.byte_end == byte_end {
            facet.features.retain(|feat| {
                // Strategy 1: exact type_id match
                let exact_match = feat.type_id == type_key;
                // Strategy 2: split compound-key match
                let compound_match = feat.type_id == match_type_id
                    && match match_name {
                        Some(n) => feat.get_str("name") == Some(n),
                        None => true,
                    };
                let should_remove = exact_match || compound_match;
                if should_remove {
                    removed = true;
                }
                !should_remove
            });
            // Drop facet entirely if no features remain
            if facet.features.is_empty() {
                return false;
            }
        }
        true
    });
    removed
}

#[cfg(test)]
mod remove_mark_tests {
    use super::*;
    use crate::document::{Facet, Feature};

    fn bold_facet(start: u32, end: u32) -> Facet {
        Facet::new(
            start,
            end,
            vec![Feature::new("org.relationaltext.richtext.mark")
                .with_data("name", serde_json::Value::String("bold".into()))],
        )
    }

    fn italic_facet(start: u32, end: u32) -> Facet {
        Facet::new(
            start,
            end,
            vec![Feature::new("org.relationaltext.richtext.mark")
                .with_data("name", serde_json::Value::String("italic".into()))],
        )
    }

    #[test]
    fn removes_exact_mark_by_compound_key() {
        let mut doc = Document {
            text: "Hello world".into(),
            facets: vec![bold_facet(0, 5)],
        };
        let removed = remove_mark(&mut doc, 0, 5, "org.relationaltext.richtext.mark#bold");
        assert!(removed);
        assert!(doc.facets.is_empty());
    }

    #[test]
    fn removes_mark_by_plain_type_id() {
        let mut doc = Document {
            text: "Hello world".into(),
            facets: vec![Facet::new(
                0,
                5,
                vec![Feature::new("app.bsky.richtext.facet#mention")],
            )],
        };
        let removed = remove_mark(&mut doc, 0, 5, "app.bsky.richtext.facet#mention");
        assert!(removed);
        assert!(doc.facets.is_empty());
    }

    #[test]
    fn leaves_other_marks_intact() {
        let mut doc = Document {
            text: "Hello world".into(),
            facets: vec![bold_facet(0, 5), italic_facet(0, 5)],
        };
        // Remove only bold
        let removed = remove_mark(&mut doc, 0, 5, "org.relationaltext.richtext.mark#bold");
        assert!(removed);
        assert_eq!(doc.facets.len(), 1);
        assert_eq!(doc.facets[0].features[0].get_str("name"), Some("italic"));
    }

    #[test]
    fn does_not_remove_different_range() {
        let mut doc = Document {
            text: "Hello world".into(),
            facets: vec![bold_facet(0, 5)],
        };
        let removed = remove_mark(&mut doc, 0, 11, "org.relationaltext.richtext.mark#bold");
        assert!(!removed);
        assert_eq!(doc.facets.len(), 1);
    }

    #[test]
    fn removes_feature_from_multi_feature_facet() {
        let mut doc = Document {
            text: "Hello world".into(),
            facets: vec![Facet::new(
                0,
                5,
                vec![
                    Feature::new("org.relationaltext.richtext.mark")
                        .with_data("name", serde_json::Value::String("bold".into())),
                    Feature::new("org.relationaltext.richtext.mark")
                        .with_data("name", serde_json::Value::String("italic".into())),
                ],
            )],
        };
        let removed = remove_mark(&mut doc, 0, 5, "org.relationaltext.richtext.mark#bold");
        assert!(removed);
        assert_eq!(doc.facets.len(), 1);
        assert_eq!(doc.facets[0].features.len(), 1);
        assert_eq!(doc.facets[0].features[0].get_str("name"), Some("italic"));
    }
}
