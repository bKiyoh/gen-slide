<script setup>
import { ref } from 'vue'
import PhaseOneSample from './components/PhaseOneSample.vue'
import PhaseZeroSample from './components/PhaseZeroSample.vue'

const sample = ref('phase1')
</script>

<template>
  <nav class="sample-switch" aria-label="検証サンプル">
    <button type="button" :aria-pressed="sample === 'phase1'" @click="sample = 'phase1'">Phase 1 · 図形の生成</button>
    <button type="button" :aria-pressed="sample === 'phase0'" @click="sample = 'phase0'">Phase 0 · 描画基盤</button>
  </nav>
  <PhaseOneSample v-if="sample === 'phase1'" />
  <PhaseZeroSample v-else />
</template>
