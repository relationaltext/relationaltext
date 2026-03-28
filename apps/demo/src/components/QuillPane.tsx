'use client'

import { useEffect, useRef, useState } from 'react'
import type { DocumentJSON } from 'relational-text/types'
import type { UpdateSource } from '@/lib/useDocument'

interface Props {
  doc: DocumentJSON
  source: UpdateSource
  onUpdate: (doc: DocumentJSON) => void
}

export default function QuillPane({ doc, source, onUpdate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quillRef = useRef<any>(null)
  const isUpdatingRef = useRef(false)
  const mountedRef = useRef(false)
  const [quillReady, setQuillReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current || quillRef.current) return
    let cancelled = false

    import('quill').then(({ default: Quill }) => {
      if (cancelled || !containerRef.current || quillRef.current) return
      const quill = new Quill(containerRef.current, { theme: 'snow' })
      quillRef.current = quill
      setQuillReady(true)

      quill.on('text-change', (_delta: unknown, _old: unknown, src: string) => {
        if (src !== 'user' || isUpdatingRef.current) return
        import('relational-text/registry').then(async ({ from }) => {
          const delta = quill.getContents()
          const newDoc = await from('quill', JSON.stringify(delta))
          onUpdate(newDoc.toJSON())
        })
      })
    })

    return () => { cancelled = true }
  }, [onUpdate])

  useEffect(() => {
    if (!quillReady) return
    const isFirstMount = !mountedRef.current
    mountedRef.current = true
    if (!isFirstMount && source === 'quill') return
    import('relational-text/registry').then(async ({ to }) => {
      const quill = quillRef.current
      isUpdatingRef.current = true
      const delta = JSON.parse(await to('quill', doc))
      quill.setContents(delta)
      isUpdatingRef.current = false
    })
  }, [doc, source, quillReady])

  return <div ref={containerRef} className="quill-container" />
}
