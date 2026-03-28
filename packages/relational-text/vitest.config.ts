import { defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'
import wasm from 'vite-plugin-wasm'
import tsconfigPaths from 'vite-tsconfig-paths'
import type { Plugin } from 'vite'

/** Vite plugin to import .wasm.b64 files as raw text strings. */
function wasmB64Plugin(): Plugin {
  return {
    name: 'wasm-b64-raw',
    load(id) {
      if (id.endsWith('.wasm.b64')) {
        const content = readFileSync(id, 'utf8')
        return `export default ${JSON.stringify(content)}`
      }
    },
  }
}

export default defineConfig({
  plugins: [wasm(), tsconfigPaths(), wasmB64Plugin()],
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['**/.worktrees/**', '**/.claude/**'],
    setupFiles: ['./test/setup.ts'],
  },
})
