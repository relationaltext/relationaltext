<template>
  <div class="wire-display">
    <!-- Text strip: always visible, toggle lives here -->
    <div class="text-strip">
      <span class="strip-label">{{ renderedHtml ? 'html' : 'text' }}</span>

      <!-- HTML preview mode -->
      <div
        v-if="renderedHtml"
        class="strip-content html-preview"
        v-html="renderedHtml"
      />

      <!-- Annotated text mode -->
      <span v-else class="strip-content">
        <template v-for="(seg, i) in segments" :key="i">
          <span
            v-if="seg.marker"
            class="block-marker"
            :style="markerStyle(seg)"
            :title="seg.marker === 'fffc'
              ? 'U+FFFC OBJECT REPLACEMENT CHARACTER (3 bytes) — first block / embed marker'
              : 'U+000A LINE FEED (1 byte) — block separator'"
          >{{ seg.marker === 'fffc' ? '⊕' : '↵' }}</span>
          <span
            v-else
            class="text-seg"
            :style="segStyle(seg)"
            :title="segTitle(seg)"
          >{{ seg.text }}</span>
        </template>
      </span>

      <button
        class="raw-toggle"
        :class="{ active: showRaw }"
        @click="showRaw = !showRaw"
        :title="showRaw ? 'Switch to visual view' : 'Switch to raw JSON'"
      >{ }</button>
    </div>

    <!-- Raw document JSON -->
    <pre v-if="showRaw" class="raw-json">{{ rawJson }}</pre>

    <!-- Visual facet list -->
    <template v-else>
      <div v-if="facets.length" class="facet-list">
        <div v-for="(facet, fi) in facets" :key="fi" class="facet-entry">
          <div class="facet-row">
            <span
              class="color-swatch"
              :style="{ background: palette[fi % palette.length]!.solid }"
            />
            <span class="byte-range">
              [{{ facet.index.byteStart }}&thinsp;–&thinsp;{{ facet.index.byteEnd }})
            </span>
            <span class="features">
              <span
                v-for="(feat, fj) in facet.features"
                :key="fj"
                class="feature"
              >
                <span class="feat-type" :title="feat.$type">{{ shortType(feat.$type) }}</span>
                <span v-if="getName(feat)" class="feat-sep">#</span>
                <span v-if="getName(feat)" class="feat-name">{{ getName(feat) }}</span>
                <template v-for="(val, key) in getKeyAttrs(feat)" :key="key">
                  <span class="attr-pair">
                    <span class="attr-key">{{ key }}</span>
                    <span class="attr-val">{{ truncate(String(val)) }}</span>
                  </span>
                </template>
              </span>
            </span>
            <button
              class="expand-btn"
              :class="{ active: expandedFacets.has(fi) }"
              @click="toggleFacet(fi)"
              title="Show raw JSON for this facet"
            >{ }</button>
          </div>
          <pre v-if="expandedFacets.has(fi)" class="facet-raw">{{ JSON.stringify(facet, null, 2) }}</pre>
        </div>
      </div>
      <div v-else class="no-facets">no facets</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface ByteSlice { byteStart: number; byteEnd: number }
interface FacetJSON  { index: ByteSlice; features: FeatureRecord[] }
interface FeatureRecord { $type: string; [k: string]: unknown }

const props = defineProps<{
  text: string
  facets: FacetJSON[]
  renderedHtml?: string
}>()

// ── View state ────────────────────────────────────────────────────────────────

const showRaw = ref(false)
const expandedFacets = ref(new Set<number>())

function toggleFacet(fi: number) {
  const s = new Set(expandedFacets.value)
  if (s.has(fi)) s.delete(fi); else s.add(fi)
  expandedFacets.value = s
}

const rawJson = computed(() =>
  JSON.stringify({ text: props.text, facets: props.facets }, null, 2)
)

// ── Palette ───────────────────────────────────────────────────────────────────

const palette = [
  { solid: '#3b82f6', light: 'rgba(59,130,246,0.15)' },   // blue
  { solid: '#10b981', light: 'rgba(16,185,129,0.15)' },   // emerald
  { solid: '#f59e0b', light: 'rgba(245,158,11,0.15)'  },  // amber
  { solid: '#ef4444', light: 'rgba(239,68,68,0.15)'   },  // red
  { solid: '#8b5cf6', light: 'rgba(139,92,246,0.15)'  },  // violet
  { solid: '#ec4899', light: 'rgba(236,72,153,0.15)'  },  // pink
]

