'use client'

import { useState } from 'react'
import type { DocumentJSON } from 'relational-text/types'
import type { UpdateSource } from '@/lib/useDocument'
import TipTapPane from './TipTapPane'
import QuillPane from './QuillPane'
import MarkdownPane from './MarkdownPane'
import LexicalPane from './LexicalPane'

export type EditorType = 'tiptap' | 'quill' | 'markdown' | 'lexical'

const EDITOR_OPTIONS: { value: EditorType; label: string }[] = [
  { value: 'tiptap',    label: 'TipTap' },
  { value: 'quill',     label: 'Quill' },
  { value: 'markdown',  label: 'Markdown' },
  { value: 'lexical',   label: 'Lexical' },
]

interface Props {
  doc: DocumentJSON
  source: UpdateSource
  onUpdate: (doc: DocumentJSON, source: UpdateSource) => void
  defaultEditor: EditorType
}

export default function EditorPane({ doc, source, onUpdate, defaultEditor }: Props) {
  const [editorType, setEditorType] = useState<EditorType>(defaultEditor)

  // Each child editor calls this with just the doc; EditorPane injects the source.
  const handleUpdate = (newDoc: DocumentJSON) => onUpdate(newDoc, editorType)

  const commonProps = { doc, source, onUpdate: handleUpdate }

  return (
    <div className="editor-pane">
      <div className="pane-header">
        <select
          value={editorType}
          onChange={(e) => setEditorType(e.target.value as EditorType)}
          className="editor-type-select"
        >
          {EDITOR_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      {editorType === 'tiptap'    && <TipTapPane   key="tiptap"   {...commonProps} />}
      {editorType === 'quill'     && <QuillPane    key="quill"    {...commonProps} />}
      {editorType === 'markdown'  && <MarkdownPane key="markdown" {...commonProps} />}
      {editorType === 'lexical'   && <LexicalPane  key="lexical"  {...commonProps} />}
    </div>
  )
}
