'use client'

import { useState, useCallback } from 'react'
import type { DocumentJSON } from 'relational-text/types'

export type UpdateSource = 'tiptap' | 'quill' | 'markdown' | 'lexical' | 'external'

export interface DocumentState {
  doc: DocumentJSON
  source: UpdateSource
}

export function useDocument(initial: DocumentJSON = { text: '', facets: [] }) {
  const [state, setState] = useState<DocumentState>({ doc: initial, source: 'external' })

  const setDocument = useCallback((doc: DocumentJSON, source: UpdateSource) => {
    setState({ doc, source })
  }, [])

  return { doc: state.doc, source: state.source, setDocument }
}
