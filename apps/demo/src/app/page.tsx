'use client'

import { useEffect, useState } from 'react'
import { useDocument } from '@/lib/useDocument'
import { ensureFormats, from as rtFrom } from '@/lib/formats'
import EditorPane from '@/components/EditorPane'
import OutputPane from '@/components/OutputPane'
import FormatSelector from '@/components/FormatSelector'
import type { DocumentJSON } from 'relational-text/types'
import type { FormatName } from '@/lib/rt'
import type { UpdateSource } from '@/lib/useDocument'

const INITIAL_MARKDOWN = `# Welcome to RelationalText

Edit this document in **any pane** — changes propagate to all others instantly.

- Supports _40+_ formats
- Round-trip fidelity
- WASM-powered core
`

export default function Page() {
  const [ready, setReady] = useState(false)
  const { doc, source, setDocument } = useDocument({ text: '', facets: [] })
  const [selectedFormat, setSelectedFormat] = useState<FormatName>('markdown')

  useEffect(() => {
    let cancelled = false
    ensureFormats().then(async () => {
      if (cancelled) return
      const initialDoc = await rtFrom('markdown', INITIAL_MARKDOWN)
      setDocument(initialDoc.toJSON(), 'external')
      setReady(true)
    })
    return () => { cancelled = true }
  }, [setDocument])

  if (!ready) {
    return (
      <div className="loading">
        <p>Loading RelationalText…</p>
      </div>
    )
  }

  return (
    <main className="demo-layout">
      <header className="demo-header">
        <h1>RelationalText Demo</h1>
        <p>Edit in any pane — all others update automatically.</p>
      </header>

      <div className="panes-grid">
        <EditorPane
          doc={doc}
          source={source}
          onUpdate={(newDoc: DocumentJSON, src: UpdateSource) => setDocument(newDoc, src)}
          defaultEditor="tiptap"
        />
        <EditorPane
          doc={doc}
          source={source}
          onUpdate={(newDoc: DocumentJSON, src: UpdateSource) => setDocument(newDoc, src)}
          defaultEditor="lexical"
        />
        <OutputPane doc={doc} format="html" label="HTML" />
        <OutputPane doc={doc} format="markdown" label="Markdown" />
        <div className="output-pane any-format">
          <div className="pane-header">
            <FormatSelector value={selectedFormat} onChange={setSelectedFormat} />
          </div>
          <OutputPane doc={doc} format={selectedFormat} label="" />
        </div>
      </div>
    </main>
  )
}
