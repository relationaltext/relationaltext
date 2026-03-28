# Jupyter Notebook Format

RelationalText implements Jupyter notebook (`.ipynb`) import and export. Features are stored under the `org.jupyter.facet` namespace. The Jupyter cell model maps directly to the RelationalText block model: each cell becomes one block.

**Package:** `relational-text/jupyter`
**Namespace:** `org.jupyter.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('jupyter', input: JupyterNotebook | string): Document`

Parse a Jupyter notebook JSON object (or a raw JSON string) into a Document.

```ts
import type { JupyterNotebook } from 'relational-text/jupyter'

const notebook: JupyterNotebook = JSON.parse(fs.readFileSync('notebook.ipynb', 'utf8'))
const doc = from('jupyter', notebook)

// Or pass a raw JSON string directly:
const doc2 = from('jupyter', fs.readFileSync('notebook.ipynb', 'utf8'))
```

Each cell in `notebook.cells` becomes one block:

- `cell_type: 'code'` → `code` block with `{ language, id? }` attrs
- `cell_type: 'markdown'` or `'raw'` → `markdown` block with `{ id? }` attrs

The default language is resolved from `notebook.metadata.kernelspec.language`, then `notebook.metadata.language_info.name`, defaulting to `'python'` if neither is present.

Cell `source` may be a string or an array of strings; array sources are joined before storage.

Cell outputs and execution counts are not imported — only the source text is stored.

### `to('jupyter', doc: Document, language?: string): JupyterNotebook`

Render a Document to a Jupyter notebook JSON object.

```ts
const notebook = to('jupyter', doc, 'python')
// notebook.nbformat === 4
// notebook.cells === [...]
```

- Automatically applies any registered lenses targeting `org.jupyter.facet` via `lensGraph.autoTransform()`
- Documents from other formats convert automatically through the lens graph
- The optional `language` parameter sets the fallback kernel language when no `language` attr is found on a `code` block
- `markdown` blocks become `{ cell_type: 'markdown', source: [text], metadata: {} }`
- `code` blocks become `{ cell_type: 'code', source: [text], metadata: {}, execution_count: null, outputs: [] }`
- The notebook `metadata.kernelspec` is populated from the first code cell's language (or the `language` parameter)
- Non-block nodes in the HIR are skipped

The returned object always has `nbformat: 4` and `nbformat_minor: 5`.

### `ensureJupyterLexicon(): void`

Explicitly register the Jupyter lexicon (`org.jupyter.facet#*` types) and its lens to the RT hub. Called automatically by `from('jupyter', ...)` and `to('jupyter', ...)` on first use. Safe to call multiple times — subsequent calls are no-ops.

## Exported Types

```ts
export interface JupyterCell {
  cell_type: 'markdown' | 'code' | 'raw'
  id?: string
  source: string | string[]
  metadata?: Record<string, unknown>
  execution_count?: number | null
  outputs?: unknown[]
}

export interface JupyterNotebook {
  nbformat?: number
  nbformat_minor?: number
  metadata?: {
    kernelspec?: { language?: string; display_name?: string; name?: string }
    language_info?: { name?: string }
    [key: string]: unknown
  }
  cells: JupyterCell[]
}
```

## Feature Mapping

### Block Elements

The Jupyter lexicon contains exactly two feature types:

| Cell type | Feature name | Attrs |
|-----------|--------------|-------|
| `markdown` / `raw` | `markdown` | `{ id?: string }` |
| `code` | `code` | `{ language: string, id?: string }` |

Inline markup within cell source is not parsed — cell content is stored as opaque text in the document. The `implicitBlockType` in the lexicon is `markdown`, so bare text without a block marker defaults to a markdown cell.

### Lens to RelationalText Hub

The `jupyter-to-relationaltext.lens.json` lens is marked `invertible: false`. It maps:

| Jupyter | RelationalText |
|---------|----------------|
| `markdown` | `paragraph` |
| `code` | `code-block` |

The `language` attr on `code` is preserved through the lens onto the RT `code-block` feature.

## Examples

### Import from file

```ts
import { from } from 'relational-text/registry'
import { readFileSync } from 'fs'

const raw = readFileSync('analysis.ipynb', 'utf8')
const doc = from('jupyter', raw)

console.log(doc.text)
// Text content of all cells concatenated, separated by block markers
```

### Export to notebook

```ts
import { from, to } from 'relational-text/registry'

const doc = from('jupyter', {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {
    kernelspec: { language: 'python', display_name: 'Python', name: 'python' },
    language_info: { name: 'python' },
  },
  cells: [
    { cell_type: 'markdown', source: '# Hello\n\nA description.' },
    { cell_type: 'code', source: 'print("hello")', execution_count: null, outputs: [] },
  ],
})

const notebook = to('jupyter', doc, 'python')
// {
//   nbformat: 4,
//   nbformat_minor: 5,
//   metadata: { kernelspec: { language: 'python', display_name: 'Python', name: 'python' }, ... },
//   cells: [
//     { cell_type: 'markdown', source: ['# Hello\n\nA description.'], metadata: {} },
//     { cell_type: 'code', source: ['print("hello")'], metadata: {}, execution_count: null, outputs: [] },
//   ]
// }
```

### Cross-Format Conversion

```ts
import { from, to } from 'relational-text/registry'

// CommonMark blocks become notebook cells:
// paragraphs and headings → markdown, fenced code → code
const doc = from('markdown', '# Analysis\n\nThis is a paragraph.\n\n```python\nx = 1\n```')
const notebook = to('jupyter', doc, 'python')
```

## Notes

- **Cell content is opaque**: `from('jupyter', ...)` stores each cell's source text verbatim. Inline Markdown within a markdown cell (headings, bold, links, etc.) is not parsed into facets. Use `from('markdown', cell.source)` separately if you need to parse individual cell content.
- **Cell ID preservation**: when a cell has an `id` field (nbformat 4.5+), it is stored in the `id` attr on the block feature and written back to `cell.id` on export.
- **Raw cells**: `cell_type: 'raw'` is treated identically to `'markdown'` — both become `markdown` blocks. The distinction is not preserved through the hub.
- **Outputs and execution counts**: cell outputs and `execution_count` values are not stored in the Document. Exported notebooks always have `execution_count: null` and `outputs: []` on code cells.
- **Kernel language detection**: `from('jupyter', ...)` reads the kernel language from `metadata.kernelspec.language`, then `metadata.language_info.name`, falling back to `'python'`. This language is stored in the `language` attr of every `code` block.
- **`to('jupyter', ...)` kernel metadata**: the `kernelspec` in the output notebook is derived from the first code cell's language (or the `language` parameter). The `display_name` is the language string with its first letter capitalized (e.g., `'python'` → `'Python'`).
- **Lens invertibility**: the lens is marked `invertible: false` because `markdown` and `code` carry structural meaning (cell type, language) that cannot be reliably recovered from generic RT `paragraph` and `code-block` features when converting back from the hub.
- **Hub lenses**: The RT↔CommonMark↔HTML hub lenses are registered on demand by the renderers (`to('html', ...)`, `to('markdown', ...)`) when called.
