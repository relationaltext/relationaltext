<template>
  <div class="doc-inspector">
    <div v-if="!isReady" class="loading">Loading WASM...</div>
    <template v-else>
      <div class="editor-area">
        <label class="input-label">Markdown input</label>
        <textarea
          v-model="input"
          class="md-textarea"
          rows="5"
          spellcheck="false"
        />
      </div>

      <div class="panels">
        <div class="panel panel--wire">
          <div class="panel-title">Wire format <code>{ text, facets }</code></div>
          <div class="panel-content">
            <WireDisplay
              v-if="wireJson"
              :text="wireJson.text"
              :facets="wireJson.facets ?? []"
            />
            <div v-else class="empty-wire">—</div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">Rendered HTML</div>
          <div class="panel-content html-preview" v-html="renderedHtml" />
        </div>
      </div>

      <div v-if="error" class="error-msg">{{ error }}</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import WireDisplay from './WireDisplay.vue'

const isReady = ref(false)
const error = ref('')
const input = ref(`**Hello**, _world_!

This is a second paragraph with a [link](https://example.com).`)

type RT = {
  fromMarkdown: (s: string) => { toJSON(): unknown }
  toHTML: (doc: { toJSON(): unknown }) => string
}

let rt: RT | null = null

onMounted(async () => {
  try {
    rt = await import('relational-text') as unknown as RT
    isReady.value = true
  } catch (e) {
    error.value = `Failed to load WASM: ${String(e)}`
    isReady.value = true
  }
})

const wireJson = computed(() => {
  if (!rt) return null
  try {
    error.value = ''
    const doc = rt.fromMarkdown(input.value)
    return doc.toJSON() as { text: string; facets: unknown[] }
  } catch (e) {
    error.value = String(e)
    return null
  }
})

const renderedHtml = computed(() => {
  if (!rt) return ''
  try {
    const doc = rt.fromMarkdown(input.value)
    return rt.toHTML(doc)
  } catch (e) {
    error.value = String(e)
    return ''
  }
})
</script>

<style scoped>
.doc-inspector {
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

.input-label {
  display: block;
  font-size: 0.8rem;
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
  font-size: 0.875rem;
  padding: 10px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  resize: vertical;
  outline: none;
}

.md-textarea:focus {
  border-color: var(--vp-c-brand);
}

.panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 12px;
}

@media (max-width: 640px) {
  .panels {
    grid-template-columns: 1fr;
  }
}

.panel {
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

.panel-title {
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  padding: 6px 12px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.panel-content {
  min-height: 120px;
  max-height: 400px;
  overflow: auto;
}

.panel--wire .panel-content {
  padding: 0;
}

.empty-wire {
  padding: 12px;
  color: var(--vp-c-text-3);
}

.html-preview {
  padding: 12px;
  font-size: 0.9rem;
  line-height: 1.6;
}

.html-preview :deep(p) { margin: 0 0 8px; }
.html-preview :deep(p:last-child) { margin-bottom: 0; }
.html-preview :deep(strong) { font-weight: 700; }
.html-preview :deep(em) { font-style: italic; }
.html-preview :deep(a) { color: var(--vp-c-brand); text-decoration: underline; }
.html-preview :deep(code) {
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
