# Server Setup: Eager Registration

## Why Eager Registration Matters

Every format module in RelationalText registers its lexicon and lens lazily — the first call to `from('mastodon', ...)` or `to('mastodon', ...)` triggers a synchronous registration step that loads the lexicon into the WASM registry and adds the format's lens to the global lens graph. In a long-running server process, you want this work done once during application startup rather than on the first live request, where the latency would be visible to a user.

Eager registration also populates the lens graph's path cache up front. Without it, the first `to('html', ...)` call for an unfamiliar source format will pay the cost of a BFS path search; subsequent calls will hit the cache, but the warm-up happens at request time.

## Required: `initRelationalText()`

`initRelationalText()` must be called and awaited before any other operation — including `ensureXxxLexicon()` calls. It loads and initializes the WASM binary. Calling it multiple times is safe; initialization only runs once.

```ts
import { initRelationalText } from 'relational-text'

await initRelationalText()
```

## Startup Block

Call `ensureXxxLexicon()` for every format your server will handle, directly after `initRelationalText()`:

```ts
import { initRelationalText } from 'relational-text'
import { ensureMarkdownLexicon } from 'relational-text/markdown'
import { ensureHtmlLexicon }     from 'relational-text/html'
import { ensureMastodonLexicon } from 'relational-text/mastodon'
import { ensureQuillLexicon }    from 'relational-text/quill'
import { ensureSlackLexicon }    from 'relational-text/slack'

export async function initServer(): Promise<void> {
  await initRelationalText()

  // Register WASM lexicons and lenses for all formats this server handles.
  // These calls are synchronous and idempotent.
  ensureMarkdownLexicon()   // covers CommonMark and GFM
  ensureHtmlLexicon()       // WHATWG HTML element set
  ensureMastodonLexicon()   // Mastodon → RelationalText lens (autoApply)
  ensureQuillLexicon()      // Quill Delta → RelationalText lens (autoApply)
  ensureSlackLexicon()      // Slack mrkdwn → RelationalText lens (autoApply)
}
```

Call `initServer()` once at the top of your entry point and wait for it to resolve before accepting requests:

```ts
// server.ts
import { initServer } from './startup.js'
import { createServer } from './app.js'

await initServer()
const server = createServer()
server.listen(3000)
```

## What Each `ensure` Call Does

Each `ensureXxxLexicon()` function does three things, exactly once:

1. Registers the format's lexicon with the WASM runtime (feature classes and expand semantics)
2. Registers the format's lens with the global `lensGraph` with `autoApply: true`
3. Sets a module-level flag so subsequent calls are no-ops

After `ensureMastodonLexicon()` returns, the lens graph has a path from `org.joinmastodon.facet` to `org.relationaltext.facet`. When `to('html', ...)` is later called on a Mastodon document, `autoTransform` finds and applies that path without any additional work.

## Importing Is Not Enough

Importing a format module does not register its lens:

```ts
import 'relational-text/mastodon'
// The Mastodon lens is NOT yet in the graph.
// You must call ensureMastodonLexicon() explicitly.
```

The `ensure` function is the only entry point that triggers registration. This is intentional — it gives you full control over what is loaded and when, which matters in edge function environments where you want to minimize cold-start cost by loading only the formats you actually use.

## See Also

- [Lens Graph](../lenses/graph) — how lazy vs eager registration affects path caching, `autoApply`, and `autoTransform`
