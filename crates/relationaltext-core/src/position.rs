//! UTF-8 byte↔char position mapping and facet range adjustment.
//!
//! atproto facets use byte offsets. Rust strings are UTF-8. This module
//! provides safe conversions between byte positions and char positions, and
//! logic for adjusting facet ranges after text edits.

use crate::document::{ByteSlice, Document};
use crate::lexicon::{FeatureClass, LexiconRegistry};
use thiserror::Error;

#[derive(Debug, Error, PartialEq)]
pub enum PositionError {
    #[error("byte position {pos} is not on a UTF-8 character boundary")]
    NotOnBoundary { pos: usize },
    #[error("byte position {pos} is out of range for text of length {len}")]
    OutOfRange { pos: usize, len: usize },
    #[error("byte range [{start}, {end}) is invalid")]
    InvalidRange { start: usize, end: usize },
}

/// Convert a `[byte_start, byte_end)` byte range to a `[char_start, char_end)` char range.
///
/// Returns an error if either bound is not on a UTF-8 character boundary.
pub fn byte_range_to_char_range(
    text: &str,
    byte_start: usize,
    byte_end: usize,
) -> Result<(usize, usize), PositionError> {
    if byte_start > byte_end {
        return Err(PositionError::InvalidRange {
            start: byte_start,
            end: byte_end,
        });
    }
    if byte_end > text.len() {
        return Err(PositionError::OutOfRange {
            pos: byte_end,
            len: text.len(),
        });
    }
    if !text.is_char_boundary(byte_start) {
        return Err(PositionError::NotOnBoundary { pos: byte_start });
    }
    if !text.is_char_boundary(byte_end) {
        return Err(PositionError::NotOnBoundary { pos: byte_end });
    }
    let char_start = text[..byte_start].chars().count();
    let char_end = char_start + text[byte_start..byte_end].chars().count();
    Ok((char_start, char_end))
}

/// Convert a `[char_start, char_end)` char range to a `[byte_start, byte_end)` byte range.
///
/// Returns an error if either index is out of range.
pub fn char_range_to_byte_range(
    text: &str,
    char_start: usize,
    char_end: usize,
) -> Result<(u32, u32), PositionError> {
    if char_start > char_end {
        return Err(PositionError::InvalidRange {
            start: char_start,
            end: char_end,
        });
    }
    let mut indices = text.char_indices();
    let mut byte_start = None;
    let mut byte_end = None;
    let mut i = 0;

    for (byte_pos, _) in &mut indices {
        if i == char_start {
            byte_start = Some(byte_pos);
        }
        if i == char_end {
            byte_end = Some(byte_pos);
            break;
        }
        i += 1;
    }

    // Handle char_start == char_end == text.chars().count()
    if byte_start.is_none() && char_start == i + 1 {
        byte_start = Some(text.len());
    }
    if byte_end.is_none() && char_end == i + 1 {
        byte_end = Some(text.len());
    }

    // Handle end == text.chars().count() (past last char)
    if byte_end.is_none() {
        let total_chars = text.chars().count();
        if char_end == total_chars {
            byte_end = Some(text.len());
        }
        if byte_start.is_none() && char_start == total_chars {
            byte_start = Some(text.len());
        }
    }

    let start = byte_start.ok_or(PositionError::OutOfRange {
        pos: char_start,
        len: text.chars().count(),
    })?;
    let end = byte_end.ok_or(PositionError::OutOfRange {
        pos: char_end,
        len: text.chars().count(),
    })?;

    Ok((start as u32, end as u32))
}

/// Adjust all facet ranges in `doc` after text was inserted at `byte_pos`.
///
/// The `inserted_byte_len` is the byte length of the inserted text.
///
/// Mark expand semantics (from Peritext), driven by the registry:
/// - If a feature's `expandEnd` is true and `byte_pos == mark.byte_end`, the mark expands rightward.
/// - If a feature's `expandStart` is true and `byte_pos == mark.byte_start`, the mark expands leftward.
/// - Block features never expand (text inserted before shifts the marker right).
///
/// All other features shift their ranges rightward if `byte_pos <= byte_start`.
pub fn adjust_facets_for_insert(
    doc: &mut Document,
    byte_pos: u32,
    inserted_byte_len: u32,
    registry: &LexiconRegistry,
) {
    if inserted_byte_len == 0 {
        return;
    }
    for facet in &mut doc.facets {
        let start = facet.index.byte_start;
        let end = facet.index.byte_end;

        // Block markers never expand; non-block features use registry expand semantics.
        let expand_start = facet
            .features
            .iter()
            .any(|f| match registry.feature_class(f) {
                FeatureClass::Block => false,
                _ => registry.expand_start(f),
            });
        let expand_end = facet
            .features
            .iter()
            .any(|f| match registry.feature_class(f) {
                FeatureClass::Block => false,
                _ => registry.expand_end(f),
            });

        // Adjust start
        if byte_pos < start || (byte_pos == start && !expand_start) {
            facet.index.byte_start = start + inserted_byte_len;
            facet.index.byte_end = end + inserted_byte_len;
        }
        // Adjust end (start stays, end grows)
        else if byte_pos < end || (byte_pos == end && expand_end) {
            facet.index.byte_end = end + inserted_byte_len;
        }
        // byte_pos > end, or byte_pos == end and !expand_end: no change
    }
}

