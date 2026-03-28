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

import { Document } from './core.js'
import type { DocumentJSON } from './types.js'

// ─── UTF-16 ↔ UTF-8 position conversion ──────────────────────────────────────

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
export function utf16IndexToByteOffset(text: string, utf16Index: number): number {
  if (utf16Index < 0) throw new RangeError(`utf16Index must be non-negative, got ${utf16Index}`)
  if (utf16Index === 0) return 0

  const encoder = new TextEncoder()
  let utf16Pos = 0
  let byteOffset = 0

  for (const codePoint of text) {
    if (utf16Pos >= utf16Index) break
    const encoded = encoder.encode(codePoint)
    byteOffset += encoded.length
    // Non-BMP code points occupy 2 UTF-16 code units (surrogate pair)
    utf16Pos += codePoint.length
  }

  if (utf16Pos < utf16Index) {
    // utf16Index is past end of string — clamp to end
    // (Automerge can give indices equal to text.length for "end of string")
    if (utf16Index === text.length) return byteOffset
    throw new RangeError(
      `utf16Index ${utf16Index} is out of range for text of length ${text.length}`,
    )
  }

  return byteOffset
}

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
export function byteOffsetToUtf16Index(text: string, byteOffset: number): number {
  if (byteOffset < 0) throw new RangeError(`byteOffset must be non-negative, got ${byteOffset}`)
  if (byteOffset === 0) return 0

  const encoder = new TextEncoder()
  let byteCount = 0
  let utf16Pos = 0

  for (const codePoint of text) {
    if (byteCount >= byteOffset) break
    const encoded = encoder.encode(codePoint)
    byteCount += encoded.length
    utf16Pos += codePoint.length
  }

  if (byteCount < byteOffset) {
    if (byteOffset === encoder.encode(text).length) return text.length
    throw new RangeError(
      `byteOffset ${byteOffset} is out of range for text of ${encoder.encode(text).length} bytes`,
    )
  }

  return utf16Pos
}

// ─── RTMutation types ─────────────────────────────────────────────────────────

/** Insert text at a byte position. */
export interface RTInsertMutation {
  op: 'insert'
  bytePos: number
  text: string
}

/** Delete the byte range [byteStart, byteEnd). */
export interface RTDeleteMutation {
  op: 'delete'
  byteStart: number
  byteEnd: number
}

/** Add a mark over [byteStart, byteEnd). */
export interface RTAddMarkMutation {
  op: 'addMark'
  byteStart: number
  byteEnd: number
  typeId: string
  name: string
  attrs?: Record<string, unknown>
  expandStart?: boolean
  expandEnd?: boolean
}

/** Remove a mark from [byteStart, byteEnd) by compound key. */
export interface RTRemoveMarkMutation {
  op: 'removeMark'
  byteStart: number
  byteEnd: number
  typeKey: string
}

/** Insert a block marker at a byte position. */
export interface RTInsertBlockMutation {
  op: 'insertBlock'
  bytePos: number
  /** Block type name (e.g. "paragraph", "heading"). */
  name: string
  parents: string[]
  attrs?: Record<string, unknown>
}

export type RTMutation =
  | RTInsertMutation
  | RTDeleteMutation
  | RTAddMarkMutation
  | RTRemoveMarkMutation
  | RTInsertBlockMutation

// ─── Automerge Patch types (minimal, without importing @automerge/automerge) ──

/**
 * Minimal Automerge patch shape. The actual `@automerge/automerge` Patch type
 * is structurally compatible; we define our own so callers can use the function
 * even without the Automerge package installed.
 */
export interface AutomergePatch {
  action: string
  path: (string | number)[]
  /** splice: inserted value (string) */
  value?: unknown
  /** del: number of characters deleted */
  length?: number
  /** mark: mark name */
  markName?: string
  /** mark: expand setting */
  expand?: 'before' | 'after' | 'both' | 'none'
  /** insert: array of values to insert */
  values?: unknown[]
}

// ─── Pending block state ──────────────────────────────────────────────────────

interface PendingBlock {
  /** UTF-16 index in the Automerge string where the block marker was inserted */
  utf16Index: number
  name?: string
  parents?: string[]
  attrs?: Record<string, unknown>
}

// ─── Mark expand defaults ─────────────────────────────────────────────────────

const EXPAND_BOTH_MARKS = new Set(['bold', 'italic', 'strikethrough', 'underline'])

function defaultExpand(markName: string): { expandStart: boolean; expandEnd: boolean } {
  if (EXPAND_BOTH_MARKS.has(markName)) return { expandStart: true, expandEnd: true }
  return { expandStart: false, expandEnd: false }
}