// ── Byte → char index mapping ─────────────────────────────────────────────────

function byteToChar(text: string, byteOffset: number): number {
  const bytes = new TextEncoder().encode(text)
  return new TextDecoder().decode(bytes.slice(0, byteOffset)).length
}

// ── Segment computation ───────────────────────────────────────────────────────

interface Segment {
  text: string
  marker?: 'fffc' | 'nl'
  facetIndices: number[]
}

const segments = computed((): Segment[] => {
  const { text, facets } = props

  const charBreaks = new Set<number>([0, text.length])
  for (const facet of facets) {
    charBreaks.add(byteToChar(text, facet.index.byteStart))
    charBreaks.add(byteToChar(text, facet.index.byteEnd))
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\uFFFC' || c === '\n') {
      charBreaks.add(i)
      charBreaks.add(i + 1)
    }
  }

  const sorted = [...charBreaks].sort((a, b) => a - b)
  const result: Segment[] = []

  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]!
    const end   = sorted[i + 1]!
    const chunk = text.slice(start, end)
    if (!chunk) continue

    const facetIndices: number[] = []
    for (let fi = 0; fi < facets.length; fi++) {
      const fs = byteToChar(text, facets[fi]!.index.byteStart)
      const fe = byteToChar(text, facets[fi]!.index.byteEnd)
      if (fs <= start && end <= fe) facetIndices.push(fi)
    }

    result.push({
      text: chunk,
      marker: chunk === '\uFFFC' ? 'fffc' : chunk === '\n' ? 'nl' : undefined,
      facetIndices,
    })
  }
  return result
})

// ── Styling ───────────────────────────────────────────────────────────────────

// Block marker chips use the palette color of their covering facet
function markerStyle(seg: Segment): Record<string, string> {
  if (!seg.facetIndices.length) {
    return { background: 'var(--vp-c-bg-mute)', borderColor: 'var(--vp-c-divider)', color: 'var(--vp-c-text-3)' }
  }
  const c = palette[seg.facetIndices[0]! % palette.length]!
  return { background: c.light, borderColor: c.solid, color: c.solid }
}

function segStyle(seg: Segment): Record<string, string> {
  if (!seg.facetIndices.length) return {}
  const shadows = seg.facetIndices.map((fi, rank) => {
    const y = 2 + rank * 3
    return `0 ${y}px 0 ${palette[fi % palette.length]!.solid}`
  })
  return {
    paddingBottom: `${2 + (seg.facetIndices.length - 1) * 3}px`,
    boxShadow: shadows.join(', '),
    backgroundColor: palette[seg.facetIndices[0]! % palette.length]!.light,
  }
}

function segTitle(seg: Segment): string {
  return seg.facetIndices.map(fi => {
    const f = props.facets[fi]!
    return `[${f.index.byteStart}–${f.index.byteEnd}) ${f.features.map(ft => ft.$type).join(', ')}`
  }).join('\n')
}

// ── Feature display helpers ───────────────────────────────────────────────────

function shortType(typeId: string): string {
  const clean = typeId.replace(/#.*$/, '')
  const parts = clean.split('.')
  const skip = new Set(['facet', 'richtext'])
  const meaningful = parts.filter(p => !skip.has(p))
  return meaningful[meaningful.length - 1] ?? parts[parts.length - 1] ?? typeId
}

function getName(feat: FeatureRecord): string | undefined {
  if (typeof feat.name === 'string') return feat.name
  const hash = feat.$type.indexOf('#')
  if (hash !== -1) return feat.$type.slice(hash + 1)
  return undefined
}

const SKIP_KEYS = new Set(['$type', 'name', 'parents', 'expandStart', 'expandEnd', 'attrs'])

function getKeyAttrs(feat: FeatureRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(feat)) {
    if (!SKIP_KEYS.has(k)) out[k] = v
  }
  if (feat.attrs && typeof feat.attrs === 'object') {
    for (const [k, v] of Object.entries(feat.attrs as Record<string, unknown>)) {
      out[k] = v
    }
  }
  return out
}

