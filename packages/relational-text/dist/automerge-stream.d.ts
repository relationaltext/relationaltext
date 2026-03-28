import { Document } from './core.js';
import { DocumentJSON } from './types.js';
import './wasm.js';
import './wasm/relationaltext_wasm.js';

/**
 * Automerge ↔ RelationalText streaming/incremental sync bridge.
 *
 * Provides:
 * - UTF-16 ↔ UTF-8 position conversion helpers
 * - Automerge Patch[] → RTMutation[] translation
 * - applyRTMutations: apply a batch of mutations to a Document
 * - RTAutomergeBridge: two-way live bridge (RT ↔ Automerge)
 *
 * The @automerge/automerge package is an optional peer dependency.
 * Position helpers and patch translation are usable without it.
 * Bridge functions that create Automerge docs will throw a clear error if the
 * package is absent.
 */

/**
 * Convert a UTF-16 code unit index to a UTF-8 byte offset in `text`.
 *
 * Automerge's WASM layer tracks positions as UTF-16 code unit indices (matching
 * the JavaScript string model). RelationalText uses UTF-8 byte offsets (matching
 * the Rust/atproto model). This function converts between the two.
 *
 * The conversion must be performed against the RT text state BEFORE the patch
 * being converted is applied, because position indices shift with mutations.
 *
 * Handles:
 * - ASCII (1 UTF-8 byte = 1 UTF-16 unit)
 * - BMP non-ASCII (2–3 UTF-8 bytes = 1 UTF-16 unit, e.g. accented chars, CJK)
 * - Non-BMP / supplementary (4 UTF-8 bytes = 2 UTF-16 units / surrogate pair, e.g. emoji)
 *
 * @param text - The current text string
 * @param utf16Index - UTF-16 code unit index (as used by JavaScript `String`)
 * @returns UTF-8 byte offset into the same text
 * @throws RangeError if `utf16Index` is out of range
 */
declare function utf16IndexToByteOffset(text: string, utf16Index: number): number;
/**
 * Convert a UTF-8 byte offset to a UTF-16 code unit index in `text`.
 *
 * Inverse of {@link utf16IndexToByteOffset}.
 *
 * @param text - The current text string
 * @param byteOffset - UTF-8 byte offset
 * @returns UTF-16 code unit index
 * @throws RangeError if `byteOffset` does not land on a character boundary
 */
declare function byteOffsetToUtf16Index(text: string, byteOffset: number): number;
/** Insert text at a byte position. */
interface RTInsertMutation {
    op: 'insert';
    bytePos: number;
    text: string;
}
/** Delete the byte range [byteStart, byteEnd). */
interface RTDeleteMutation {
    op: 'delete';
    byteStart: number;
    byteEnd: number;
}
/** Add a mark over [byteStart, byteEnd). */
interface RTAddMarkMutation {
    op: 'addMark';
    byteStart: number;
    byteEnd: number;
    typeId: string;
    name: string;
    attrs?: Record<string, unknown>;
    expandStart?: boolean;
    expandEnd?: boolean;
}
/** Remove a mark from [byteStart, byteEnd) by compound key. */
interface RTRemoveMarkMutation {
    op: 'removeMark';
    byteStart: number;
    byteEnd: number;
    typeKey: string;
}
/** Insert a block marker at a byte position. */
interface RTInsertBlockMutation {
    op: 'insertBlock';
    bytePos: number;
    /** Block type name (e.g. "paragraph", "heading"). */
    name: string;
    parents: string[];
    attrs?: Record<string, unknown>;
}
type RTMutation = RTInsertMutation | RTDeleteMutation | RTAddMarkMutation | RTRemoveMarkMutation | RTInsertBlockMutation;
/**
 * Minimal Automerge patch shape. The actual `@automerge/automerge` Patch type
 * is structurally compatible; we define our own so callers can use the function
 * even without the Automerge package installed.
 */
interface AutomergePatch {
    action: string;
    path: (string | number)[];
    /** splice: inserted value (string) */
    value?: unknown;
    /** del: number of characters deleted */
    length?: number;
    /** mark: mark name */
    markName?: string;
    /** mark: expand setting */
    expand?: 'before' | 'after' | 'both' | 'none';
    /** insert: array of values to insert */
    values?: unknown[];
}
/**
 * Convert an ordered list of Automerge patches to RelationalText mutations.
 *
 * Patches must target the same text field (identified by `textPath`). Each
 * patch's UTF-16 index is converted to a UTF-8 byte offset against the RT
 * document's current text state (which is threaded through as patches are
 * processed), ensuring correctness as indices shift with mutations.
 *
 * The returned mutations are in application order. Pass them to
 * {@link applyRTMutations} to apply them to a Document.
 *
 * @param patches - Automerge patches (from a `diff` or change callback)
 * @param initialRtDoc - The RT document state BEFORE any of these patches
 * @param textPath - Path to the text field in the Automerge doc (e.g. `['text']`)
 * @returns RTMutation array in application order
 */
declare function automergePathToRTMutations(patches: AutomergePatch[], initialRtDoc: DocumentJSON, textPath?: string[]): RTMutation[];
/**
 * Apply a list of RTMutations to a Document in order.
 *
 * Each mutation is applied sequentially, producing a new Document instance.
 * Returns the final Document after all mutations.
 *
 * @param doc - Starting Document
 * @param mutations - Mutations to apply (in order)
 * @returns Updated Document
 */
declare function applyRTMutations(doc: Document, mutations: RTMutation[]): Document;
/**
 * A two-way live bridge between a RelationalText Document and an Automerge doc.
 *
 * The `amDoc` field holds the Automerge document. The `rtDoc` field holds the
 * current RT document JSON. Use {@link applyRTMutationToAutomerge} to apply
 * RT mutations to both sides simultaneously.
 */
interface RTAutomergeBridge {
    amDoc: any;
    rtDoc: DocumentJSON;
    textPath: string[];
}
/**
 * Initialize an Automerge document from an RT snapshot.
 *
 * Creates an Automerge doc whose text field mirrors `rtDoc.text` and whose
 * marks mirror the inline features in `rtDoc.facets`. Block markers are
 * inserted as literal `\uFFFC` / `\n` characters within the text.
 *
 * Requires `@automerge/automerge` to be installed. Throws a clear error if absent.
 *
 * @param rtDoc - Source RelationalText document
 * @param textPath - Path to the text field in the Automerge doc (default: `['text']`)
 */
declare function createBridgeFromRT(rtDoc: DocumentJSON, textPath?: string[]): Promise<RTAutomergeBridge>;
/**
 * Apply an RT mutation to both sides of the bridge.
 *
 * The mutation is applied to the RT Document (producing a new bridge state) and
 * also translated and applied to the Automerge doc. Returns the updated bridge
 * and the Automerge change bytes for replication.
 *
 * Requires `@automerge/automerge` to be installed.
 */
declare function applyRTMutationToAutomerge(bridge: RTAutomergeBridge, mutation: RTMutation): Promise<{
    bridge: RTAutomergeBridge;
    changes: Uint8Array[];
}>;

export { type AutomergePatch, type RTAddMarkMutation, type RTAutomergeBridge, type RTDeleteMutation, type RTInsertBlockMutation, type RTInsertMutation, type RTMutation, type RTRemoveMarkMutation, applyRTMutationToAutomerge, applyRTMutations, automergePathToRTMutations, byteOffsetToUtf16Index, createBridgeFromRT, utf16IndexToByteOffset };
