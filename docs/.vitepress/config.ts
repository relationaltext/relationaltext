import { defineConfig } from 'vitepress'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import wasm from 'vite-plugin-wasm'
import tsconfigPaths from 'vite-tsconfig-paths'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  title: 'RelationalText',
  description: 'WASM-powered rich text facets for the atproto ecosystem',
  base: '/',

  // Format docs live in formats/[nsid]/docs.md and are symlinked into
  // docs/formats/ so VitePress can serve them without expanding the Vite root.
  ignoreDeadLinks: true,

  // VitePress only adds v-pre to fenced code blocks, not inline code spans.
  // Escape {{ }} so Vue's template compiler doesn't try to evaluate them.
  // We do this as a core rule (pre-render) by converting code_inline tokens
  // to html_inline tokens with already-escaped content.
  markdown: {
    config: (md) => {
      md.core.ruler.push('escape_vue_curlies_in_code', (state) => {
        for (const blockToken of state.tokens) {
          if (blockToken.type !== 'inline' || !blockToken.children) continue
          for (const token of blockToken.children) {
            if (token.type !== 'code_inline') continue
            const escaped = token.content
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/\{\{/g, '&#123;&#123;')
              .replace(/\}\}/g, '&#125;&#125;')
            token.type = 'html_inline'
            token.content = `<code>${escaped}</code>`
          }
        }
      })
    },
  },

  vite: {
    plugins: [wasm(), tsconfigPaths({ root: path.resolve(__dirname, '../..') })],
    build: {
      target: 'esnext',
    },
    resolve: {
      alias: [
        // Sub-paths must come before the bare package match
        { find: /^relational-text\/(.+)$/, replacement: path.resolve(__dirname, '../../packages/relational-text/src/$1.ts') },
        { find: 'relational-text', replacement: path.resolve(__dirname, '../../packages/relational-text/src/index.ts') },
      ],
    },
    optimizeDeps: {
      exclude: ['relational-text'],
    },
    ssr: {
      noExternal: ['relational-text'],
    },
  },

  themeConfig: {
    nav: [
      { text: 'Tutorial', link: '/tutorial/' },
      { text: 'Formats', link: '/formats/' },
      { text: 'Lenses', link: '/lenses/' },
      { text: 'API', link: '/api/document' },
    ],

    sidebar: [
      {
        text: 'Tutorial',
        items: [
          { text: 'Your First Pipeline', link: '/tutorial/' },
        ],
      },
      {
        text: 'Concepts',
        items: [
          { text: 'Installation & Setup', link: '/guide/getting-started' },
          { text: 'Document Model', link: '/guide/document-model' },
          { text: 'Blocks', link: '/guide/blocks' },
          { text: 'Marks', link: '/guide/marks' },
          { text: 'Rendering (HIR)', link: '/guide/hir' },
        ],
      },
      {
        text: 'How-To Guides',
        items: [
          { text: 'Convert Between Formats', link: '/how-to/convert-formats' },
          { text: 'Add a Custom Format', link: '/how-to/add-custom-format' },
          { text: 'Write a Lens', link: '/how-to/write-a-lens' },
          { text: 'Debug Transformations', link: '/how-to/debug-transformations' },
          { text: 'Server Setup', link: '/how-to/server-setup' },
        ],
      },
      {
        text: 'Formats',
        items: [
          { text: 'Overview', link: '/formats/' },
          { text: 'RelationalText Hub', link: '/formats/relationaltext' },
          {
            text: 'Editors',
            collapsed: true,
            items: [
              { text: 'ProseMirror', link: '/formats/prosemirror' },
              { text: 'TipTap', link: '/formats/tiptap' },
              { text: 'Quill', link: '/formats/quill' },
              { text: 'Lexical', link: '/formats/lexical' },
              { text: 'Slate', link: '/formats/slate' },
            ],
          },
          {
            text: 'Markup',
            collapsed: true,
            items: [
              { text: 'HTML', link: '/formats/html' },
              { text: 'Markdown (CommonMark)', link: '/formats/markdown' },
              { text: 'MDX', link: '/formats/mdx' },
              { text: 'MyST', link: '/formats/myst' },
              { text: 'Pandoc', link: '/formats/pandoc' },
              { text: 'MultiMarkdown', link: '/formats/multimarkdown' },
              { text: 'GitLab Flavored Markdown', link: '/formats/gitlab' },
              { text: 'Markdoc', link: '/formats/markdoc' },
            ],
          },
          {
            text: 'Social',
            collapsed: true,
            items: [
              { text: 'Bluesky', link: '/formats/bluesky' },
              { text: 'Mastodon', link: '/formats/mastodon' },
              { text: 'Slack', link: '/formats/slack' },
              { text: 'Discord', link: '/formats/discord' },
              { text: 'Telegram', link: '/formats/telegram' },
              { text: 'WhatsApp', link: '/formats/whatsapp' },
              { text: 'LinkedIn', link: '/formats/linkedin' },
              { text: 'Threads', link: '/formats/threads' },
            ],
          },
          {
            text: 'Note-Taking & Wikis',
            collapsed: true,
            items: [
              { text: 'Notion', link: '/formats/notion' },
              { text: 'Confluence / JIRA', link: '/formats/confluence' },
              { text: 'Obsidian', link: '/formats/obsidian' },
              { text: 'Roam Research', link: '/formats/roam' },
              { text: 'Logseq', link: '/formats/logseq' },
              { text: 'Org-mode', link: '/formats/org' },
              { text: 'DokuWiki', link: '/formats/dokuwiki' },
              { text: 'MediaWiki', link: '/formats/mediawiki' },
              { text: 'Jupyter', link: '/formats/jupyter' },
            ],
          },
          {
            text: 'Publishing & CMS',
            collapsed: true,
            items: [
              { text: 'Apple News', link: '/formats/applenews' },
              { text: 'Contentful', link: '/formats/contentful' },
              { text: 'Sanity', link: '/formats/sanity' },
              { text: 'BBCode', link: '/formats/bbcode' },
              { text: 'Textile', link: '/formats/textile' },
              { text: 'Fountain', link: '/formats/fountain' },
              { text: 'OPML', link: '/formats/opml' },
            ],
          },
          {
            text: 'Collaboration',
            collapsed: true,
            items: [
              { text: 'Automerge', link: '/formats/automerge' },
            ],
          },
        ],
      },
      {
        text: 'Lenses',
        items: [
          { text: 'Overview', link: '/lenses/' },
          { text: 'Composition', link: '/lenses/composition' },
          { text: 'Lens Graph', link: '/lenses/graph' },
          { text: 'Per-rule SQL', link: '/lenses/sql-rules' },
          { text: 'WASM Transforms', link: '/wasm-transforms/' },
        ],
      },
      {
        text: 'SQL Engine',
        items: [
          { text: 'Overview', link: '/sql-engine/' },
          { text: 'Examples', link: '/sql-engine/examples' },
          { text: 'SQLite Extension', link: '/sql-engine/sqlite' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Document', link: '/api/document' },
          { text: 'Format Registry', link: '/api/formats' },
          { text: 'Lens System', link: '/api/lenses' },
          { text: 'Lexicon', link: '/api/lexicon' },
          { text: 'WASM Exports', link: '/api/wasm' },
        ],
      },
      {
        text: 'Advanced',
        items: [
          { text: 'Bibliography', link: '/guide/bibliography' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/blaine/relationaltext' },
    ],
  },
})
