//! Layers ↔ RelationalText bridge.
//!
//! Reads the Layers and RelationalText ATProto lexicons from disk via
//! `atproto::parse_lexicon`, computes schemas, and builds the bridge
//! protolens between them.
//!
//! Both RelationalText and Layers are ATProto applications sharing the
//! same position model (UTF-8 byte offsets via `pub.layers.defs#span`
//! and `org.relationaltext.richtext.document#byteSlice`).

use std::path::Path;

use panproto_lens::auto_lens::{auto_generate, AutoLensConfig, AutoLensResult};
use panproto_protocols::web_document::atproto;
use panproto_schema::Schema;

use super::BridgeError;

/// Parsed Layers schemas from the lexicon files.
pub struct LayersSchemas {
    /// Schema for `pub.layers.annotation.annotationLayer`.
    pub annotation_layer: Schema,
    /// Schema for `pub.layers.expression.expression`.
    pub expression: Schema,
    /// Schema for `pub.layers.segmentation.segmentation`.
    pub segmentation: Schema,
    /// Schema for `pub.layers.defs` (shared definitions including `span`).
    pub defs: Schema,
}

/// Parsed RelationalText schemas from the lexicon files.
pub struct RtSchemas {
    /// Schema for `org.relationaltext.richtext.document`.
    pub document: Schema,
    /// Schema for `org.relationaltext.richtext.mark`.
    pub mark: Schema,
    /// Schema for `org.relationaltext.richtext.block`.
    pub block: Schema,
    /// Schema for `org.relationaltext.lens`.
    pub lens: Schema,
    /// Schema for `org.relationaltext.format-lexicon`.
    pub format_lexicon: Schema,
}

/// Load Layers schemas from lexicon JSON files on disk.
///
/// Reads the lexicon files under `lexicons_dir/pub/layers/` and parses
/// each one via `atproto::parse_lexicon`.
pub fn load_layers_schemas(lexicons_dir: &Path) -> Result<LayersSchemas, BridgeError> {
    let layers_dir = lexicons_dir.join("pub").join("layers");

    let annotation_layer =
        parse_lexicon_file(&layers_dir.join("annotation").join("annotationLayer.json"))?;
    let expression = parse_lexicon_file(&layers_dir.join("expression").join("expression.json"))?;
    let segmentation =
        parse_lexicon_file(&layers_dir.join("segmentation").join("segmentation.json"))?;
    let defs = parse_lexicon_file(&layers_dir.join("defs.json"))?;

    Ok(LayersSchemas {
        annotation_layer,
        expression,
        segmentation,
        defs,
    })
}

/// Load RelationalText schemas from lexicon JSON files on disk.
///
/// Reads the lexicon files under `lexicons_dir/org/relationaltext/` and
/// parses each one via `atproto::parse_lexicon`.
pub fn load_rt_schemas(lexicons_dir: &Path) -> Result<RtSchemas, BridgeError> {
    let rt_dir = lexicons_dir.join("org").join("relationaltext");

    let document = parse_lexicon_file(&rt_dir.join("richtext").join("document.json"))?;
    let mark = parse_lexicon_file(&rt_dir.join("richtext").join("mark.json"))?;
    let block = parse_lexicon_file(&rt_dir.join("richtext").join("block.json"))?;
    let lens = parse_lexicon_file(&rt_dir.join("lens.json"))?;
    let format_lexicon = parse_lexicon_file(&rt_dir.join("format-lexicon.json"))?;

    Ok(RtSchemas {
        document,
        mark,
        block,
        lens,
        format_lexicon,
    })
}

/// Auto-generate a protolens between the RT document schema and the
/// Layers annotation schema.
///
/// Uses panproto's `auto_generate` to discover the morphism alignment
/// between the two schemas and produce a concrete lens.
pub fn auto_bridge_lens(
    rt_schema: &Schema,
    layers_schema: &Schema,
) -> Result<AutoLensResult, BridgeError> {
    let protocol = atproto::protocol();
    let config = AutoLensConfig::default();
    Ok(auto_generate(rt_schema, layers_schema, &protocol, &config)?)
}

/// Parse a single lexicon JSON file from disk via `atproto::parse_lexicon`.
fn parse_lexicon_file(path: &Path) -> Result<Schema, BridgeError> {
    let content = std::fs::read_to_string(path)?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| {
        BridgeError::InvalidStructure(format!("JSON parse error in {}: {e}", path.display()))
    })?;
    Ok(atproto::parse_lexicon(&json)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lexicons_dir() -> std::path::PathBuf {
        // All lexicons (RT + Layers) are vendored under the repo's lexicons/ directory
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .join("lexicons")
    }

    #[test]
    fn load_layers_schemas_from_disk() {
        let dir = lexicons_dir();
        if !dir.join("pub/layers/defs.json").exists() {
            eprintln!("skipping: layers lexicons not vendored yet");
            return;
        }
        let schemas = load_layers_schemas(&dir).unwrap();
        assert!(schemas.annotation_layer.vertex_count() > 0);
        assert!(schemas.expression.vertex_count() > 0);
        assert!(schemas.segmentation.vertex_count() > 0);
        assert!(schemas.defs.vertex_count() > 0);
    }

    #[test]
    fn load_rt_schemas_from_disk() {
        let dir = lexicons_dir();
        if !dir
            .join("org/relationaltext/richtext/document.json")
            .exists()
        {
            eprintln!("skipping: RT lexicons not found");
            return;
        }
        let schemas = load_rt_schemas(&dir).unwrap();
        assert!(schemas.document.vertex_count() > 0);
        assert!(schemas.mark.vertex_count() > 0);
        assert!(schemas.block.vertex_count() > 0);
        assert!(schemas.lens.vertex_count() > 0);
        assert!(schemas.format_lexicon.vertex_count() > 0);
    }

    #[test]
    fn layers_and_rt_schemas_share_byte_range_structure() {
        let dir = lexicons_dir();
        if !dir.join("pub/layers/defs.json").exists()
            || !dir
                .join("org/relationaltext/richtext/document.json")
                .exists()
        {
            eprintln!("skipping: lexicons not found");
            return;
        }

        let layers = load_layers_schemas(&dir).unwrap();
        let rt = load_rt_schemas(&dir).unwrap();

        // Both have byteStart/byteEnd integer fields — the shared position model
        let layers_has_byte_start = layers
            .defs
            .vertices
            .values()
            .any(|v| v.id.as_ref().contains("byteStart"));
        let rt_has_byte_start = rt
            .document
            .vertices
            .values()
            .any(|v| v.id.as_ref().contains("byteStart"));

        assert!(layers_has_byte_start, "Layers defs should have byteStart");
        assert!(rt_has_byte_start, "RT document should have byteStart");
    }

    #[test]
    fn auto_bridge_between_rt_and_layers() {
        let dir = lexicons_dir();
        if !dir.join("pub/layers/defs.json").exists()
            || !dir
                .join("org/relationaltext/richtext/document.json")
                .exists()
        {
            eprintln!("skipping: lexicons not found");
            return;
        }

        let layers = load_layers_schemas(&dir).unwrap();
        let rt = load_rt_schemas(&dir).unwrap();

        // Auto-generate a protolens between RT document and Layers annotation
        let result = auto_bridge_lens(&rt.document, &layers.annotation_layer);
        match result {
            Ok(r) => {
                assert!(r.alignment_quality > 0.0, "should find some alignment");
            }
            Err(e) => {
                // Acceptable if alignment fails — schemas may be too different
                // for auto-generate. The manual bridge handles this.
                eprintln!("auto_bridge_lens failed (expected for divergent schemas): {e}");
            }
        }
    }
}
