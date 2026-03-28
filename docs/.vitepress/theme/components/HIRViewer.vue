<template>
  <div class="hir-viewer">
    <div v-if="!isReady" class="loading">Loading WASM...</div>
    <template v-else>
      <div class="input-row">
        <label class="section-label">Markdown input</label>
        <textarea
          v-model="input"
          class="md-textarea"
          rows="4"
          spellcheck="false"
        />
      </div>

      <div class="columns">
        <!-- Left: flat facets -->
        <div class="col">
          <div class="col-header">Flat Facets</div>
          <div class="col-body">
            <div v-if="!docJson || !docJson.facets?.length" class="empty-note">
              (no facets)
            </div>
            <template v-else>
              <div
                v-for="(facet, fi) in docJson.facets"
                :key="fi"
                class="facet-row"
              >
                <span class="byte-range">
                  {{ facet.index.byteStart }}–{{ facet.index.byteEnd }}
                </span>
                <span class="text-slice">"{{ textSlice(facet.index.byteStart, facet.index.byteEnd) }}"</span>
                <div
                  v-for="(feat, fei) in facet.features"
                  :key="fei"
                  class="feature-tag"
                >
                  <span class="feature-type">{{ feat.$type }}</span>
                  <span v-if="feat.name" class="feature-name">#{{ feat.name }}</span>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Arrow -->
        <div class="arrow-col">
          <div class="arrow">→</div>
        </div>

        <!-- Middle: HIR tree -->
        <div class="col">
          <div class="col-header">HIR Tree</div>
          <div class="col-body hir-tree">
            <div v-if="!hirNodes?.length" class="empty-note">(empty)</div>
            <HIRNodeDisplay
              v-for="(node, i) in hirNodes"
              :key="i"
              :node="node"
              :depth="0"
            />
          </div>
        </div>
      </div>

      <!-- Bottom: HTML output -->
      <div class="html-row">
        <div class="col-header">Rendered HTML</div>
        <div class="html-split">
          <div class="html-source">
            <div class="sub-header">Source</div>
            <pre class="html-pre"><code>{{ htmlOutput }}</code></pre>
          </div>
          <div class="html-preview">
            <div class="sub-header">Preview</div>
            <div class="html-render" v-html="htmlOutput" />
          </div>
        </div>
      </div>

      <div v-if="error" class="error-msg">{{ error }}</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineComponent, h, PropType, onMounted } from 'vue'

// ---- Recursive HIR node renderer (inline component) ----
const HIRNodeDisplay = defineComponent({
  name: 'HIRNodeDisplay',
  props: {
    node: { type: Object as PropType<Record<string, unknown>>, required: true },
    depth: { type: Number, default: 0 },
  },
  setup(props) {
    const indent = computed(() => props.depth * 16)

    return () => {
      const node = props.node as {
        type: string
        name?: string
        content?: string
        attrs?: Record<string, unknown>
        marks?: Array<{ kind: string; attrs: Record<string, unknown> }>
        children?: Array<Record<string, unknown>>
      }

      const style = { paddingLeft: `${indent.value}px` }

      if (node.type === 'block') {
        const attrsStr = node.attrs && Object.keys(node.attrs).length
          ? ` (${JSON.stringify(node.attrs)})`
          : ''
        return h('div', { class: 'hir-block', style }, [
          h('div', { class: 'hir-row' }, [
            h('span', { class: 'hir-type hir-block-type' }, 'block'),
            h('span', { class: 'hir-name' }, ` ${node.name}${attrsStr}`),
          ]),
          ...(node.children ?? []).map((child, i) =>
            h(HIRNodeDisplay, { node: child, depth: props.depth + 1, key: i })
          ),
        ])
      }

      if (node.type === 'container') {
        return h('div', { class: 'hir-container', style }, [
          h('div', { class: 'hir-row' }, [
            h('span', { class: 'hir-type hir-container-type' }, 'container'),
            h('span', { class: 'hir-name' }, ` ${node.name}`),
          ]),
          ...(node.children ?? []).map((child, i) =>
            h(HIRNodeDisplay, { node: child, depth: props.depth + 1, key: i })
          ),
        ])
      }

      if (node.type === 'text') {
        const marksStr = node.marks?.length
          ? ` [${node.marks.map((m) => m.kind.split('#').pop() ?? m.kind).join(', ')}]`
          : ''
        const displayContent = (node.content ?? '')
          .replace(/\uFFFC/g, '⊕')
          .replace(/\n/, '↵')
        return h('div', { class: 'hir-text', style }, [
          h('span', { class: 'hir-type hir-text-type' }, 'text'),
          h('span', { class: 'hir-content' }, ` "${displayContent}"`),
          marksStr ? h('span', { class: 'hir-marks' }, marksStr) : null,
        ])
      }

      return h('div', { style }, `unknown: ${node.type}`)
    }
  },
})

// ---- Main component ----
const isReady = ref(false)
const error = ref('')
const input = ref(`**Hello**, _world_!

A [link](https://example.com) and some \`code\`.`)

type RT = {
  fromMarkdown(s: string): {
    toJSON(): unknown
    toHIR(): unknown[]
  }
  toHTML(doc: { toJSON(): unknown; toHIR(): unknown[] }): string
}

let rt: RT | null = null

