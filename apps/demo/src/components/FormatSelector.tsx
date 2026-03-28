'use client'

import type { FormatName } from '@/lib/rt'

// Note: 'latex' is not a valid FormatName — omitted. 'org' appears once only.
// 'roam' and 'logseq' are import-only (no export) and are excluded from
// the selector to avoid runtime errors in OutputPane.
const FORMAT_OPTIONS: Array<{ value: FormatName; label: string }> = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'gfm', label: 'GFM' },
  { value: 'html', label: 'HTML' },
  { value: 'bluesky', label: 'Bluesky' },
  { value: 'mastodon', label: 'Mastodon' },
  { value: 'slack', label: 'Slack' },
  { value: 'discord', label: 'Discord' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'threads', label: 'Threads' },
  { value: 'bbcode', label: 'BBCode' },
  { value: 'prosemirror', label: 'ProseMirror JSON' },
  { value: 'tiptap', label: 'TipTap JSON' },
  { value: 'quill', label: 'Quill Delta' },
  { value: 'lexical', label: 'Lexical JSON' },
  { value: 'slate', label: 'Slate JSON' },
  { value: 'notion', label: 'Notion blocks' },
  { value: 'contentful', label: 'Contentful' },
  { value: 'sanity', label: 'Sanity Portable Text' },
  { value: 'confluence', label: 'Confluence' },
  { value: 'jira', label: 'JIRA wiki' },
  { value: 'mediawiki', label: 'MediaWiki' },
  { value: 'dokuwiki', label: 'DokuWiki' },
  { value: 'textile', label: 'Textile' },
  { value: 'obsidian', label: 'Obsidian' },
  { value: 'org', label: 'Org Mode' },
  { value: 'opml', label: 'OPML' },
  { value: 'multimarkdown', label: 'MultiMarkdown' },
  { value: 'pandoc', label: 'Pandoc' },
  { value: 'gitlab', label: 'GitLab' },
  { value: 'mdx', label: 'MDX' },
  { value: 'myst', label: 'MyST' },
  { value: 'markdoc', label: 'Markdoc' },
  { value: 'fountain', label: 'Fountain' },
  { value: 'jupyter', label: 'Jupyter' },
]

interface Props {
  value: FormatName
  onChange: (format: FormatName) => void
}

export default function FormatSelector({ value, onChange }: Props) {
  return (
    <div className="format-selector">
      <label htmlFor="format-select">Format: </label>
      <select
        id="format-select"
        value={value}
        onChange={(e) => onChange(e.target.value as FormatName)}
      >
        {FORMAT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
