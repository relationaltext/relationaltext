'use client'

import { useState, useEffect } from 'react'
import type { DocumentJSON } from 'relational-text/types'
import type { FormatName } from '@/lib/rt'

interface Props {
  doc: DocumentJSON
  format: FormatName | string
  label: string
}

export default function OutputPane({ doc, format, label }: Props) {
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    import('relational-text/registry').then(async ({ to }) => {
      try {
        const result = await to(format as FormatName, doc)
        if (!cancelled) {
          setOutput(result)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e))
          setOutput('')
        }
      }
    })
    return () => { cancelled = true }
  }, [doc, format])

  return (
    <div className="output-pane">
      {label && <div className="pane-header">{label}</div>}
      {error ? (
        <div className="error">{error}</div>
      ) : (
        <pre className="output-content">{output}</pre>
      )}
    </div>
  )
}
