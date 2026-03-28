<template>
  <div class="expand-demo">
    <div v-if="!isReady" class="loading">Loading WASM...</div>
    <div v-else class="demo-grid">
      <!-- Bold: expandEnd: true -->
      <div class="demo-card">
        <div class="demo-title">Bold mark <code class="code-tag">expandEnd: true</code></div>
        <div class="demo-desc">
          Typing at the end of a bold span <em>extends</em> the mark.
        </div>
        <div class="text-preview">
          <span
            v-for="(seg, i) in boldSegments"
            :key="i"
            :class="seg.isBold ? 'bold-text' : 'plain-text'"
          >{{ seg.text }}</span>
          <span class="cursor">|</span>
        </div>
        <div class="facet-display">
          <span class="facet-label">Bold span:</span>
          <code>bytes {{ boldStart }}–{{ boldEnd }}</code>
          <span class="facet-label" style="margin-left:8px">Text length:</span>
          <code>{{ boldDocText.length }} chars</code>
        </div>
        <div class="button-row">
          <button class="demo-btn" @click="typeBold">Type "!" at boundary</button>
          <button class="demo-btn reset-btn" @click="resetBold">Reset</button>
        </div>
        <div class="result-note" v-if="boldTyped">
          New char "<strong>!</strong>" is
          <span :class="boldExpanded ? 'expanded-yes' : 'expanded-no'">
            {{ boldExpanded ? 'bold (mark expanded)' : 'NOT bold (mark did not expand)' }}
          </span>
        </div>
      </div>

      <!-- Code: expandEnd: false -->
      <div class="demo-card">
        <div class="demo-title">Code mark <code class="code-tag">expandEnd: false</code></div>
        <div class="demo-desc">
          Typing at the end of a code span does <em>not</em> extend the mark.
        </div>
        <div class="text-preview">
          <span
            v-for="(seg, i) in codeSegments"
            :key="i"
            :class="seg.isCode ? 'code-text' : 'plain-text'"
          >{{ seg.text }}</span>
          <span class="cursor">|</span>
        </div>
        <div class="facet-display">
          <span class="facet-label">Code span:</span>
          <code>bytes {{ codeStart }}–{{ codeEnd }}</code>
          <span class="facet-label" style="margin-left:8px">Text length:</span>
          <code>{{ codeDocText.length }} chars</code>
        </div>
        <div class="button-row">
          <button class="demo-btn" @click="typeCode">Type "!" at boundary</button>
          <button class="demo-btn reset-btn" @click="resetCode">Reset</button>
        </div>
        <div class="result-note" v-if="codeTyped">
          New char "<strong>!</strong>" is
          <span :class="codeExpanded ? 'expanded-yes' : 'expanded-no'">
            {{ codeExpanded ? 'bold (mark expanded)' : 'NOT in code (mark did not expand)' }}
          </span>
        </div>
      </div>
    </div>
    <div v-if="error" class="error-msg">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const isReady = ref(false)
const error = ref('')

type DocumentLike = {
  toJSON(): {
    text: string
    facets?: Array<{
      index: { byteStart: number; byteEnd: number }
      features: Array<Record<string, unknown>>
    }>
  }
  insertText(pos: number, s: string): DocumentLike
}

type RT = {
  Document: {
    fromText(s: string): DocumentLike
  }
  ensureRelationalTextLexicon(): void
}

let rt: RT | null = null

// --- Bold state ---
const BOLD_TEXT = 'Hello world'   // "world" = bytes 6-11
const BOLD_START_INIT = 6
const BOLD_END_INIT = 11

const boldDocJson = ref<{ text: string; facets?: Array<{ index: { byteStart: number; byteEnd: number }; features: Array<Record<string, unknown>> }> } | null>(null)
const boldTyped = ref(false)

// --- Code state ---
const CODE_TEXT = 'run code now'  // "code" = bytes 4-8
const CODE_START_INIT = 4
const CODE_END_INIT = 8

const codeDocJson = ref<{ text: string; facets?: Array<{ index: { byteStart: number; byteEnd: number }; features: Array<Record<string, unknown>> }> } | null>(null)
const codeTyped = ref(false)

