'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import type { Editor } from '@tiptap/react'
import type { DocumentJSON } from 'relational-text/types'
import type { UpdateSource } from '@/lib/useDocument'

interface Props {
  doc: DocumentJSON
  source: UpdateSource
  onUpdate: (doc: DocumentJSON) => void
}

function TipTapToolbar({ editor }: { editor: Editor }) {
  const setLink = () => {
    const url = window.prompt('URL', editor.getAttributes('link').href ?? '')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().unsetLink().run()
    } else {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }

  return (
    <div className="editor-toolbar">
      <button
        type="button"
        className={editor.isActive('bold') ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
        title="Bold"
      >B</button>
      <button
        type="button"
        className={editor.isActive('italic') ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
        title="Italic"
      ><em>I</em></button>
      <button
        type="button"
        className={editor.isActive('underline') ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }}
        title="Underline"
      ><u>U</u></button>
      <button
        type="button"
        className={editor.isActive('strike') ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleStrike().run() }}
        title="Strikethrough"
      ><s>S</s></button>
      <button
        type="button"
        className={editor.isActive('code') ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleCode().run() }}
        title="Code"
      >`</button>
      <button
        type="button"
        className={editor.isActive('link') ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); setLink() }}
        title="Link"
      >&#128279;</button>
      <span className="toolbar-divider" />
      <button
        type="button"
        className={editor.isActive('heading', { level: 1 }) ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run() }}
        title="Heading 1"
      >H1</button>
      <button
        type="button"
        className={editor.isActive('heading', { level: 2 }) ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run() }}
        title="Heading 2"
      >H2</button>
      <button
        type="button"
        className={editor.isActive('heading', { level: 3 }) ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 3 }).run() }}
        title="Heading 3"
      >H3</button>
      <span className="toolbar-divider" />
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() }}
        title="Insert Table"
      >&#8862;</button>
    </div>
  )
}

export default function TipTapPane({ doc, source, onUpdate }: Props) {
  const isUpdatingRef = useRef(false)
  const mountedRef = useRef(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Underline,
      Subscript,
      Superscript,
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      if (isUpdatingRef.current) return
      import('relational-text/registry').then(async ({ from }) => {
        const newDoc = await from('tiptap', JSON.stringify(editor.getJSON()))
        onUpdate(newDoc.toJSON())
      })
    },
  })

  useEffect(() => {
    if (!editor) return
    const isFirstMount = !mountedRef.current
    mountedRef.current = true
    if (!isFirstMount && source === 'tiptap') return
    import('relational-text/registry').then(async ({ to }) => {
      isUpdatingRef.current = true
      const ttDoc = JSON.parse(await to('tiptap', doc))
      editor.commands.setContent(ttDoc as Parameters<typeof editor.commands.setContent>[0], false)
      isUpdatingRef.current = false
    })
  }, [doc, source, editor])

  return (
    <div className="tiptap-wrapper">
      {editor && <TipTapToolbar editor={editor} />}
      <EditorContent editor={editor} className="editor-content" />
    </div>
  )
}
