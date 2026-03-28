import * as AM from '@automerge/automerge';
import { Document } from './core.js';
import './types.js';
import './wasm.js';
import './wasm/relationaltext_wasm.js';

/**
 * Automerge rich text importer and exporter for RelationalText documents.
 *
 * Import: `from('automerge', doc)` → Document  (or directly: `fromAutomerge(doc, path)`)
 * Export: `to('automerge', rtDoc)` → updated AM.Doc  (or directly: `toAutomerge(rtDoc, doc, path)`)
 *
 * Both formats use the same theoretical model (Peritext for marks,
 * Kleppmann blocks for block elements), so the mapping is structural.
 *
 * Automerge marks become `org.automerge.richtext.facet#<name>` features.
 * Automerge block spans become block facets covering the RelationalText
 * block marker byte (`\uFFFC` for the first block, `\n` for subsequent ones).
 *
 * @automerge/automerge is a peer dependency — install it in your project:
 *   npm install @automerge/automerge
 *
 * Call `ensureAutomergeLexicon()` once at application startup to register
 * expand semantics for Automerge-native feature types.
 */

declare function ensureAutomergeLexicon(): void;
/**
 * Convert an Automerge document's rich text field at `path` into a
 * RelationalText Document.
 *
 * @param doc  - An Automerge document.
 * @param path - Property path to the text field, e.g. `['content']`.
 */
declare function fromAutomerge(doc: AM.Doc<unknown>, path: string[]): Document;
/**
 * Write the content of a RelationalText Document into an Automerge document's
 * rich text field at `path`.
 *
 * Returns the new Automerge document (Automerge documents are immutable;
 * `AM.change()` produces a new version).
 *
 * @param rtDoc - The RelationalText document to export.
 * @param doc   - The Automerge document to update.
 * @param path  - Property path to the text field, e.g. `['content']`.
 */
declare function toAutomerge<T>(rtDoc: Document, doc: AM.Doc<T>, path: string[]): AM.Doc<T>;

export { ensureAutomergeLexicon, fromAutomerge, toAutomerge };
