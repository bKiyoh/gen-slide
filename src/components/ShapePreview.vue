<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { createShapeRenderer } from '../renderer/three/createShapeRenderer.js'

const props = defineProps({ shapes: { type: Array, required: true } })
const container = ref(null)
const status = ref({ state: 'initializing', backend: '判定不能', message: '初期化待ちです。' })
let renderer = null

function update() {
  try {
    renderer?.updateShapes(props.shapes)
  } catch (error) {
    status.value = { state: 'error', backend: status.value.backend, message: error.message }
  }
}

onMounted(async () => {
  renderer = createShapeRenderer(container.value, nextStatus => { status.value = nextStatus })
  await renderer.init(props.shapes)
  // 非同期初期化中に入力が変わった場合も、最新の正常値を反映する。
  update()
})

watch(() => props.shapes, update)
onUnmounted(() => { void renderer?.dispose() })
</script>

<template>
  <div class="preview-status" role="status" aria-live="polite">
    <span class="backend" :data-state="status.state" data-testid="backend">{{ status.backend }}</span>
    <span>{{ status.message }}</span>
  </div>
  <div ref="container" class="canvas-container" data-testid="canvas-container">
    <p v-if="status.state === 'error'" class="canvas-message" role="alert">
      描画できませんでした。<br />
      {{ status.message }}<br />
      ブラウザの GPU 設定を確認し、プレビューを再起動してください。
    </p>
    <p v-else-if="status.state === 'initializing'" class="canvas-message">GPU を初期化中…</p>
  </div>
</template>