function truncate(s: string, max = 40): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}
</script>

<style scoped>
.wire-display {
  font-size: 0.82rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

/* ── Text strip ──────────────────────────────────────────────────────────────── */

.text-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px 14px 12px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  flex-wrap: wrap;
}

.strip-label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--vp-c-text-3);
  flex-shrink: 0;
  align-self: flex-start;
  padding-top: 2px;
}

.strip-content {
  flex: 1;
  font-family: var(--vp-font-family-mono);
  font-size: 0.875rem;
  line-height: 2;
  white-space: pre-wrap;
  word-break: break-all;
  align-self: flex-start;
}

.text-seg {
  display: inline;
  border-radius: 2px;
}

.strip-content.html-preview {
  font-family: var(--vp-font-family-base);
  font-size: 0.925rem;
  line-height: 1.6;
  white-space: normal;
}
.strip-content.html-preview :deep(strong) { font-weight: 700; }
.strip-content.html-preview :deep(em)     { font-style: italic; }
.strip-content.html-preview :deep(s)      { text-decoration: line-through; }
.strip-content.html-preview :deep(code) {
  font-family: var(--vp-font-family-mono);
  font-size: 0.85em;
  background: var(--vp-c-bg-mute);
  padding: 1px 4px;
  border-radius: 3px;
}
.strip-content.html-preview :deep(a) {
  color: var(--vp-c-brand);
  text-decoration: underline;
}

.block-marker {
  display: inline-block;
  font-family: var(--vp-font-family-mono);
  font-size: 0.8rem;
  font-weight: 700;
  line-height: 1;
  padding: 1px 4px;
  border-radius: 3px;
  border: 1px solid;
  vertical-align: middle;
  cursor: default;
}

/* ── Raw toggle button ───────────────────────────────────────────────────────── */

.raw-toggle {
  flex-shrink: 0;
  align-self: flex-start;
  margin-left: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.raw-toggle:hover {
  border-color: var(--vp-c-brand);
  color: var(--vp-c-brand);
}
.raw-toggle.active {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand);
  color: var(--vp-c-brand);
}

/* ── Raw JSON view ───────────────────────────────────────────────────────────── */

.raw-json {
  margin: 0;
  padding: 12px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.78rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
  max-height: 380px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

/* ── Facet list ──────────────────────────────────────────────────────────────── */

.facet-list {
  padding: 4px 0;
}

.facet-entry {
  border-bottom: 1px solid var(--vp-c-divider);
}
.facet-entry:last-child {
  border-bottom: none;
}

.facet-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px 5px 12px;
  line-height: 1.5;
}

.color-swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.byte-range {
  font-family: var(--vp-font-family-mono);
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 7ch;
}

.features {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.feature {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  flex-wrap: wrap;
}

.feat-type {
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  font-size: 0.78rem;
}

.feat-sep {
  color: var(--vp-c-text-3);
  font-size: 0.75rem;
}

.feat-name {
  font-family: var(--vp-font-family-mono);
  font-weight: 600;
  color: var(--vp-c-text-1);
  font-size: 0.82rem;
}

.attr-pair {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 3px;
  padding: 0 5px;
}

.attr-key {
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-3);
  font-size: 0.75rem;
}

.attr-val {
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-brand);
  font-size: 0.75rem;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Per-facet expand button ─────────────────────────────────────────────────── */

.expand-btn {
  flex-shrink: 0;
  margin-left: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 0.68rem;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-3);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.expand-btn:hover {
  border-color: var(--vp-c-brand);
  color: var(--vp-c-brand);
}
.expand-btn.active {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand);
  color: var(--vp-c-brand);
}

.facet-raw {
  margin: 0;
  padding: 8px 12px 8px 28px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--vp-c-bg-soft);
  border-top: 1px dashed var(--vp-c-divider);
  color: var(--vp-c-text-1);
  overflow: auto;
  max-height: 200px;
}

.no-facets {
  padding: 8px 12px;
  color: var(--vp-c-text-3);
  font-style: italic;
  font-size: 0.8rem;
}
</style>