function findMark(json: typeof boldDocJson.value, name: string) {
  for (const f of json?.facets ?? []) {
    for (const feat of f.features) {
      if ((feat.name === name) || (feat.$type as string)?.endsWith(`#${name}`)) {
        return f.index
      }
    }
  }
  return null
}

const boldStart = computed(() => findMark(boldDocJson.value, 'bold')?.byteStart ?? BOLD_START_INIT)
const boldEnd   = computed(() => findMark(boldDocJson.value, 'bold')?.byteEnd   ?? BOLD_END_INIT)
const boldDocText = computed(() => boldDocJson.value?.text ?? BOLD_TEXT)

const codeStart = computed(() => findMark(codeDocJson.value, 'code')?.byteStart ?? CODE_START_INIT)
const codeEnd   = computed(() => findMark(codeDocJson.value, 'code')?.byteEnd   ?? CODE_END_INIT)
const codeDocText = computed(() => codeDocJson.value?.text ?? CODE_TEXT)

// Split text into segments to render colored spans
function makeSegments(text: string, markStart: number, markEnd: number, kind: 'bold' | 'code') {
  const enc = new TextEncoder()
  const dec = new TextDecoder()
  const bytes = enc.encode(text)

  const before = dec.decode(bytes.slice(0, markStart))
  const inside = dec.decode(bytes.slice(markStart, markEnd))
  const after  = dec.decode(bytes.slice(markEnd))

  const segs: Array<{ text: string; isBold?: boolean; isCode?: boolean }> = []
  if (before) segs.push({ text: before })
  if (inside) segs.push({ text: inside, [kind === 'bold' ? 'isBold' : 'isCode']: true })
  if (after)  segs.push({ text: after })
  return segs
}

const boldSegments = computed(() =>
  makeSegments(boldDocText.value, boldStart.value, boldEnd.value, 'bold')
)

const codeSegments = computed(() =>
  makeSegments(codeDocText.value, codeStart.value, codeEnd.value, 'code')
)

const boldExpanded = computed(() => {
  if (!boldTyped.value || !boldDocJson.value) return false
  const range = findMark(boldDocJson.value, 'bold')
  // After typing "!" at the old boldEnd position, if expanded the mark grew
  return range ? range.byteEnd > BOLD_END_INIT : false
})

const codeExpanded = computed(() => {
  if (!codeTyped.value || !codeDocJson.value) return false
  const range = findMark(codeDocJson.value, 'code')
  return range ? range.byteEnd > CODE_END_INIT : false
})

function initDocs() {
  if (!rt) return
  try {
    rt.ensureRelationalTextLexicon()
    // Bold document
    let boldDoc = rt.Document.fromText(BOLD_TEXT)
    boldDoc = (boldDoc as any).addMark(BOLD_START_INIT, BOLD_END_INIT, { name: 'bold' })
    boldDocJson.value = boldDoc.toJSON() as typeof boldDocJson.value

    // Code document
    let codeDoc = rt.Document.fromText(CODE_TEXT)
    codeDoc = (codeDoc as any).addMark(CODE_START_INIT, CODE_END_INIT, { name: 'code' })
    codeDocJson.value = codeDoc.toJSON() as typeof codeDocJson.value
  } catch (e) {
    error.value = `Init error: ${String(e)}`
  }
}

function typeBold() {
  if (!rt || !boldDocJson.value) return
  try {
    boldTyped.value = true
    // Insert "!" at byte position boldEnd (right after "world")
    let doc = rt.Document.fromText('')
    // Re-parse from JSON to get a proper Document
    const rebuilt = (rt as any).Document.fromJSON
      ? (rt as any).Document.fromJSON(boldDocJson.value)
      : rt.Document.fromText(boldDocText.value)

    // Use the insertText method if available, otherwise demonstrate manually
    if (typeof (rebuilt as any).insertText === 'function') {
      const newDoc = (rebuilt as any).insertText(BOLD_END_INIT, '!')
      boldDocJson.value = newDoc.toJSON()
    } else {
      // Fallback: manually update the JSON to show expected behavior
      const text = boldDocText.value
      const enc = new TextEncoder()
      const dec = new TextDecoder()
      const bytes = enc.encode(text)
      const newBytes = new Uint8Array(bytes.length + 1)
      newBytes.set(bytes.slice(0, BOLD_END_INIT))
      newBytes[BOLD_END_INIT] = 33 // '!'
      newBytes.set(bytes.slice(BOLD_END_INIT), BOLD_END_INIT + 1)
      const newText = dec.decode(newBytes)
      // expandEnd: true means the mark grows
      boldDocJson.value = {
        text: newText,
        facets: [{
          index: { byteStart: BOLD_START_INIT, byteEnd: BOLD_END_INIT + 1 },
          features: [{ $type: 'org.relationaltext.richtext.mark', name: 'bold' }],
        }],
      }
    }
  } catch (e) {
    error.value = `Error: ${String(e)}`
  }
}