// ─── automergePathToRTMutations ───────────────────────────────────────────────

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
export function automergePathToRTMutations(
  patches: AutomergePatch[],
  initialRtDoc: DocumentJSON,
  textPath: string[] = ['text'],
): RTMutation[] {
  const mutations: RTMutation[] = []
  // Track current RT text as we apply mutations so index conversions are accurate
  let currentText = initialRtDoc.text

  // Buffer block marker inserts: keyed by the string index of insertion.
  // Automerge emits `insert` for block markers, then `put` patches to set type/attrs.
  // We accumulate puts until we see a non-put patch or end of patches for that ObjId.
  // Since Automerge doesn't give us an ObjId in the patch for individual characters
  // within a text string, we key by UTF-16 index of the inserted character.
  const pendingBlocks = new Map<number, PendingBlock>()

  const pathPrefix = textPath.join('/')

  for (const patch of patches) {
    const patchPath = patch.path.join('/')

    // Only process patches targeting our text field (or children of it)
    if (!patchPath.startsWith(pathPrefix)) continue

    const subPath = patch.path.slice(textPath.length)

    if (patch.action === 'splice' && subPath.length === 1) {
      // Text insertion at index subPath[0]
      const utf16Idx = subPath[0] as number
      const insertedText = (patch.value as string) ?? ''

      if (insertedText.length === 0) continue

      // Check if this is a block marker
      const isBlockMarker =
        insertedText === '\n' || insertedText === '\uFFFC'

      const bytePos = utf16IndexToByteOffset(currentText, utf16Idx)

      if (isBlockMarker) {
        // Buffer as a pending block — attributes may arrive in subsequent `put` patches
        pendingBlocks.set(utf16Idx, { utf16Index: utf16Idx })
        // Still emit an insertBlock mutation immediately; attributes get filled in if
        // we see subsequent put patches. For simplicity in streaming mode we emit now
        // and callers can ignore the pending block accumulation detail.
        // We'll emit the full mutation after processing all puts in this batch, but
        // for immediate streaming we emit here and skip in the final flush.
        // Actually: emit at end of patch list if still pending. Mark as deferred.
        pendingBlocks.get(utf16Idx)!.utf16Index = utf16Idx
      } else {
        // Flush any pending blocks that are now "finalized" (no more puts seen for them)
        // We flush eagerly here since a non-put, non-block-insert patch confirms the block
        // marker insert phase is over.
        _flushPendingBlocks(pendingBlocks, currentText, mutations)
        pendingBlocks.clear()

        mutations.push({ op: 'insert', bytePos, text: insertedText })
      }

      // Update current text
      currentText = currentText.slice(0, bytePos) + insertedText + currentText.slice(bytePos)

    } else if (patch.action === 'del' && subPath.length === 1) {
      // Text deletion
      const utf16Idx = subPath[0] as number
      const delLength = (patch.length as number) ?? 1

      _flushPendingBlocks(pendingBlocks, currentText, mutations)
      pendingBlocks.clear()

      const byteStart = utf16IndexToByteOffset(currentText, utf16Idx)
      const byteEnd = utf16IndexToByteOffset(currentText, utf16Idx + delLength)

      mutations.push({ op: 'delete', byteStart, byteEnd })

      // Update current text
      currentText = currentText.slice(0, byteStart) + currentText.slice(byteEnd)

    } else if (patch.action === 'mark' && subPath.length === 0) {
      // Mark spans on the text. patch.value is an array of mark objects.
      _flushPendingBlocks(pendingBlocks, currentText, mutations)
      pendingBlocks.clear()

      const markArray = Array.isArray(patch.value)
        ? (patch.value as Array<{
            name: string
            value: unknown
            start: number
            end: number
          }>)
        : []

      for (const mark of markArray) {
        const byteStart = utf16IndexToByteOffset(currentText, mark.start)
        const byteEnd = utf16IndexToByteOffset(currentText, mark.end)
        const markName = mark.name

        if (mark.value === null) {
          // null value = remove mark
          const typeKey = `org.relationaltext.facet#${markName}`
          mutations.push({ op: 'removeMark', byteStart, byteEnd, typeKey })
        } else {
          // Add mark
          const expand = defaultExpand(markName)
          const attrs: Record<string, unknown> = {}
          if (mark.value !== true && mark.value !== null && typeof mark.value === 'object') {
            Object.assign(attrs, mark.value as Record<string, unknown>)
          }
          const mutation: RTAddMarkMutation = {
            op: 'addMark',
            byteStart,
            byteEnd,
            typeId: 'org.relationaltext.facet',
            name: markName,
            ...expand,
          }
          if (Object.keys(attrs).length > 0) mutation.attrs = attrs
          mutations.push(mutation)
        }
      }

    } else if (patch.action === 'put' && subPath.length >= 2) {
      // Put on an attribute of a block marker object.
      // subPath[0] = UTF-16 index of the block marker, subPath[1] = attribute name
      const markerIdx = subPath[0] as number
      const attrName = subPath[1] as string

      if (pendingBlocks.has(markerIdx)) {
        const pending = pendingBlocks.get(markerIdx)!
        if (attrName === 'type' || attrName === 'name') {
          pending.name = patch.value as string
        } else if (attrName === 'parents') {
          pending.parents = patch.value as string[]
        } else {
          if (!pending.attrs) pending.attrs = {}
          pending.attrs[attrName] = patch.value
        }
      }
    }
  }

  // Flush any remaining pending blocks
  _flushPendingBlocks(pendingBlocks, currentText, mutations)

  return mutations
}

