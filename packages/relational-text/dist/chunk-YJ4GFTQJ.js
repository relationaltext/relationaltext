// src/annotation-overlay.ts
function computeAnnotationRanges(layers, options) {
  const ranges = [];
  for (const layer of layers) {
    for (const ann of layer.annotations) {
      if (!ann.anchor?.textSpan) continue;
      ranges.push({
        uuid: ann.uuid,
        byteStart: ann.anchor.textSpan.byteStart,
        byteEnd: ann.anchor.textSpan.byteEnd,
        label: ann.label ?? "",
        layerKind: layer.kind,
        layerSubkind: layer.subkind,
        color: options?.layerColors?.[layer.kind],
        knowledgeRefs: ann.knowledgeRefs
      });
    }
  }
  ranges.sort((a, b) => a.byteStart - b.byteStart || b.byteEnd - a.byteEnd);
  return ranges;
}
function annotationsAt(ranges, byteOffset) {
  return ranges.filter((r) => r.byteStart <= byteOffset && byteOffset < r.byteEnd);
}
function annotationsInRange(ranges, start, end) {
  return ranges.filter((r) => r.byteStart < end && r.byteEnd > start);
}

export {
  computeAnnotationRanges,
  annotationsAt,
  annotationsInRange
};