const docJson = ref<{ text: string; facets?: Array<{ index: { byteStart: number; byteEnd: number }; features: Array<Record<string, unknown>> }> } | null>(null)
const hirNodes = ref<Array<Record<string, unknown>>>([])
const htmlOutput = ref('')

function textSlice(byteStart: number, byteEnd: number): string {
  if (!docJson.value) return ''
  const enc = new TextEncoder()
  const dec = new TextDecoder()
  const bytes = enc.encode(docJson.value.text)
  const slice = bytes.slice(byteStart, byteEnd)
  const s = dec.decode(slice)
  return s
    .replace(/\uFFFC/g, '⊕')
    .replace(/\n/g, '↵')
    .substring(0, 20)
}

function update() {
  if (!rt) return
  try {
    error.value = ''
    const doc = rt.fromMarkdown(input.value)
    docJson.value = doc.toJSON() as typeof docJson.value
    hirNodes.value = doc.toHIR() as Array<Record<string, unknown>>
    htmlOutput.value = rt.toHTML(doc)
  } catch (e) {
    error.value = String(e)
  }
}

// Watch input changes
import { watch } from 'vue'
watch(input, () => update())

onMounted(async () => {
  try {
    rt = await import('relational-text') as unknown as RT
    isReady.value = true
    update()
  } catch (e) {
    error.value = `Failed to load WASM: ${String(e)}`
    isReady.value = true
  }
})
</script>

<style scoped>
.hir-viewer {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 16px;
  margin: 24px 0;
  background: var(--vp-c-bg-soft);
}

.loading {
  text-align: center;
  color: var(--vp-c-text-2);
  padding: 24px;
  font-style: italic;
}

.section-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vp-c-text-2);
  margin-bottom: 6px;
}

.md-textarea {
  width: 100%;
  box-sizing: border-box;
  font-family: var(--vp-font-family-mono);
  font-size: 0.85rem;
  padding: 10px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  resize: vertical;
  outline: none;
  margin-bottom: 12px;
}

.md-textarea:focus {
  border-color: var(--vp-c-brand);
}

.columns {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 8px;
  align-items: start;
  margin-bottom: 12px;
}

@media (max-width: 640px) {
  .columns {
    grid-template-columns: 1fr;
  }
  .arrow-col { display: none; }
}

.col {
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

.col-header {
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  padding: 5px 10px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-2);
}

.col-body {
  padding: 8px;
  min-height: 100px;
  max-height: 280px;
  overflow: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 0.73rem;
}

.arrow-col {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 40px;
}

.arrow {
  font-size: 1.4rem;
  color: var(--vp-c-text-2);
}

.empty-note {
  color: var(--vp-c-text-3);
  font-style: italic;
  font-size: 0.8rem;
  padding: 4px;
}

/* Facet rows */
.facet-row {
  margin-bottom: 8px;
  padding: 6px 8px;
  background: var(--vp-c-bg-soft);
  border-radius: 4px;
  border: 1px solid var(--vp-c-divider);
}

.byte-range {
  font-weight: 700;
  color: var(--vp-c-brand);
}

.text-slice {
  margin-left: 6px;
  color: var(--vp-c-text-2);
}

.feature-tag {
  margin-top: 3px;
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.feature-type {
  background: #dbeafe;
  color: #1e40af;
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 0.7rem;
}

.feature-name {
  background: #dcfce7;
  color: #166534;
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 0.7rem;
  font-weight: 700;
}

/* HIR tree */
.hir-tree {
  padding: 8px;
}

.hir-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 1px;
}

.hir-type {
  font-size: 0.7rem;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 700;
  flex-shrink: 0;
}

.hir-block-type     { background: #fee2e2; color: #991b1b; }
.hir-container-type { background: #fef9c3; color: #92400e; }
.hir-text-type      { background: #f0fdf4; color: #166534; }

.hir-name {
  color: var(--vp-c-text-1);
  font-size: 0.78rem;
}

.hir-content {
  color: #7c3aed;
  font-size: 0.78rem;
}

.hir-marks {
  color: var(--vp-c-text-2);
  font-size: 0.7rem;
  margin-left: 4px;
}

.hir-block, .hir-container, .hir-text {
  margin-bottom: 2px;
}

/* HTML section */
.html-row {
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

.html-row .col-header {
  border-radius: 0;
}

.html-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}

@media (max-width: 640px) {
  .html-split { grid-template-columns: 1fr; }
}

.html-source, .html-preview {
  padding: 8px;
  border-right: 1px solid var(--vp-c-divider);
}

.html-preview {
  border-right: none;
}

.sub-header {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}

.html-pre {
  margin: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 0.72rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow: auto;
}

.html-render {
  font-size: 0.9rem;
  line-height: 1.6;
  max-height: 200px;
  overflow: auto;
}

.html-render :deep(p)      { margin: 0 0 6px; }
.html-render :deep(p:last-child) { margin-bottom: 0; }
.html-render :deep(strong) { font-weight: 700; }
.html-render :deep(em)     { font-style: italic; }
.html-render :deep(a)      { color: var(--vp-c-brand); text-decoration: underline; }
.html-render :deep(code)   {
  background: var(--vp-c-bg-soft);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.85em;
}

.error-msg {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  background: #fef2f2;
  color: #dc2626;
  font-size: 0.85rem;
  font-family: var(--vp-font-family-mono);
}
</style>
