'use client'

export type FormatName = string

let initialized = false
let initPromise: Promise<void> | null = null

export async function ensureInit(): Promise<void> {
  if (initialized) return
  if (!initPromise) {
    initPromise = import('relational-text/wasm').then(({ initRelationalText }) =>
      initRelationalText().then(() => {
        initialized = true
      }),
    )
  }
  return initPromise
}
