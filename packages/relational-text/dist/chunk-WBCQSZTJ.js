import {
  Document,
  registerFeatureType
} from "./chunk-W3MVQAE5.js";

// src/automerge.ts
import * as AM from "@automerge/automerge";
var AUTOMERGE_NAMESPACE = "org.automerge.richtext.facet";
var _automergeLexiconRegistered = false;
function ensureAutomergeLexicon() {
  if (_automergeLexiconRegistered) return;
  _automergeLexiconRegistered = true;
  const expandingMarks = ["bold", "italic", "strikethrough", "underline"];
  const nonExpandingMarks = ["link", "code", "comment"];
  for (const name of expandingMarks) {
    registerFeatureType({
      typeId: `${AUTOMERGE_NAMESPACE}#${name}`,
      featureClass: "inline",
      expandStart: true,
      expandEnd: true
    });
  }
  for (const name of nonExpandingMarks) {
    registerFeatureType({
      typeId: `${AUTOMERGE_NAMESPACE}#${name}`,
      featureClass: "inline",
      expandStart: false,
      expandEnd: false
    });
  }
  for (const name of ["paragraph", "heading", "code-block"]) {
    registerFeatureType({
      typeId: `${AUTOMERGE_NAMESPACE}#${name}`,
      featureClass: "block",
      expandStart: false,
      expandEnd: false
    });
  }
}
var _encoder = new TextEncoder();
var _decoder = new TextDecoder();
function byteLength(str) {
  return _encoder.encode(str).length;
}
function blockTypeName(value) {
  const t = value["type"];
  if (t == null) return "paragraph";
  if (typeof t === "object" && !Array.isArray(t) && "val" in t) {
    return String(t.val);
  }
  return String(t);
}
function blockParents(value) {
  const p = value["parents"];
  if (!Array.isArray(p)) return [];
  return p.map((item) => {
    if (typeof item === "object" && item !== null && !Array.isArray(item) && "val" in item) {
      return String(item.val);
    }
    return String(item);
  });
}
function blockAttrs(value) {
  const a = value["attrs"];
  if (a != null && typeof a === "object" && !Array.isArray(a) && !("val" in a)) {
    return a;
  }
  return {};
}
function fromAutomerge(doc, path) {
  ensureAutomergeLexicon();
  const spans2 = AM.spans(doc, path);
  let text = "";
  let byteOffset = 0;
  const facets = [];
  const openMarks = /* @__PURE__ */ new Map();
  let prevMarks = {};
  let isFirstBlock = true;
  for (const span of spans2) {
    if (span.type === "block") {
      const blockValue = span.value;
      const typeName = blockTypeName(blockValue);
      const parents = blockParents(blockValue);
      const attrs = blockAttrs(blockValue);
      let markerChar;
      let markerByteLen;
      if (isFirstBlock) {
        markerChar = "\uFFFC";
        markerByteLen = 3;
        isFirstBlock = false;
      } else {
        markerChar = "\n";
        markerByteLen = 1;
      }
      const markerByteStart = byteOffset;
      const markerByteEnd = byteOffset + markerByteLen;
      text += markerChar;
      byteOffset += markerByteLen;
      const blockFeature = {
        $type: AUTOMERGE_NAMESPACE,
        name: typeName,
        parents
      };
      if (Object.keys(attrs).length > 0) {
        blockFeature["attrs"] = attrs;
      }
      facets.push({
        index: { byteStart: markerByteStart, byteEnd: markerByteEnd },
        features: [blockFeature]
      });
    } else {
      const spanText = span.value;
      const currentMarks = span.marks ?? {};
      for (const [name, openMark] of openMarks) {
        if (!(name in currentMarks)) {
          const markFeature = {
            $type: AUTOMERGE_NAMESPACE,
            name
          };
          if (typeof openMark.value === "string" && name === "link") {
            markFeature["attrs"] = { href: openMark.value };
          } else if (openMark.value !== true && openMark.value != null) {
            markFeature["attrs"] = { value: openMark.value };
          }
          facets.push({
            index: { byteStart: openMark.byteStart, byteEnd: byteOffset },
            features: [markFeature]
          });
          openMarks.delete(name);
        }
      }
      for (const [name, value] of Object.entries(currentMarks)) {
        if (!(name in prevMarks)) {
          openMarks.set(name, { byteStart: byteOffset, value });
        }
      }
      text += spanText;
      byteOffset += byteLength(spanText);
      prevMarks = currentMarks;
    }
  }
  for (const [name, openMark] of openMarks) {
    const markFeature = {
      $type: AUTOMERGE_NAMESPACE,
      name
    };
    if (typeof openMark.value === "string" && name === "link") {
      markFeature["attrs"] = { href: openMark.value };
    } else if (openMark.value !== true && openMark.value != null) {
      markFeature["attrs"] = { value: openMark.value };
    }
    facets.push({
      index: { byteStart: openMark.byteStart, byteEnd: byteOffset },
      features: [markFeature]
    });
  }
  const docJson = { text, facets };
  return Document.fromJSON(docJson);
}
function toAutomerge(rtDoc, doc, path) {
  ensureAutomergeLexicon();
  const fullText = rtDoc.text;
  const facets = rtDoc.facets;
  const blockFacets = [];
  const markFacets = [];
  for (const facet of facets) {
    for (const feature of facet.features) {
      const f = feature;
      if (f["$type"] !== AUTOMERGE_NAMESPACE) continue;
      const name = String(f["name"] ?? "");
      const byteStart = facet.index.byteStart;
      const byteEnd = facet.index.byteEnd;
      const rangeWidth = byteEnd - byteStart;
      const knownBlockNames = /* @__PURE__ */ new Set(["paragraph", "heading", "code-block"]);
      const looksLikeBlockMarker = rangeWidth === 3 || rangeWidth === 1;
      if (knownBlockNames.has(name) && looksLikeBlockMarker) {
        const attrs = typeof f["attrs"] === "object" && f["attrs"] !== null && !Array.isArray(f["attrs"]) ? f["attrs"] : {};
        const parents = Array.isArray(f["parents"]) ? f["parents"].map(String) : [];
        blockFacets.push({ byteStart, byteEnd, name, parents, attrs });
      } else {
        const attrs = typeof f["attrs"] === "object" && f["attrs"] !== null && !Array.isArray(f["attrs"]) ? f["attrs"] : {};
        let markValue = true;
        if (name === "link" && typeof attrs["href"] === "string") {
          markValue = attrs["href"];
        } else if (typeof attrs["value"] !== "undefined") {
          markValue = attrs["value"];
        }
        const expandingMarks = /* @__PURE__ */ new Set(["bold", "italic", "strikethrough", "underline"]);
        const expand = expandingMarks.has(name) ? "both" : "none";
        markFacets.push({ byteStart, byteEnd, name, value: markValue, expand });
      }
    }
  }
  const fullTextBytes = _encoder.encode(fullText);
  const markerRanges = blockFacets.map((b) => ({ start: b.byteStart, end: b.byteEnd })).sort((a, b) => a.start - b.start);
  const strippedBytes = [];
  const origToStripped = new Uint32Array(fullTextBytes.length + 1);
  let strippedIdx = 0;
  let rangePtr = 0;
  for (let i = 0; i < fullTextBytes.length; i++) {
    while (rangePtr < markerRanges.length && markerRanges[rangePtr].end <= i) {
      rangePtr++;
    }
    const inMarker = rangePtr < markerRanges.length && i >= markerRanges[rangePtr].start && i < markerRanges[rangePtr].end;
    origToStripped[i] = strippedIdx;
    if (!inMarker) {
      strippedBytes.push(fullTextBytes[i]);
      strippedIdx++;
    }
  }
  origToStripped[fullTextBytes.length] = strippedIdx;
  const strippedText = _decoder.decode(new Uint8Array(strippedBytes));
  function origByteToStrippedChar(origByte) {
    const clampedByte = Math.min(origByte, fullTextBytes.length);
    const strippedByte = origToStripped[clampedByte];
    const slice = new Uint8Array(strippedBytes.slice(0, strippedByte));
    return _decoder.decode(slice).length;
  }
  const blockSplits = blockFacets.map((b) => ({
    charIndex: origByteToStrippedChar(b.byteEnd),
    name: b.name,
    parents: b.parents,
    attrs: b.attrs
  }));
  blockSplits.sort((a, b) => b.charIndex - a.charIndex);
  return AM.change(doc, (d) => {
    AM.updateText(d, path, strippedText);
    for (const split of blockSplits) {
      AM.splitBlock(d, path, split.charIndex, {
        type: new AM.RawString(split.name),
        parents: split.parents.map((p) => new AM.RawString(p)),
        isEmbed: false,
        ...Object.keys(split.attrs).length > 0 ? { attrs: split.attrs } : {}
      });
    }
    for (const mf of markFacets) {
      const startChar = origByteToStrippedChar(mf.byteStart);
      const endChar = origByteToStrippedChar(mf.byteEnd);
      if (startChar >= endChar) continue;
      AM.mark(d, path, {
        start: startChar,
        end: endChar,
        expand: mf.expand
      }, mf.name, mf.value);
    }
  });
}

export {
  ensureAutomergeLexicon,
  fromAutomerge,
  toAutomerge
};
