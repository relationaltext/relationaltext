//! Lexicon parsing via panproto's ATProto parser.

use panproto_protocols::web_document::atproto;
use panproto_schema::Schema;

use super::BridgeError;

/// Parse any ATProto lexicon JSON into a panproto schema.
///
/// Works for RT lexicons (`org.relationaltext.*`), Layers lexicons
/// (`pub.layers.*`), and any other ATProto lexicon.
pub fn parse_lexicon(json: &serde_json::Value) -> Result<Schema, BridgeError> {
    Ok(atproto::parse_lexicon(json)?)
}
