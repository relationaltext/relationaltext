'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { HeadingNode, QuoteNode, $createHeadingNode, $isHeadingNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { LinkNode, AutoLinkNode } from '@lexical/link'
import { CodeNode, CodeHighlightNode } from '@lexical/code'
import { TableNode, TableCellNode, TableRowNode, INSERT_TABLE_COMMAND } from '@lexical/table'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'
import {
  DecoratorNode,
  type SerializedLexicalNode,
  FORMAT_TEXT_COMMAND,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $isElementNode,
} from 'lexical'
import type { EditorState } from 'lexical'
import type { DocumentJSON } from 'relational-text/types'
import type { UpdateSource } from '@/lib/useDocument'

type SerializedEmbedNode = SerializedLexicalNode & { type: 'relationaltext-embed'; url: string; embedType: string; title: string }

class EmbedNode extends DecoratorNode<React.ReactElement> {
  __url: string
  __embedType: string
  __title: string

  static getType() { return 'relationaltext-embed' }
  static clone(node: EmbedNode) { return new EmbedNode(node.__url, node.__embedType, node.__title, node.__key) }

  constructor(url: string, embedType: string, title: string, key?: string) {
    super(key)
    this.__url = url
    this.__embedType = embedType
    this.__title = title
  }

  createDOM() { const div = document.createElement('div'); div.className = 'lexical-embed'; return div }
  updateDOM() { return false }

  static importJSON(data: SerializedEmbedNode) {
    return new EmbedNode(data.url, data.embedType, data.title)
  }

  exportJSON(): SerializedEmbedNode {
    return { ...super.exportJSON(), type: 'relationaltext-embed', url: this.__url, embedType: this.__embedType, title: this.__title, version: 1 }
  }

  decorate(): React.ReactElement {
    return (
      <div className="lexical-embed-card">
        <span className="lexical-embed-type">{this.__embedType}</span>
        <a href={this.__url} className="lexical-embed-url" target="_blank" rel="noreferrer">{this.__url}</a>
        {this.__title && <span className="lexical-embed-title">{this.__title}</span>}
      </div>
    )
  }
}

interface Props {
  doc: DocumentJSON
  source: UpdateSource
  onUpdate: (doc: DocumentJSON) => void
}

const EDITOR_NODES = [
  HeadingNode, QuoteNode,
  ListNode, ListItemNode,
  LinkNode, AutoLinkNode,
  CodeNode, CodeHighlightNode,
  TableNode, TableCellNode, TableRowNode,
  EmbedNode,
]

type FormatState = {
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  h1: boolean
  h2: boolean
  h3: boolean
}

