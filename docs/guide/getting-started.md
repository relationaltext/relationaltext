# Installation & Setup

::: tip New here?
Start with the [Tutorial](/tutorial/) — it's hands-on and covers everything in this page through concrete examples.
:::

## Installation

```bash
npm install relational-text
```

RelationalText ships a pre-built WASM binary. No Rust toolchain required.

## WASM Initialization

Call `initRelationalText()` once before any document operations. It is safe to call multiple times — initialization only happens once.

```ts
import { initRelationalText } from 'relational-text'

await initRelationalText()
```

In a test suite (Vitest / Jest):

```ts
import { initRelationalText } from 'relational-text'

beforeAll(() => initRelationalText())
```

With the bundler target (Vite, webpack, esbuild), the WASM module auto-initializes when imported, so the explicit call acts as a hook that ensures the module is fully loaded before you proceed.

## First Example: Markdown to HTML

```ts
import { initRelationalText, from, to } from 'relational-text'

await initRelationalText()

const doc = from('markdown', '**Hello**, _world_!')
const html = to('html', doc)
// '<p><strong>Hello</strong>, <em>world</em>!</p>\n'
```

## Next Steps

- [Tutorial](/tutorial/) — hands-on walkthrough from zero to working pipeline
- [How-To Guides](/how-to/convert-formats) — task-focused recipes
- [Document Model](./document-model) — understand the wire format
- [Formats Overview](../formats/) — see all supported formats
- [Lenses](../lenses/) — transform between namespaces
- [API Reference](/api/document) — full TypeScript API
- [Adding a Custom Format](/how-to/add-custom-format) — extend RelationalText with your own format