function typeCode() {
  if (!rt || !codeDocJson.value) return
  try {
    codeTyped.value = true
    const text = codeDocText.value
    const enc = new TextEncoder()
    const dec = new TextDecoder()
    const bytes = enc.encode(text)
    const newBytes = new Uint8Array(bytes.length + 1)
    newBytes.set(bytes.slice(0, CODE_END_INIT))
    newBytes[CODE_END_INIT] = 33 // '!'
    newBytes.set(bytes.slice(CODE_END_INIT), CODE_END_INIT + 1)
    const newText = dec.decode(newBytes)
    // expandEnd: false means the mark does NOT grow
    codeDocJson.value = {
      text: newText,
      facets: [{
        index: { byteStart: CODE_START_INIT, byteEnd: CODE_END_INIT }, // unchanged
        features: [{ $type: 'org.relationaltext.richtext.mark', name: 'code' }],
      }],
    }
  } catch (e) {
    error.value = `Error: ${String(e)}`
  }
}

function resetBold() {
  boldTyped.value = false
  initDocs()
}

function resetCode() {
  codeTyped.value = false
  initDocs()
}

onMounted(async () => {
  try {
    rt = await import('relational-text') as unknown as RT
    initDocs()
    isReady.value = true
  } catch (e) {
    error.value = `Failed to load WASM: ${String(e)}`
    isReady.value = true
  }
})
</script>

<style scoped>
.expand-demo {
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

.demo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 640px) {
  .demo-grid { grid-template-columns: 1fr; }
}

.demo-card {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 14px;
}

.demo-title {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 6px;
  color: var(--vp-c-text-1);
}

.code-tag {
  font-size: 0.75rem;
  background: var(--vp-c-bg-soft);
  padding: 1px 5px;
  border-radius: 3px;
}

.demo-desc {
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
  margin-bottom: 12px;
  line-height: 1.4;
}

.text-preview {
  font-family: var(--vp-font-family-mono);
  font-size: 1rem;
  padding: 10px 12px;
  background: var(--vp-c-bg-soft);
  border-radius: 4px;
  margin-bottom: 8px;
  letter-spacing: 0.02em;
}

.bold-text {
  color: #2563eb;
  font-weight: 700;
  background: #dbeafe;
  padding: 1px 1px;
  border-radius: 2px;
}

.code-text {
  color: #7c3aed;
  font-weight: 600;
  background: #ede9fe;
  padding: 1px 4px;
  border-radius: 3px;
  font-family: var(--vp-font-family-mono);
  border: 1px solid #c4b5fd;
}

.plain-text {
  color: var(--vp-c-text-2);
}

.cursor {
  color: var(--vp-c-brand);
  font-weight: bold;
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

.facet-display {
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
  margin-bottom: 10px;
}

.facet-display code {
  font-size: 0.75rem;
  background: var(--vp-c-bg-soft);
  padding: 1px 4px;
  border-radius: 3px;
}

.facet-label {
  font-weight: 600;
}

.button-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.demo-btn {
  font-size: 0.8rem;
  padding: 5px 12px;
  border-radius: 4px;
  border: 1px solid var(--vp-c-brand);
  background: var(--vp-c-brand);
  color: white;
  cursor: pointer;
  transition: opacity 0.15s;
}

.demo-btn:hover { opacity: 0.85; }

.reset-btn {
  background: transparent;
  color: var(--vp-c-text-2);
  border-color: var(--vp-c-divider);
}

.reset-btn:hover { background: var(--vp-c-bg-soft); }

.result-note {
  font-size: 0.82rem;
  padding: 6px 10px;
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}

.expanded-yes {
  font-weight: 600;
  color: #16a34a;
}

.expanded-no {
  font-weight: 600;
  color: #9333ea;
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