/** Flush all pending block mutations into the mutations array. */
function _flushPendingBlocks(
  pendingBlocks: Map<number, PendingBlock>,
  currentText: string,
  mutations: RTMutation[],
): void {
  for (const [_idx, pending] of pendingBlocks) {
    const bytePos = utf16IndexToByteOffset(currentText, pending.utf16Index)
    const blockMutation: RTInsertBlockMutation = {
      op: 'insertBlock',
      bytePos,
      name: pending.name ?? 'paragraph',
      parents: pending.parents ?? [],
    }
    if (pending.attrs !== undefined) blockMutation.attrs = pending.attrs
    mutations.push(blockMutation)
  }
}

// ─── applyRTMutations ─────────────────────────────────────────────────────────

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
export function applyRTMutations(doc: Document, mutations: RTMutation[]): Document {
  let d = doc
  for (const m of mutations) {
    switch (m.op) {
      case 'insert':
        d = d.insertText(m.bytePos, m.text)
        break

      case 'delete':
        d = d.deleteRange(m.byteStart, m.byteEnd)
        break

      case 'addMark': {
        const markInput: Record<string, unknown> = {
          name: m.name,
        }
        if (m.attrs && Object.keys(m.attrs).length > 0) markInput.attrs = m.attrs
        if (m.expandStart !== undefined) markInput.expandStart = m.expandStart
        if (m.expandEnd !== undefined) markInput.expandEnd = m.expandEnd
        d = d.addMark(m.byteStart, m.byteEnd, markInput as Parameters<Document['addMark']>[2])
        break
      }

      case 'removeMark':
        d = d.removeMark(m.byteStart, m.byteEnd, m.typeKey)
        break

      case 'insertBlock': {
        // Insert block marker character, then annotate it
        const isFirstBlock = d.text.length === 0 || !d.text.includes('\uFFFC')
        const markerChar = isFirstBlock ? '\uFFFC' : '\n'
        d = d.insertText(m.bytePos, markerChar)
        const markerEnd = m.bytePos + new TextEncoder().encode(markerChar).length
        const blockInput: Record<string, unknown> = {
          name: m.name,
          parents: m.parents,
        }
        if (m.attrs && Object.keys(m.attrs).length > 0) blockInput.attrs = m.attrs
        d = d.addBlock(
          m.bytePos,
          markerEnd,
          blockInput as Parameters<Document['addBlock']>[2],
        )
        break
      }
    }
  }
  return d
}

// ─── RT → Automerge bridge ────────────────────────────────────────────────────

/**
 * A two-way live bridge between a RelationalText Document and an Automerge doc.
 *
 * The `amDoc` field holds the Automerge document. The `rtDoc` field holds the
 * current RT document JSON. Use {@link applyRTMutationToAutomerge} to apply
 * RT mutations to both sides simultaneously.
 */
