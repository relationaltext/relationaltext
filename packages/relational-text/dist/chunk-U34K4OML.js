import {
  Document
} from "./chunk-W3MVQAE5.js";

// src/automerge-stream.ts
function utf16IndexToByteOffset(text, utf16Index) {
  if (utf16Index < 0) throw new RangeError(`utf16Index must be non-negative, got ${utf16Index}`);
  if (utf16Index === 0) return 0;
  const encoder = new TextEncoder();
  let utf16Pos = 0;
  let byteOffset = 0;
  for (const codePoint of text) {
    if (utf16Pos >= utf16Index) break;
    const encoded = encoder.encode(codePoint);
    byteOffset += encoded.length;
    utf16Pos += codePoint.length;
  }
  if (utf16Pos < utf16Index) {
    if (utf16Index === text.length) return byteOffset;
    throw new RangeError(
      `utf16Index ${utf16Index} is out of range for text of length ${text.length}`
    );
  }
  return byteOffset;
}
function byteOffsetToUtf16Index(text, byteOffset) {
  if (byteOffset < 0) throw new RangeError(`byteOffset must be non-negative, got ${byteOffset}`);
  if (byteOffset === 0) return 0;
  const encoder = new TextEncoder();
  let byteCount = 0;
  let utf16Pos = 0;
  for (const codePoint of text) {
    if (byteCount >= byteOffset) break;
    const encoded = encoder.encode(codePoint);
    byteCount += encoded.length;
    utf16Pos += codePoint.length;
  }
  if (byteCount < byteOffset) {
    if (byteOffset === encoder.encode(text).length) return text.length;
    throw new RangeError(
      `byteOffset ${byteOffset} is out of range for text of ${encoder.encode(text).length} bytes`
    );
  }
  return utf16Pos;
}
var EXPAND_BOTH_MARKS = /* @__PURE__ */ new Set(["bold", "italic", "strikethrough", "underline"]);
function defaultExpand(markName) {
  if (EXPAND_BOTH_MARKS.has(markName)) return { expandStart: true, expandEnd: true };
  return { expandStart: false, expandEnd: false };
}
function automergePathToRTMutations(patches, initialRtDoc, textPath = ["text"]) {
  const mutations = [];
  let currentText = initialRtDoc.text;
  const pendingBlocks = /* @__PURE__ */ new Map();
  const pathPrefix = textPath.join("/");
  for (const patch of patches) {
    const patchPath = patch.path.join("/");
    if (!patchPath.startsWith(pathPrefix)) continue;
    const subPath = patch.path.slice(textPath.length);
    if (patch.action === "splice" && subPath.length === 1) {
      const utf16Idx = subPath[0];
      const insertedText = patch.value ?? "";
      if (insertedText.length === 0) continue;
      const isBlockMarker = insertedText === "\n" || insertedText === "\uFFFC";
      const bytePos = utf16IndexToByteOffset(currentText, utf16Idx);
      if (isBlockMarker) {
        pendingBlocks.set(utf16Idx, { utf16Index: utf16Idx });
        pendingBlocks.get(utf16Idx).utf16Index = utf16Idx;
      } else {
        _flushPendingBlocks(pendingBlocks, currentText, mutations);
        pendingBlocks.clear();
        mutations.push({ op: "insert", bytePos, text: insertedText });
      }
      currentText = currentText.slice(0, bytePos) + insertedText + currentText.slice(bytePos);
    } else if (patch.action === "del" && subPath.length === 1) {
      const utf16Idx = subPath[0];
      const delLength = patch.length ?? 1;
      _flushPendingBlocks(pendingBlocks, currentText, mutations);
      pendingBlocks.clear();
      const byteStart = utf16IndexToByteOffset(currentText, utf16Idx);
      const byteEnd = utf16IndexToByteOffset(currentText, utf16Idx + delLength);
      mutations.push({ op: "delete", byteStart, byteEnd });
      currentText = currentText.slice(0, byteStart) + currentText.slice(byteEnd);
    } else if (patch.action === "mark" && subPath.length === 0) {
      _flushPendingBlocks(pendingBlocks, currentText, mutations);
      pendingBlocks.clear();
      const markArray = Array.isArray(patch.value) ? patch.value : [];
      for (const mark of markArray) {
        const byteStart = utf16IndexToByteOffset(currentText, mark.start);
        const byteEnd = utf16IndexToByteOffset(currentText, mark.end);
        const markName = mark.name;
        if (mark.value === null) {
          const typeKey = `org.relationaltext.facet#${markName}`;
          mutations.push({ op: "removeMark", byteStart, byteEnd, typeKey });
        } else {
          const expand = defaultExpand(markName);
          const attrs = {};
          if (mark.value !== true && mark.value !== null && typeof mark.value === "object") {
            Object.assign(attrs, mark.value);
          }
          const mutation = {
            op: "addMark",
            byteStart,
            byteEnd,
            typeId: "org.relationaltext.facet",
            name: markName,
            ...expand
          };
          if (Object.keys(attrs).length > 0) mutation.attrs = attrs;
          mutations.push(mutation);
        }
      }
    } else if (patch.action === "put" && subPath.length >= 2) {
      const markerIdx = subPath[0];
      const attrName = subPath[1];
      if (pendingBlocks.has(markerIdx)) {
        const pending = pendingBlocks.get(markerIdx);
        if (attrName === "type" || attrName === "name") {
          pending.name = patch.value;
        } else if (attrName === "parents") {
          pending.parents = patch.value;
        } else {
          if (!pending.attrs) pending.attrs = {};
          pending.attrs[attrName] = patch.value;
        }
      }
    }
  }
  _flushPendingBlocks(pendingBlocks, currentText, mutations);
  return mutations;
}
function _flushPendingBlocks(pendingBlocks, currentText, mutations) {
  for (const [_idx, pending] of pendingBlocks) {
    const bytePos = utf16IndexToByteOffset(currentText, pending.utf16Index);
    const blockMutation = {
      op: "insertBlock",
      bytePos,
      name: pending.name ?? "paragraph",
      parents: pending.parents ?? []
    };
    if (pending.attrs !== void 0) blockMutation.attrs = pending.attrs;
    mutations.push(blockMutation);
  }
}
function applyRTMutations(doc, mutations) {
  let d = doc;
  for (const m of mutations) {
    switch (m.op) {
      case "insert":
        d = d.insertText(m.bytePos, m.text);
        break;
      case "delete":
        d = d.deleteRange(m.byteStart, m.byteEnd);
        break;
      case "addMark": {
        const markInput = {
          name: m.name
        };
        if (m.attrs && Object.keys(m.attrs).length > 0) markInput.attrs = m.attrs;
        if (m.expandStart !== void 0) markInput.expandStart = m.expandStart;
        if (m.expandEnd !== void 0) markInput.expandEnd = m.expandEnd;
        d = d.addMark(m.byteStart, m.byteEnd, markInput);
        break;
      }
      case "removeMark":
        d = d.removeMark(m.byteStart, m.byteEnd, m.typeKey);
        break;
      case "insertBlock": {
        const isFirstBlock = d.text.length === 0 || !d.text.includes("\uFFFC");
        const markerChar = isFirstBlock ? "\uFFFC" : "\n";
        d = d.insertText(m.bytePos, markerChar);
        const markerEnd = m.bytePos + new TextEncoder().encode(markerChar).length;
        const blockInput = {
          name: m.name,
          parents: m.parents
        };
        if (m.attrs && Object.keys(m.attrs).length > 0) blockInput.attrs = m.attrs;
        d = d.addBlock(
          m.bytePos,
          markerEnd,
          blockInput
        );
        break;
      }
    }
  }
  return d;
}
async function createBridgeFromRT(rtDoc, textPath = ["text"]) {
  const A = await _requireAutomerge();
  const rootKey = textPath[0] ?? "text";
  let amDoc = A.from({ [rootKey]: new A.RawString(rtDoc.text) });
  amDoc = A.change(amDoc, (d) => {
    const textObj = _getNestedField(d, textPath);
    if (!textObj || typeof textObj.mark !== "function") {
      return;
    }
    const textWithMark = textObj;
    for (const facet of rtDoc.facets ?? []) {
      for (const feat of facet.features) {
        const name = feat.name;
        if (!name) continue;
        const typeId = feat.$type;
        if (!typeId?.includes("mark")) continue;
        const utf16Start = byteOffsetToUtf16Index(rtDoc.text, facet.index.byteStart);
        const utf16End = byteOffsetToUtf16Index(rtDoc.text, facet.index.byteEnd);
        const expand = defaultExpand(name);
        const expandStr = expand.expandStart && expand.expandEnd ? "both" : expand.expandStart ? "before" : expand.expandEnd ? "after" : "none";
        textWithMark.mark(
          { start: utf16Start, end: utf16End, expand: expandStr },
          name,
          true
        );
      }
    }
  });
  return { amDoc, rtDoc, textPath };
}
async function applyRTMutationToAutomerge(bridge, mutation) {
  const A = await _requireAutomerge();
  const rtDocBefore = Document.fromJSON(bridge.rtDoc);
  const rtDocAfter = applyRTMutations(rtDocBefore, [mutation]);
  const newRtDoc = rtDocAfter.toJSON();
  let newAmDoc = bridge.amDoc;
  const changesBefore = A.getAllChanges(newAmDoc);
  newAmDoc = A.change(newAmDoc, (d) => {
    const textObj = _getNestedField(d, bridge.textPath);
    if (!textObj) return;
    const currentText = bridge.rtDoc.text;
    switch (mutation.op) {
      case "insert": {
        const utf16Idx = byteOffsetToUtf16Index(currentText, mutation.bytePos);
        textObj.splice(utf16Idx, 0, ...mutation.text.split(""));
        break;
      }
      case "delete": {
        const utf16Start = byteOffsetToUtf16Index(currentText, mutation.byteStart);
        const utf16End = byteOffsetToUtf16Index(currentText, mutation.byteEnd);
        textObj.splice(utf16Start, utf16End - utf16Start);
        break;
      }
      case "addMark": {
        const utf16Start = byteOffsetToUtf16Index(currentText, mutation.byteStart);
        const utf16End = byteOffsetToUtf16Index(currentText, mutation.byteEnd);
        const expand = {
          expandStart: mutation.expandStart ?? false,
          expandEnd: mutation.expandEnd ?? false
        };
        const expandStr = expand.expandStart && expand.expandEnd ? "both" : expand.expandStart ? "before" : expand.expandEnd ? "after" : "none";
        const markFn = textObj.mark;
        if (markFn) {
          markFn.call(textObj, { start: utf16Start, end: utf16End, expand: expandStr }, mutation.name, true);
        }
        break;
      }
      case "removeMark": {
        const utf16Start = byteOffsetToUtf16Index(currentText, mutation.byteStart);
        const utf16End = byteOffsetToUtf16Index(currentText, mutation.byteEnd);
        const markName = mutation.typeKey.includes("#") ? mutation.typeKey.split("#")[1] : mutation.typeKey;
        const markFn = textObj.mark;
        if (markFn) {
          markFn.call(textObj, { start: utf16Start, end: utf16End, expand: "none" }, markName, null);
        }
        break;
      }
      case "insertBlock": {
        const markerChar = mutation.name === "\uFFFC" ? "\uFFFC" : "\n";
        const utf16Idx = byteOffsetToUtf16Index(currentText, mutation.bytePos);
        textObj.splice(utf16Idx, 0, markerChar);
        break;
      }
    }
  });
  const changesAfter = A.getAllChanges(newAmDoc);
  const newChanges = changesAfter.slice(changesBefore.length);
  return {
    bridge: { amDoc: newAmDoc, rtDoc: newRtDoc, textPath: bridge.textPath },
    changes: newChanges
  };
}
async function _requireAutomerge() {
  try {
    const A = await import("@automerge/automerge");
    return A;
  } catch {
    throw new Error(
      "The @automerge/automerge package is required for RTAutomergeBridge functions. Install it with: npm install @automerge/automerge"
    );
  }
}
function _getNestedField(obj, path) {
  let cur = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return void 0;
    cur = cur[key];
  }
  return cur;
}

export {
  utf16IndexToByteOffset,
  byteOffsetToUtf16Index,
  automergePathToRTMutations,
  applyRTMutations,
  createBridgeFromRT,
  applyRTMutationToAutomerge
};
