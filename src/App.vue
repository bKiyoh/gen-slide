<script setup>
import { ref, shallowRef } from 'vue'
import PhaseOneSample from './components/PhaseOneSample.vue'
import PhaseZeroSample from './components/PhaseZeroSample.vue'
import PhaseTwoSample from './components/PhaseTwoSample.vue'
import EditorView from './editor/EditorView.vue'
import PresentationView from './presentation/PresentationView.vue'

const sample = ref('editor')
const editor = ref(null)
const project = shallowRef(null)
const presentationProject = shallowRef(null)
function navigate(target) {
  if (sample.value === 'editor') {
    editor.value?.flush()
    project.value = editor.value?.getProject() ?? project.value
  }
  if (target === 'presentation') presentationProject.value = project.value
  sample.value = target
}
function compareDesigns(comparison) {
  navigate('presentation')
  presentationProject.value = comparison
}
</script>

<template>
  <nav v-if="sample !== 'presentation'" class="sample-switch" :class="{ 'editor-navigation': sample === 'editor' }" aria-label="検証サンプル">
    <button type="button" :aria-pressed="sample === 'editor'" @click="navigate('editor')">Phase 3 · Editor</button>
    <button type="button" @click="navigate('presentation')">Phase 4 · Presentation</button>
    <button type="button" :aria-pressed="sample === 'phase2'" @click="navigate('phase2')">Phase 2 · 時刻の評価</button>
    <button type="button" :aria-pressed="sample === 'phase1'" @click="navigate('phase1')">Phase 1 · 図形の生成</button>
    <button type="button" :aria-pressed="sample === 'phase0'" @click="navigate('phase0')">Phase 0 · 描画基盤</button>
  </nav>
  <EditorView v-if="sample === 'editor'" ref="editor" :initial-project="project" @present="navigate('presentation')" @compare-designs="compareDesigns" />
  <PresentationView v-else-if="sample === 'presentation'" :project="presentationProject" @edit-project="navigate('editor')" />
  <PhaseTwoSample v-else-if="sample === 'phase2'" />
  <PhaseOneSample v-else-if="sample === 'phase1'" />
  <PhaseZeroSample v-else />
</template>