/// Adjust all facet ranges in `doc` after text in `[byte_start, byte_end)` was deleted.
///
/// Facets that were entirely within the deleted range are removed.
/// Facets that partially overlap the deleted range are clipped.
/// Facets entirely after the deleted range are shifted left.
pub fn adjust_facets_for_delete(doc: &mut Document, del_start: u32, del_end: u32) {
    if del_start >= del_end {
        return;
    }
    let del_len = del_end - del_start;
    let mut retain = Vec::with_capacity(doc.facets.len());

    for mut facet in doc.facets.drain(..) {
        let s = facet.index.byte_start;
        let e = facet.index.byte_end;

        if e <= del_start {
            // Entirely before the deletion: unchanged
            retain.push(facet);
        } else if s >= del_end {
            // Entirely after the deletion: shift left
            facet.index.byte_start = s - del_len;
            facet.index.byte_end = e - del_len;
            retain.push(facet);
        } else {
            // Overlaps the deletion range
            let new_start = s.min(del_start);
            let new_end = if e > del_end { e - del_len } else { del_start };

            if new_start < new_end {
                facet.index.byte_start = new_start;
                facet.index.byte_end = new_end;
                retain.push(facet);
            }
            // else: facet collapsed to zero length, drop it
        }
    }

    doc.facets = retain;
}

