<script setup>
import { ref } from 'vue'
import PhaseOneSample from './components/PhaseOneSample.vue'
import PhaseZeroSample from './components/PhaseZeroSample.vue'
import PhaseTwoSample from './components/PhaseTwoSample.vue'
import EditorView from './editor/EditorView.vue'

const sample = ref('editor')
</script>

<template>
  <nav class="sample-switch" :class="{ 'editor-navigation': sample === 'editor' }" aria-label="検証サンプル">
    <button type="button" :aria-pressed="sample === 'editor'" @click="sample = 'editor'">Phase 3 · Editor</button>
    <button type="button" :aria-pressed="sample === 'phase2'" @click="sample = 'phase2'">Phase 2 · 時刻の評価</button>
    <button type="button" :aria-pressed="sample === 'phase1'" @click="sample = 'phase1'">Phase 1 · 図形の生成</button>
    <button type="button" :aria-pressed="sample === 'phase0'" @click="sample = 'phase0'">Phase 0 · 描画基盤</button>
  </nav>
  <EditorView v-if="sample === 'editor'" />
  <PhaseTwoSample v-else-if="sample === 'phase2'" />
  <PhaseOneSample v-else-if="sample === 'phase1'" />
  <PhaseZeroSample v-else />
</template>
