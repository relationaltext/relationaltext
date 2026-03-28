# GitLab Flavored Markdown

GitLab Flavored Markdown (GLFM) extends GitHub GFM with diff markers, inline and block math, footnotes, task lists, `@mentions`, issue refs, and merge request refs.

**Package:** `relational-text/gitlab`
**Namespace:** `com.gitlab.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('gitlab', text: string): Document`

Parse a GitLab Flavored Markdown string into a RelationalText Document.

```ts
const doc = from('gitlab', `
## Changes

{+Inserted text+} and {-deleted text-}.

Inline math: $E = mc^2$

$$
\\int_0^\\infty e^{-x} dx = 1
$$

- [ ] Open task
- [x] Completed task

See issue #42 and MR !7 by @alice.

See the note.[^1]

[^1]: Footnote here.
`)
```

Supports:

- `{+text+}` / `{-text-}` — diff insertion/deletion marks
- `$math$` — inline math entity
- `$$\nmath\n$$` — math block
- `[^key]` / `[^key]: text` — footnote refs and defs
- `- [ ] task` / `- [x] done` — task list items
- `@handle` — mention entity
- `#123` — issue ref entity
- `!123` — merge request ref entity
- Standard GFM: headings, code blocks, tables, blockquotes, lists, strikethrough, links, images

### `to('gitlab', doc: Document): string`

Render a RelationalText Document to GitLab Flavored Markdown.

```ts
const glfm = to('gitlab', doc)
```

Automatically applies lenses targeting `com.gitlab.facet` via `lensGraph.autoTransform()`.

### `ensureGitLabLexicon(): void`

Explicitly register the GitLab lexicon. Called automatically by `from('gitlab', ...)` / `to('gitlab', ...)` on first use.

## Feature Mapping

### Inline Marks

| GLFM syntax | Feature name | RT hub name |
|-------------|-------------|-------------|
| `**text**` | `strong` | `bold` |
| `*text*` / `_text_` | `emphasis` | `italic` |
| `~~text~~` | `strikethrough` | `strikethrough` |
| `{+text+}` | `insertion` | `insertion` |
| `{-text-}` | `deletion` | `deletion` |
| `` `text` `` | `code-span` | `code` |
| `[text](url)` | `link` | `link` |
| `![alt](src)` | `image` | `image` |
| `$math$` | `math-inline` | — |
| `[^key]` | `footnote-ref` | — |

### Entities

| GLFM syntax | Feature name | Attrs |
|-------------|-------------|-------|
| `@handle` | `mention` | `{ handle }` |
| `#123` | `issue-ref` | `{ number }` |
| `!123` | `mr-ref` | `{ number }` |

### Block Elements

| GLFM syntax | Feature name | Attrs |
|-------------|-------------|-------|
| `# … ######` | `heading` | `{ level: 1–6 }` |
| ` ```lang ``` ` | `code-block` | `{ language?: string }` |
| `$$ … $$` | `math-block` | `{ code }` |
| `[^key]: text` | `footnote-def` | `{ key }` |
| `- [ ] task` | `task-list-item` | `{ checked: false }` |
| `- [x] done` | `task-list-item` | `{ checked: true }` |
| `> text` | `blockquote-marker` | — |
| `- text` | `bullet-list-marker` / `list-item-text` | — |
| `1. text` | `ordered-list-marker` / `list-item-text` | — |
| `---` | `horizontal-rule` | — |

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const doc = from('gitlab', `
## Summary

The old API was {-deprecated-} and the new one is {+available+}.

Assigned to @alice, closes #42.
`)
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Heading\n\n**bold** and _italic_\n\n- [ ] Task')
const glfm = to('gitlab', doc)
// "## Heading\n\n**bold** and *italic*\n\n- [ ] Task"
```

### Cross-format

```ts
import { from, to } from 'relational-text/registry'

const doc = from('gitlab', '## Title\n\n{+added+} and {-removed-}')
const html = to('html', doc)
// '<h2>Title</h2>\n<p><ins>added</ins> and <del>removed</del></p>\n'
```

## Notes

- `{+insertion+}` maps to RT hub `insertion` → HTML `<ins>`. `{-deletion-}` maps to `deletion` → `<del>`.
- Math content (`math-inline`, `math-block`) has no RT hub equivalent and is dropped in cross-format conversions to formats that don't support math.
- `@mention`, `#issue-ref`, `!mr-ref` entities are stored with their original identifiers and preserved during round-trips within GLFM.
- The `gitlab-to-relationaltext` lens maps the standard CommonMark/GFM subset to RT hub names plus `insertion`/`deletion`.
