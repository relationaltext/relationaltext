import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Static export — no Node.js server needed, no SSR. WASM loads client-side only.
  output: 'export',
  // Hosted at demo.relationaltext.org via GitHub Pages (separate repo)
  // Transpile workspace packages that ship raw TypeScript (no pre-built dist/).
  transpilePackages: ['relational-text', 'relational-text-react'],
  webpack(config, { isServer }) {
    // Enable async WebAssembly for wasm-pack bundler target output.
    config.experiments = { ...config.experiments, asyncWebAssembly: true }
    // Automerge ships two WASM targets. The `web` target has no _bg.js alongside
    // its .wasm, so asyncWebAssembly can't resolve the WASM import section.
    // Automerge loads it via `new URL(..., import.meta.url)` — treat as asset.
    config.module.rules.push({
      test: /automerge_wasm_bg\.wasm$/,
      include: /wasm_bindgen_output[\\/]web[\\/]/,
      type: 'asset/resource',
    })
    // Suppress webpack warning about WASM output in environments that
    // may not support async/await (the demo targets modern browsers only).
    if (!isServer) {
      config.output = {
        ...config.output,
        environment: { ...config.output?.environment, asyncFunction: true },
      }
    }
    // The automerge chunk references Node's 'module' builtin — stub it out
    // on the client to avoid a "Can't resolve 'module'" warning.
    if (!isServer) {
      config.resolve = {
        ...config.resolve,
        fallback: { ...config.resolve?.fallback, module: false },
      }
    }
    // Load .wasm.b64 files as raw text strings (base64-encoded WASM binaries).
    config.module.rules.push({
      test: /\.wasm\.b64$/,
      type: 'asset/source',
    })
    // Resolve .js imports to .ts source files in workspace packages.
    // ESM TypeScript uses .js extensions in imports; webpack needs to
    // try .ts when the .js file doesn't exist.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
}

export default nextConfig