/// Extract the text slice covered by a `ByteSlice`, validating the range.
pub fn slice_text<'a>(text: &'a str, range: &ByteSlice) -> Result<&'a str, PositionError> {
    let s = range.byte_start as usize;
    let e = range.byte_end as usize;
    if e > text.len() {
        return Err(PositionError::OutOfRange {
            pos: e,
            len: text.len(),
        });
    }
    if !text.is_char_boundary(s) {
        return Err(PositionError::NotOnBoundary { pos: s });
    }
    if !text.is_char_boundary(e) {
        return Err(PositionError::NotOnBoundary { pos: e });
    }
    Ok(&text[s..e])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::{ByteSlice, Facet, Feature};
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
        r.register(
            "org.relationaltext.richtext.mark#code",
            LexiconBehavior {
                feature_class: FeatureClass::InlineMark,
                expand_start: false,
                expand_end: false,
                void: false,
            },
        );
        r
    }

    fn mark_facet(start: u32, end: u32, name: &str) -> Facet {
        Facet::new(
            start,
            end,
            vec![Feature::new("org.relationaltext.richtext.mark")
                .with_data("name", serde_json::Value::String(name.into()))],
        )
    }

    fn block_facet(start: u32, end: u32) -> Facet {
        Facet::new(
            start,
            end,
            vec![Feature::new("org.relationaltext.richtext.block")
                .with_data("name", serde_json::Value::String("paragraph".into()))],
        )
    }

    #[test]
    fn byte_to_char_ascii() {
        assert_eq!(byte_range_to_char_range("hello", 0, 5), Ok((0, 5)));
        assert_eq!(byte_range_to_char_range("hello", 1, 3), Ok((1, 3)));
    }

    #[test]
    fn byte_to_char_multibyte() {
        // "héllo" — é is 2 bytes (0xC3 0xA9)
        let s = "héllo";
        assert_eq!(byte_range_to_char_range(s, 0, 6), Ok((0, 5)));
        // 'h' is 1 byte, 'é' starts at 1 and is 2 bytes
        assert_eq!(byte_range_to_char_range(s, 3, 6), Ok((2, 5)));
    }

    #[test]
    fn byte_to_char_invalid_boundary() {
        let s = "héllo";
        // byte 2 is inside 'é'
        assert!(byte_range_to_char_range(s, 2, 3).is_err());
    }

    #[test]
    fn char_to_byte_ascii() {
        assert_eq!(char_range_to_byte_range("hello", 0, 5), Ok((0, 5)));
        assert_eq!(char_range_to_byte_range("hello", 1, 3), Ok((1, 3)));
    }

    #[test]
    fn char_to_byte_multibyte() {
        let s = "héllo";
        assert_eq!(char_range_to_byte_range(s, 0, 1), Ok((0, 1)));
        assert_eq!(char_range_to_byte_range(s, 1, 2), Ok((1, 3)));
        assert_eq!(char_range_to_byte_range(s, 0, 5), Ok((0, 6)));
    }

    #[test]
    fn insert_shifts_facet_after() {
        let registry = test_registry();
        let mut doc = Document {
            text: "hello world".into(),
            facets: vec![mark_facet(6, 11, "bold")],
        };
        // Insert "big " strictly before the bold mark (at byte 5 — inside "hello")
        // This is before byte_start=6, so the mark must shift right by 4.
        doc.text.insert_str(5, "big ");
        adjust_facets_for_insert(&mut doc, 5, 4, &registry);
        assert_eq!(doc.facets[0].index.byte_start, 10);
        assert_eq!(doc.facets[0].index.byte_end, 15);
    }

    #[test]
    fn insert_at_bold_start_expands_bold() {
        let registry = test_registry();
        // Bold has expandStart=true: inserting AT the start of a bold span
        // should include the new text in the bold range (start stays, end grows).
        let mut doc = Document {
            text: "hello world".into(),
            facets: vec![mark_facet(6, 11, "bold")],
        };
        // Insert "big " at byte 6 (the start of "world" which is bold)
        doc.text.insert_str(6, "big ");
        adjust_facets_for_insert(&mut doc, 6, 4, &registry);
        // Bold expands: start stays at 6, end grows to 15
        assert_eq!(doc.facets[0].index.byte_start, 6);
        assert_eq!(doc.facets[0].index.byte_end, 15);
    }

    #[test]
    fn insert_expands_bold_at_end() {
        let registry = test_registry();
        // Bold should expand when text is inserted at its end boundary
        let mut doc = Document {
            text: "hello world".into(),
            facets: vec![mark_facet(0, 5, "bold")],
        };
        // Insert "!" at byte 5 (end of bold)
        doc.text.insert_str(5, "!");
        adjust_facets_for_insert(&mut doc, 5, 1, &registry);
        // Bold should expand to include "!"
        assert_eq!(doc.facets[0].index.byte_end, 6);
    }

    #[test]
    fn delete_removes_facet_inside_deleted_range() {
        let mut doc = Document {
            text: "hello world".into(),
            facets: vec![mark_facet(6, 11, "bold")],
        };
        adjust_facets_for_delete(&mut doc, 4, 11);
        assert!(doc.facets.is_empty());
    }

    #[test]
    fn delete_clips_overlapping_facet() {
        let mut doc = Document {
            text: "hello world".into(),
            facets: vec![mark_facet(3, 9, "bold")],
        };
        // Delete bytes 5..9 ("world" prefix)
        adjust_facets_for_delete(&mut doc, 5, 9);
        assert_eq!(doc.facets[0].index.byte_start, 3);
        assert_eq!(doc.facets[0].index.byte_end, 5);
    }

    #[test]
    fn delete_shifts_facet_after() {
        let mut doc = Document {
            text: "hello world".into(),
            facets: vec![mark_facet(6, 11, "bold")],
        };
        // Delete "hello " (0..6)
        adjust_facets_for_delete(&mut doc, 0, 6);
        assert_eq!(doc.facets[0].index.byte_start, 0);
        assert_eq!(doc.facets[0].index.byte_end, 5);
    }

    #[test]
    fn slice_text_valid() {
        let bs = ByteSlice {
            byte_start: 0,
            byte_end: 5,
        };
        assert_eq!(slice_text("hello world", &bs), Ok("hello"));
    }

    #[test]
    fn slice_text_out_of_range() {
        let bs = ByteSlice {
            byte_start: 0,
            byte_end: 100,
        };
        assert!(slice_text("hello", &bs).is_err());
    }

    #[test]
    fn block_marker_shifts_right_when_inserting_at_marker_start() {
        let registry = test_registry();
        // Marker at [8,9) ('\n'), insert "X" at byte 8 (AT the marker start).
        // Block markers don't expand, so the marker shifts right to [9,10).
        let mut doc = Document {
            text: "\u{FFFC}Hello\nWorld".into(),
            facets: vec![
                block_facet(0, 3), // \uFFFC marker
                block_facet(8, 9), // \n marker
            ],
        };
        doc.text.insert(8, 'X');
        adjust_facets_for_insert(&mut doc, 8, 1, &registry);
        // First marker at [0,3) — insert at 8 > 3 (after marker.end): no change
        assert_eq!(doc.facets[0].index.byte_start, 0);
        assert_eq!(doc.facets[0].index.byte_end, 3);
        // Second marker at [8,9) — insert at 8 == marker.start, no expand → shift right
        assert_eq!(doc.facets[1].index.byte_start, 9);
        assert_eq!(doc.facets[1].index.byte_end, 10);
    }

    #[test]
    fn block_marker_not_affected_by_insert_at_content_start() {
        let registry = test_registry();
        // Marker at [8,9) ('\n'), insert at byte 9 (content start of second block).
        // Content grows; marker stays fixed at [8,9).
        let mut doc = Document {
            text: "\u{FFFC}Hello\nWorld".into(),
            facets: vec![block_facet(0, 3), block_facet(8, 9)],
        };
        doc.text.insert_str(9, "X");
        adjust_facets_for_insert(&mut doc, 9, 1, &registry);
        // Markers unchanged
        assert_eq!(doc.facets[0].index.byte_start, 0);
        assert_eq!(doc.facets[0].index.byte_end, 3);
        assert_eq!(doc.facets[1].index.byte_start, 8);
        assert_eq!(doc.facets[1].index.byte_end, 9);
    }
}
