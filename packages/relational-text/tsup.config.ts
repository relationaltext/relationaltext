import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'format-wasm': 'src/format-wasm.ts',
    wasm:  'src/wasm.ts',
    index: 'src/index.ts',
    core: 'src/core.ts',
    lens: 'src/lens.ts',
    registry: 'src/registry.ts',
    layers: 'src/layers.ts',
    automerge: 'src/automerge.ts',
    'automerge-stream': 'src/automerge-stream.ts',
    'bluesky-utils': 'src/bluesky-utils.ts',
    knowledge: 'src/knowledge.ts',
    'annotation-overlay': 'src/annotation-overlay.ts',
    experiment: 'src/experiment.ts',
    ontology: 'src/ontology.ts',
    alignment: 'src/alignment.ts',
    'layered-document': 'src/layered-document.ts',
    'concept-index': 'src/concept-index.ts',
    types: 'src/types.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
  external: [/relationaltext_wasm/, '@automerge/automerge'],
  esbuildOptions(options) {
    // Inline .wasm.b64 files as text strings so format adapters work in browsers.
    options.loader = { ...options.loader, '.b64': 'text' }
  },
})