export interface RTAutomergeBridge {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  amDoc: any
  rtDoc: DocumentJSON
  textPath: string[]
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
export async function createBridgeFromRT(
  rtDoc: DocumentJSON,
  textPath: string[] = ['text'],
): Promise<RTAutomergeBridge> {
  const A = await _requireAutomerge()

  // Create Automerge doc with text field
  const rootKey = textPath[0] ?? 'text'
  let amDoc = A.from({ [rootKey]: new A.RawString(rtDoc.text) })

  // Replay marks from facets
  amDoc = A.change(amDoc, (d: Record<string, unknown>) => {
    const textObj = _getNestedField(d, textPath) as unknown
    if (!textObj || typeof (textObj as Record<string, unknown>).mark !== 'function') {
      // RawString supports mark() in recent Automerge versions
      return
    }
    const textWithMark = textObj as {
      mark: (
        range: { start: number; end: number; expand: string },
        markName: string,
        value: unknown,
      ) => void
    }
    for (const facet of rtDoc.facets ?? []) {
      for (const feat of facet.features) {
        const name = (feat as Record<string, unknown>).name as string | undefined
        if (!name) continue
        const typeId = (feat as Record<string, unknown>).$type as string
        if (!typeId?.includes('mark')) continue

        const utf16Start = byteOffsetToUtf16Index(rtDoc.text, facet.index.byteStart)
        const utf16End = byteOffsetToUtf16Index(rtDoc.text, facet.index.byteEnd)
        const expand = defaultExpand(name)
        const expandStr = expand.expandStart && expand.expandEnd
          ? 'both'
          : expand.expandStart
          ? 'before'
          : expand.expandEnd
          ? 'after'
          : 'none'

        textWithMark.mark(
          { start: utf16Start, end: utf16End, expand: expandStr },
          name,
          true,
        )
      }
    }
  })

  return { amDoc, rtDoc, textPath }
}

/**
 * Apply an RT mutation to both sides of the bridge.
 *
 * The mutation is applied to the RT Document (producing a new bridge state) and
 * also translated and applied to the Automerge doc. Returns the updated bridge
 * and the Automerge change bytes for replication.
 *
 * Requires `@automerge/automerge` to be installed.
 */
export async function applyRTMutationToAutomerge(
  bridge: RTAutomergeBridge,
  mutation: RTMutation,
): Promise<{ bridge: RTAutomergeBridge; changes: Uint8Array[] }> {
  const A = await _requireAutomerge()

  // Apply to RT side
  const rtDocBefore = Document.fromJSON(bridge.rtDoc)
  const rtDocAfter = applyRTMutations(rtDocBefore, [mutation])
  const newRtDoc = rtDocAfter.toJSON()

  // Apply to Automerge side
  let newAmDoc = bridge.amDoc
  const changesBefore = A.getAllChanges(newAmDoc)

  newAmDoc = A.change(newAmDoc, (d: Record<string, unknown>) => {
    const textObj = _getNestedField(d, bridge.textPath)
    if (!textObj) return

    const currentText = bridge.rtDoc.text

    switch (mutation.op) {
      case 'insert': {
        const utf16Idx = byteOffsetToUtf16Index(currentText, mutation.bytePos)
        ;(textObj as unknown[]).splice(utf16Idx, 0, ...mutation.text.split(''))
        break
      }
      case 'delete': {
        const utf16Start = byteOffsetToUtf16Index(currentText, mutation.byteStart)
        const utf16End = byteOffsetToUtf16Index(currentText, mutation.byteEnd)
        ;(textObj as unknown[]).splice(utf16Start, utf16End - utf16Start)
        break
      }
      case 'addMark': {
        const utf16Start = byteOffsetToUtf16Index(currentText, mutation.byteStart)
        const utf16End = byteOffsetToUtf16Index(currentText, mutation.byteEnd)
        const expand = {
          expandStart: mutation.expandStart ?? false,
          expandEnd: mutation.expandEnd ?? false,
        }
        const expandStr = expand.expandStart && expand.expandEnd
          ? 'both'
          : expand.expandStart
          ? 'before'
          : expand.expandEnd
          ? 'after'
          : 'none'
        const markFn = (textObj as { mark?: (...a: unknown[]) => void }).mark
        if (markFn) {
          markFn.call(textObj, { start: utf16Start, end: utf16End, expand: expandStr }, mutation.name, true)
        }
        break
      }
      case 'removeMark': {
        const utf16Start = byteOffsetToUtf16Index(currentText, mutation.byteStart)
        const utf16End = byteOffsetToUtf16Index(currentText, mutation.byteEnd)
        const markName = mutation.typeKey.includes('#')
          ? mutation.typeKey.split('#')[1]
          : mutation.typeKey
        const markFn = (textObj as { mark?: (...a: unknown[]) => void }).mark
        if (markFn) {
          markFn.call(textObj, { start: utf16Start, end: utf16End, expand: 'none' }, markName, null)
        }
        break
      }
      case 'insertBlock': {
        const markerChar = mutation.name === '\uFFFC' ? '\uFFFC' : '\n'
        const utf16Idx = byteOffsetToUtf16Index(currentText, mutation.bytePos)
        ;(textObj as unknown[]).splice(utf16Idx, 0, markerChar)
        break
      }
    }
  })

  const changesAfter = A.getAllChanges(newAmDoc)
  const newChanges = changesAfter.slice(changesBefore.length)

  return {
    bridge: { amDoc: newAmDoc, rtDoc: newRtDoc, textPath: bridge.textPath },
    changes: newChanges,
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function _requireAutomerge(): Promise<any> {
  try {
    // Dynamic import so the module is usable without @automerge/automerge installed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const A = (await import('@automerge/automerge' as string)) as any
    return A
  } catch {
    throw new Error(
      'The @automerge/automerge package is required for RTAutomergeBridge functions. ' +
        'Install it with: npm install @automerge/automerge',
    )
  }
}

function _getNestedField(
  obj: Record<string, unknown>,
  path: string[],
): unknown {
  let cur: unknown = obj
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}
