<template>
  <div class="lens-trace">
    <div v-if="!isReady" class="loading">Loading WASM...</div>
    <template v-else>
      <div class="trace-layout">
        <!-- Lens spec -->
        <div class="trace-panel">
          <div class="panel-header">Lens Spec (JSON)</div>
          <textarea
            v-model="lensText"
            class="trace-textarea"
            rows="14"
            spellcheck="false"
          />
          <div v-if="lensError" class="inline-error">{{ lensError }}</div>
        </div>

        <!-- Input document -->
        <div class="trace-panel">
          <div class="panel-header">Input Document (JSON)</div>
          <textarea
            v-model="inputText"
            class="trace-textarea"
            rows="14"
            spellcheck="false"
          />
          <div v-if="inputError" class="inline-error">{{ inputError }}</div>
        </div>

        <!-- Output document -->
        <div class="trace-panel">
          <div class="panel-header">
            Output Document
            <span v-if="outputOk" class="ok-badge">✓</span>
          </div>
          <pre class="output-display"><code>{{ outputDisplay }}</code></pre>
          <div v-if="outputError" class="inline-error">{{ outputError }}</div>
        </div>
      </div>

      <div class="trace-note">
        The lens renames features from the source namespace to the target namespace.
        Rules are matched in order; unmatched features pass through when <code>passthrough: "keep"</code>.
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

const isReady = ref(false)

type RT = {
  applyLens(doc: unknown, spec: unknown): unknown
}

let rt: RT | null = null

const DEFAULT_LENS = `{
  "$type": "org.relationaltext.lens",
  "id": "org.example.demo-lens",
  "source": "org.example.source",
  "target": "org.example.target",
  "passthrough": "keep",
  "rules": [
    {
      "match": { "name": "strong" },
      "replace": { "name": "bold" }
    },
    {
      "match": { "name": "emphasis" },
      "replace": { "name": "italic" }
    },
    {
      "match": { "name": "link" },
      "replace": {
        "name": "a",
        "renameAttrs": { "uri": "href" }
      }
    }
  ]
}`

const DEFAULT_INPUT = `{
  "text": "\\uFFFCHello world",
  "facets": [
    {
      "index": { "byteStart": 0, "byteEnd": 3 },
      "features": [{
        "$type": "org.example.source",
        "name": "paragraph",
        "parents": [],
        "attrs": {}
      }]
    },
    {
      "index": { "byteStart": 3, "byteEnd": 8 },
      "features": [{
        "$type": "org.example.source",
        "name": "strong"
      }]
    },
    {
      "index": { "byteStart": 9, "byteEnd": 14 },
      "features": [{
        "$type": "org.example.source",
        "name": "emphasis"
      }]
    }
  ]
}`

const lensText  = ref(DEFAULT_LENS)
const inputText = ref(DEFAULT_INPUT)

const lensError   = ref('')
const inputError  = ref('')
const outputError = ref('')
const outputOk    = ref(false)
const outputDisplay = ref('')

function computeOutput() {
  if (!rt) return
  lensError.value  = ''
  inputError.value = ''
  outputError.value = ''
  outputOk.value = false

  let lens: unknown
  let inputDoc: unknown

  try {
    lens = JSON.parse(lensText.value)
  } catch (e) {
    lensError.value = `Invalid JSON: ${String(e)}`
    outputDisplay.value = ''
    return
  }

  try {
    inputDoc = JSON.parse(inputText.value)
  } catch (e) {
    inputError.value = `Invalid JSON: ${String(e)}`
    outputDisplay.value = ''
    return
  }

  try {
    const result = rt.applyLens(inputDoc, lens)
    outputDisplay.value = JSON.stringify(result, null, 2)
    outputOk.value = true
  } catch (e) {
    outputError.value = `applyLens error: ${String(e)}`
    outputDisplay.value = ''
  }
}

watch([lensText, inputText], () => {
  computeOutput()
})

onMounted(async () => {
  try {
    rt = await import('relational-text') as unknown as RT
    isReady.value = true
    computeOutput()
  } catch (e) {
    outputError.value = `Failed to load WASM: ${String(e)}`
    isReady.value = true
  }
})
</script>

<style scoped>
.lens-trace {
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

.trace-layout {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
}

@media (max-width: 768px) {
  .trace-layout {
    grid-template-columns: 1fr;
  }
}

.trace-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.panel-header {
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vp-c-text-2);
  padding: 4px 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ok-badge {
  color: #16a34a;
  font-size: 0.9rem;
}

.trace-textarea {
  width: 100%;
  box-sizing: border-box;
  font-family: var(--vp-font-family-mono);
  font-size: 0.73rem;
  line-height: 1.45;
  padding: 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  resize: vertical;
  outline: none;
}

.trace-textarea:focus {
  border-color: var(--vp-c-brand);
}

.output-display {
  margin: 0;
  padding: 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  font-family: var(--vp-font-family-mono);
  font-size: 0.73rem;
  line-height: 1.45;
  min-height: 220px;
  max-height: 340px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.inline-error {
  font-size: 0.75rem;
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  padding: 4px 8px;
  font-family: var(--vp-font-family-mono);
}

.trace-note {
  margin-top: 12px;
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
  padding: 8px 12px;
  background: var(--vp-c-bg);
  border-radius: 4px;
  border: 1px solid var(--vp-c-divider);
}

.trace-note code {
  font-size: 0.8rem;
  background: var(--vp-c-bg-soft);
  padding: 1px 4px;
  border-radius: 3px;
}
</style>
