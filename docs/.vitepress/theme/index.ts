import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import DocInspector from './components/DocInspector.vue'
import ExpandDemo from './components/ExpandDemo.vue'
import LensTrace from './components/LensTrace.vue'
import HIRViewer from './components/HIRViewer.vue'
import WireDisplay from './components/WireDisplay.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('DocInspector', DocInspector)
    app.component('ExpandDemo', ExpandDemo)
    app.component('LensTrace', LensTrace)
    app.component('HIRViewer', HIRViewer)
    app.component('WireDisplay', WireDisplay)
  },
} satisfies Theme
