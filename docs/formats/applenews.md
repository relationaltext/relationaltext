# Apple News Format

[Apple News Format](https://developer.apple.com/documentation/applenews/apple_news_format) (ANF) is Apple's JSON-based article format for publishing rich content to the Apple News app. It structures content as an array of typed components (body text, headings, quotes, photos, etc.) with inline styling via separate range arrays.

## Feature Mapping

| ANF role / addition type | RT feature | `$type` |
|---|---|---|
| `body` | `body` → `paragraph` via lens | `com.apple.news.facet` |
| `heading1` – `heading6` | `heading1`–`heading6` | `com.apple.news.facet` |
| `intro` | `intro` → `paragraph` via lens | `com.apple.news.facet` |
| `quote`, `pullquote` | `quote` / `pullquote` | `com.apple.news.facet` |
| `aside` | `aside` | `com.apple.news.facet` |
| `author`, `byline` | `author` / `byline` | `com.apple.news.facet` |
| `caption` | `caption` | `com.apple.news.facet` |
| `inlineTextStyles` bold | `bold` | `com.apple.news.facet` |
| `inlineTextStyles` italic | `italic` | `com.apple.news.facet` |
| `inlineTextStyles` underline | `underline` | `com.apple.news.facet` |
| `inlineTextStyles` strikethrough | `strikethrough` | `com.apple.news.facet` |
| `additions` link (`URL`) | `link` (attr `url`) | `com.apple.news.facet` |

**Position units**: ANF's `rangeStart` / `rangeLength` are Unicode code-point character counts. RelationalText uses UTF-8 byte offsets. The adapter converts automatically.

## Import

```ts
import { from } from 'relational-text/registry'

const article = {
  version: '1.9',
  identifier: 'article-001',
  title: 'Hello World',
  components: [
    {
      role: 'heading1',
      text: 'Hello World',
    },
    {
      role: 'body',
      text: 'This is bold text with a link.',
      inlineTextStyles: [
        { rangeStart: 8, rangeLength: 4, textStyle: { bold: true } }
      ],
      additions: [
        { type: 'link', rangeStart: 21, rangeLength: 4, URL: 'https://example.com' }
      ],
    },
  ],
}

const doc = from('applenews', article)
```

`from('applenews', ...)` also accepts a JSON string:

```ts
const doc = from('applenews', fs.readFileSync('article.json', 'utf8'))
```

## Export

```ts
import { from, to } from 'relational-text/registry'

const doc = from('markdown', '# Hello\n\nThis is **bold**.')
const article = to('applenews', doc)
// {
//   version: '1.9',
//   components: [
//     { role: 'heading1', text: 'Hello' },
//     {
//       role: 'body',
//       text: 'This is bold.',
//       inlineTextStyles: [
//         { rangeStart: 8, rangeLength: 4, textStyle: { bold: true } }
//       ]
//     }
//   ]
// }
```

`to('applenews', ...)` accepts any document format registered in the lens graph — CommonMark, HTML, Bluesky, TipTap, etc. — and auto-translates to ANF features before export.

## Supported Components

`from('applenews', ...)` handles these component roles: `body`, `title`, `intro`, `heading`, `heading1`–`heading6`, `quote`, `pullquote`, `aside`, `author`, `byline`, `caption`, `chapter`, `section`. `section` and `chapter` containers are recursed into — their child components are flattened into the document.

Non-text components (photo, video, divider, advertisement, etc.) are silently skipped.

## Cross-Format Round-Trip

Because ANF is registered in the lens graph, you can go through RT as a hub:

```ts
import { from, to } from 'relational-text/registry'

const doc = from('applenews', article)

to('html', doc)       // render to HTML
to('markdown', doc)   // render to Markdown
to('applenews', doc)  // round-trip back to ANF
```

The `applenews-to-relationaltext` lens is invertible, so the RT → ANF path is also available via the lens graph for programmatic transforms.
