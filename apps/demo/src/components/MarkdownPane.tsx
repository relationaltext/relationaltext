'use client'

import { useEffect, useRef, useState } from 'react'
import type { DocumentJSON } from 'relational-text/types'
import type { UpdateSource } from '@/lib/useDocument'

interface Props {
  doc: DocumentJSON
  source: UpdateSource
  onUpdate: (doc: DocumentJSON) => void
}

export default function MarkdownPane({ doc, source, onUpdate }: Props) {
  const [text, setText] = useState('')
  const mountedRef = useRef(false)

  useEffect(() => {
    const isFirstMount = !mountedRef.current
    mountedRef.current = true
    if (!isFirstMount && source === 'markdown') return
    import('relational-text/registry').then(async ({ to }) => {
      setText(await to('markdown', doc))
    })
  }, [doc, source])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newText = e.target.value
    setText(newText)
    import('relational-text/registry').then(async ({ from }) => {
      const doc = await from('markdown', newText)
      onUpdate(doc.toJSON())
    })
  }

  return (
    <textarea
      className="markdown-editor"
      value={text}
      onChange={handleChange}
      spellCheck={false}
    />
  )
}
