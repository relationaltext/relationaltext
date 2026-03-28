/** Type declaration for .wasm.b64 files imported as text strings via esbuild loader. */
declare module '*.wasm.b64' {
  const content: string
  export default content
}
