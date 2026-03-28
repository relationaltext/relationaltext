import {
  detect_facets
} from "./chunk-AVMPBRSI.js";

// src/bluesky-utils.ts
function detectFacets(text) {
  const raw = JSON.parse(
    detect_facets(
      text,
      "app.bsky.richtext.facet#mention",
      "app.bsky.richtext.facet#link",
      "app.bsky.richtext.facet#tag"
    )
  );
  return raw.map((facet) => ({
    ...facet,
    features: facet.features.map((feat) => {
      if (feat["$type"] === "app.bsky.richtext.facet#mention" && typeof feat["handle"] === "string") {
        const { handle, ...rest } = feat;
        return { ...rest, did: `at://${handle}` };
      }
      return feat;
    })
  }));
}

export {
  detectFacets
};
