# Fountain

[Fountain](https://fountain.io/syntax) is a plain-text markup syntax for writing screenplays. It is designed to be readable as plain text while also being parseable into properly formatted scripts. Fountain files are standard `.fountain` or `.txt` files understood by tools such as Highland, Fade In, and Final Draft.

**Package:** `relational-text/fountain`
**Namespace:** `com.fountain.facet`

## Functions

```ts
import { from, to } from 'relational-text/registry'
```

### `from('fountain', input: string): Document`

Parses a Fountain screenplay string into a RelationalText `Document`.

The importer processes the input line by line through a state machine that tracks dialogue context. Block types recognized:

- **Title page**: consecutive `Key: Value` lines at the top of the file, before the first blank line. Keys must not be pure ALL CAPS (which would indicate a transition like `CUT TO`).
- **Scene headings**: lines starting with `INT.`, `EXT.`, `INT-EXT.`, or `I/E ` (case-insensitive), or any line starting with `.` (forced).
- **Character names**: ALL CAPS lines preceded by a blank line, optionally followed by extensions like `(O.S.)`, `(V.O.)`, `(CONT'D)`. Must not end with `TO:`.
- **Dialogue**: lines immediately following a character or parenthetical block.
- **Parentheticals**: lines matching `(text)` within dialogue context.
- **Transitions**: ALL CAPS lines ending with `TO:`, or lines starting with `>` (forced).
- **Lyrics**: lines starting with `~`.
- **Sections**: lines starting with `#` through `######` (up to six levels).
- **Synopsis**: lines starting with `= `.
- **Page breaks**: lines containing only `===`.
- **Action**: all other non-blank lines (the default block type, set as `implicitBlockType`).

Inline marks (`**bold**`, `*italic*`, `***bold+italic***`, `_underline_`, `[[note]]`) are parsed within blocks that support them. The result is normalized through the WASM core.

### `to('fountain', doc: Document): string`

Renders a RelationalText `Document` to a Fountain screenplay string.

Automatically applies any registered lenses that target the `com.fountain.facet` namespace — documents imported from Markdown or other formats will be translated to Fountain features before export. Returns a plain string. Title page blocks are collected and emitted first (followed by a blank line), then the screenplay body. Blank lines are inserted between blocks of different types. Scene headings and character names are uppercased on output. A trailing newline is removed from the result.

### `ensureFountainLexicon(): void`

Registers the `com.fountain.facet` lexicon and the Fountain-to-RelationalText lens. Safe to call multiple times. Called automatically by `from('fountain', ...)` and `to('fountain', ...)`.

## Feature Mapping

### Inline marks

| Fountain syntax | Feature name | RT feature | Expands |
|---|---|---|---|
| `***text***` | `bold` + `italic` | `bold` + `italic` | yes |
| `**text**` | `bold` | `bold` | yes |
| `*text*` | `italic` | `italic` | yes |
| `_text_` | `underline` | `underline` | yes |
| `[[text]]` | `note` | `note` | no |

Bold-and-italic (`***`) emits two separate overlapping facets — one `bold` and one `italic` — both covering the same byte range.

### Block types

| Fountain construct | Feature name | Attrs | RT feature (via lens) |
|---|---|---|---|
| `Title: value` (title page) | `title_page` | `key`, `value` | `title_page` |
| `INT. LOCATION` / `.forced` | `scene_heading` | — | `heading` (level 2) |
| `CHARACTER NAME` | `character` | `extension?` | `heading` (level 3) |
| `(aside text)` | `parenthetical` | — | `paragraph` |
| Dialogue line | `dialogue` | — | `paragraph` |
| Action line | `action` | — | `paragraph` |
| `CUT TO:` / `> text` | `transition` | — | `paragraph` |
| `~lyric text` | `lyric` | — | `paragraph` |
| `===` | `page_break` | — | `horizontal-rule` |
| `# Section text` | `section` | `level` | `heading` |
| `= synopsis text` | `synopsis` | — | `synopsis` |

The lens uses `passthrough: keep`. A `character` block may carry an `extension` attribute (e.g. `(O.S.)`) stored separately from the character name text.

## Examples

### Import

```ts
import { from } from 'relational-text/registry'

const screenplay = `Title: My Screenplay
Author: Jane Smith

INT. COFFEE SHOP - DAY

A busy coffee shop in the morning.

JANE
(nervously)
I need this to work.

CUT TO:

EXT. STREET - NIGHT
`

const doc = from('fountain', screenplay)
```

### Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '## Scene One\n\nSome **action** happens here.')
const fountain = to('fountain', doc)
// SCENE ONE
//
// Some **action** happens here.
```

### Round-trip

```ts
import { from, to } from 'relational-text/registry'

const doc = from('fountain', screenplay)
const output = to('fountain', doc)
// Title page lines appear first, then a blank line, then the body.
// Scene headings and character names are uppercased.
```

### Render to HTML

```ts
import { from, to } from 'relational-text/registry'

const doc = from('fountain', screenplay)
to('html', doc)
// scene_heading → <h2>, character → <h3>
// dialogue / action / transition / lyric / parenthetical → <p>
// page_break → <hr>
```

## Notes

- **Title page detection**: the importer peeks at the first line. If it matches `Key: Value` where the key is not pure ALL CAPS, it consumes consecutive key/value lines as `title_page` blocks until the first blank line.
- **Character name detection** uses the regex `^([A-Z][A-Z0-9 ''` + "`" + `-]*)(\s*\([^)]*\))?$` — the line must be ALL CAPS, preceded by a blank line, and must not end with `TO:` (which would classify it as a transition).
- **Forced action lines** starting with `!` have the `!` stripped before the text is stored.
- **Forced scene headings** starting with `.` have the leading `.` stripped.
- **Section vs. heading**: `# text` produces a `section` feature (not a Markdown-style `heading`). The lens maps `section` to RT `heading` (preserving the `level` attr from the section block).
- **`[[note]]`** content (inline production notes) produces a `note` feature. The RT lens maps `note` to `note`. Notes are non-expanding inline marks.
- **Bold+italic**: `***text***` produces two facets on the same byte range: one `bold` and one `italic`.
- **Blank line insertion on export**: a blank line is inserted between consecutive blocks only when the block type changes. Consecutive dialogue blocks do not get blank lines between them.
- **Uppercase on export**: scene headings and character names are `.toUpperCase()`'d by the exporter, regardless of how they were stored in the RT document.
