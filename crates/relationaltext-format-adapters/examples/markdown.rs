//! Shared markdown WASM format adapter.
//!
//! A single binary handles CommonMark, GitLab Flavored Markdown, Obsidian,
//! MyST, and MultiMarkdown. Each format's lexicon JSON references this binary
//! with its own importFn/exportFn.
//!
//! Exported functions:
//!   import / export           — CommonMark (backward compat aliases)
//!   import_commonmark / export_commonmark
//!   import_gitlab / export_gitlab
//!   import_obsidian / export_obsidian
//!   import_myst / export_myst
//!   import_multimarkdown / export_multimarkdown

use relationaltext_core::LexiconRegistry;
use relationaltext_format_adapters::md_shared::{do_export, do_import, FormatVariant, MdConfig};
use relationaltext_wasm_format_adapter::{read_str, write_result};
use serde_json::Value;
use std::sync::OnceLock;

// ─── Lexicon data ───────────────────────────────────────────────────────────────

const CM_LEXICON: &[u8] = include_bytes!("../../../formats/org.commonmark/commonmark.lexicon.json");
const GFM_LEXICON: &[u8] = include_bytes!("../../../formats/org.commonmark/gfm.lexicon.json");
const GL_LEXICON: &[u8] = include_bytes!("../../../formats/com.gitlab/gitlab.lexicon.json");
const OB_LEXICON: &[u8] = include_bytes!("../../../formats/md.obsidian/obsidian.lexicon.json");
const MY_LEXICON: &[u8] = include_bytes!("../../../formats/org.mystmd/myst.lexicon.json");
const MM_LEXICON: &[u8] =
    include_bytes!("../../../formats/org.multimarkdown/multimarkdown.lexicon.json");

// ─── Registries (one per format) ───────────────────────────────────────────────

static CM_REGISTRY: OnceLock<LexiconRegistry> = OnceLock::new();
static GL_REGISTRY: OnceLock<LexiconRegistry> = OnceLock::new();
static OB_REGISTRY: OnceLock<LexiconRegistry> = OnceLock::new();
static MY_REGISTRY: OnceLock<LexiconRegistry> = OnceLock::new();
static MM_REGISTRY: OnceLock<LexiconRegistry> = OnceLock::new();

fn load_registry(lexicons: &[&[u8]]) -> LexiconRegistry {
    let empty: Vec<Value> = Vec::new();
    let mut r = LexiconRegistry::new();
    for &data in lexicons {
        let v: Value = serde_json::from_slice(data).unwrap_or(Value::Null);
        let features = v["features"].as_array().unwrap_or(&empty);
        let _ = r.register_from_json_array(features);
    }
    r
}

fn cm_registry() -> &'static LexiconRegistry {
    CM_REGISTRY.get_or_init(|| load_registry(&[CM_LEXICON, GFM_LEXICON]))
}
fn gl_registry() -> &'static LexiconRegistry {
    GL_REGISTRY.get_or_init(|| load_registry(&[GL_LEXICON]))
}
fn ob_registry() -> &'static LexiconRegistry {
    OB_REGISTRY.get_or_init(|| load_registry(&[OB_LEXICON]))
}
fn my_registry() -> &'static LexiconRegistry {
    MY_REGISTRY.get_or_init(|| load_registry(&[MY_LEXICON]))
}
fn mm_registry() -> &'static LexiconRegistry {
    MM_REGISTRY.get_or_init(|| load_registry(&[MM_LEXICON]))
}

// ─── Format configs ─────────────────────────────────────────────────────────────

const CM_CFG: MdConfig = MdConfig {
    primary_ns: "org.commonmark.facet",
    gfm_ns: Some("org.gfm.facet"),
    variant: FormatVariant::CommonMark,
};
const GL_CFG: MdConfig = MdConfig {
    primary_ns: "com.gitlab.facet",
    gfm_ns: None,
    variant: FormatVariant::GitLab,
};
const OB_CFG: MdConfig = MdConfig {
    primary_ns: "md.obsidian.facet",
    gfm_ns: None,
    variant: FormatVariant::Obsidian,
};
const MY_CFG: MdConfig = MdConfig {
    primary_ns: "org.mystmd.facet",
    gfm_ns: None,
    variant: FormatVariant::MyST,
};
const MM_CFG: MdConfig = MdConfig {
    primary_ns: "org.multimarkdown.facet",
    gfm_ns: None,
    variant: FormatVariant::MultiMarkdown,
};

// ─── CommonMark (backward compat: `import` / `export`) ─────────────────────────

#[no_mangle]
pub extern "C" fn import(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    write_result(do_import(input, &CM_CFG))
}

#[no_mangle]
pub extern "C" fn export(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    write_result(do_export(input, cm_registry()))
}

// ─── CommonMark ──────────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn import_commonmark(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    write_result(do_import(input, &CM_CFG))
}

#[no_mangle]
pub extern "C" fn export_commonmark(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    write_result(do_export(input, cm_registry()))
}

// ─── GitLab ──────────────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn import_gitlab(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    write_result(do_import(input, &GL_CFG))
}

#[no_mangle]
pub extern "C" fn export_gitlab(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    write_result(do_export(input, gl_registry()))
}

// ─── Obsidian ────────────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn import_obsidian(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    write_result(do_import(input, &OB_CFG))
}

#[no_mangle]
pub extern "C" fn export_obsidian(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    write_result(do_export(input, ob_registry()))
}

// ─── MyST ────────────────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn import_myst(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    write_result(do_import(input, &MY_CFG))
}

#[no_mangle]
pub extern "C" fn export_myst(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    write_result(do_export(input, my_registry()))
}

// ─── MultiMarkdown ───────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn import_multimarkdown(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    write_result(do_import(input, &MM_CFG))
}

#[no_mangle]
pub extern "C" fn export_multimarkdown(ptr: *mut u8, len: i32) -> *mut u8 {
    let input = unsafe { read_str(ptr, len) };
    write_result(do_export(input, mm_registry()))
}