function LexicalToolbarPlugin() {
  const [editor] = useLexicalComposerContext()
  const [fmt, setFmt] = useState<FormatState>({
    bold: false, italic: false, underline: false, strikethrough: false,
    h1: false, h2: false, h3: false,
  })

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return
        const anchor = selection.anchor.getNode()
        const top = anchor.getTopLevelElement()
        const tag = top && $isHeadingNode(top) ? top.getTag() : null
        setFmt({
          bold: selection.hasFormat('bold'),
          italic: selection.hasFormat('italic'),
          underline: selection.hasFormat('underline'),
          strikethrough: selection.hasFormat('strikethrough'),
          h1: tag === 'h1',
          h2: tag === 'h2',
          h3: tag === 'h3',
        })
      })
    })
  }, [editor])

  const applyHeading = useCallback((level: 1 | 2 | 3) => {
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      const nodes = selection.getNodes()
      const tops = new Set(nodes.map(n => n.getTopLevelElement()).filter($isElementNode))
      tops.forEach(top => {
        const isAlreadyThis = $isHeadingNode(top) && top.getTag() === `h${level}`
        const replacement = isAlreadyThis ? $createParagraphNode() : $createHeadingNode(`h${level}`)
        top.replace(replacement, true)
      })
    })
  }, [editor])

  const insertEmbed = useCallback(() => {
    const url = window.prompt('Embed URL (YouTube, Twitter, etc.):')
    if (!url) return
    let embedType = 'iframe'
    if (/youtube\.com|youtu\.be/.test(url)) embedType = 'youtube'
    else if (/twitter\.com|x\.com/.test(url)) embedType = 'tweet'
    else if (/figma\.com/.test(url)) embedType = 'figma'
    editor.update(() => {
      const selection = $getSelection()
      const embedNode = new EmbedNode(url, embedType, '')
      if (selection) {
        selection.insertNodes([embedNode])
      }
    })
  }, [editor])

  return (
    <div className="editor-toolbar">
      <button
        type="button"
        className={fmt.bold ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold') }}
        title="Bold"
      >B</button>
      <button
        type="button"
        className={fmt.italic ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic') }}
        title="Italic"
      ><em>I</em></button>
      <button
        type="button"
        className={fmt.underline ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline') }}
        title="Underline"
      ><u>U</u></button>
      <button
        type="button"
        className={fmt.strikethrough ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough') }}
        title="Strikethrough"
      ><s>S</s></button>
      <span className="toolbar-divider" />
      <button
        type="button"
        className={fmt.h1 ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); applyHeading(1) }}
        title="Heading 1"
      >H1</button>
      <button
        type="button"
        className={fmt.h2 ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); applyHeading(2) }}
        title="Heading 2"
      >H2</button>
      <button
        type="button"
        className={fmt.h3 ? 'active' : ''}
        onMouseDown={(e) => { e.preventDefault(); applyHeading(3) }}
        title="Heading 3"
      >H3</button>
      <span className="toolbar-divider" />
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); insertEmbed() }}
        title="Insert Embed"
      >&#8663;</button>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); editor.dispatchCommand(INSERT_TABLE_COMMAND, { columns: '3', rows: '3', includeHeaders: true }) }}
        title="Insert Table"
      >&#8862;</button>
    </div>
  )
}

function ExternalSyncPlugin({
  doc,
  source,
  isUpdatingRef,
}: {
  doc: DocumentJSON
  source: UpdateSource
  isUpdatingRef: React.MutableRefObject<boolean>
}) {
  const [editor] = useLexicalComposerContext()
  const mountedRef = useRef(false)

  useEffect(() => {
    const isFirstMount = !mountedRef.current
    mountedRef.current = true
    if (!isFirstMount && source === 'lexical') return
    import('relational-text/registry').then(async ({ to }) => {
      try {
        const lexicalJson = await to('lexical', doc)
        const state = editor.parseEditorState(lexicalJson)
        isUpdatingRef.current = true
        editor.setEditorState(state)
        isUpdatingRef.current = false
      } catch {
        // Ignore parse errors (e.g. unknown node types in doc)
      }
    })
  }, [doc, source, editor, isUpdatingRef])

  return null
}

export default function LexicalPane({ doc, source, onUpdate }: Props) {
  const isUpdatingRef = useRef(false)

  function handleChange(editorState: EditorState) {
    if (isUpdatingRef.current) return
    import('relational-text/registry').then(async ({ from }) => {
      const newDoc = await from('lexical', JSON.stringify(editorState.toJSON()))
      onUpdate(newDoc.toJSON())
    })
  }

  const initialConfig = {
    namespace: 'RelationalTextDemo',
    nodes: EDITOR_NODES,
    onError: (err: Error) => console.error('Lexical:', err),
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="lexical-wrapper">
        <LexicalToolbarPlugin />
        <RichTextPlugin
          contentEditable={<ContentEditable className="lexical-editor" />}
          placeholder={<div className="lexical-placeholder">Start typing…</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <TablePlugin />
        <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
        <ExternalSyncPlugin doc={doc} source={source} isUpdatingRef={isUpdatingRef} />
      </div>
    </LexicalComposer>
  )
}
