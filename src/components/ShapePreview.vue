<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { createShapeRenderer } from '../renderer/three/createShapeRenderer.js'
import { calculateShapeGeometry } from '../domain/shapeGeometry.js'
import { transformMatrix } from '../domain/transition/transform.js'
import { fitCanvas } from '../renderer/fitCanvas.js'

const props = defineProps({ shapes: { type: Array, required: true }, selectedIds: { type: Array, default: () => [] }, transparent: Boolean })
const outlines = computed(() => props.shapes.filter(shape => props.selectedIds.includes(shape.id) || props.selectedIds.includes(shape.groupId)).map(shape => {
  const { positions } = calculateShapeGeometry(shape.geometry)
  const [a, b, c, d, x, y] = shape.worldMatrix ?? transformMatrix(shape.transform)
  const points = []
  for (let index = 0; index < positions.length; index += 3) points.push(`${a * positions[index] + c * positions[index + 1] + x},${b * positions[index] + d * positions[index + 1] + y}`)
  return { id: shape.id, points: points.join(' ') }
}))
const container = ref(null)
const status = ref({ state: 'initializing', backend: '判定不能', message: '初期化待ちです。' })
let renderer = null
let observer = null
const fit = reactive({ width: 0, height: 0, scale: 0 })
function resize() {
  if (!container.value) return
  const bounds = container.value.getBoundingClientRect()
  Object.assign(fit, fitCanvas(bounds.width, bounds.height))
}

function update() {
  try {
    renderer?.updateShapes(props.shapes)
  } catch (error) {
    status.value = { state: 'error', backend: status.value.backend, message: error.message }
  }
}

onMounted(async () => {
  resize()
  observer = new ResizeObserver(resize)
  observer.observe(container.value)
  renderer = createShapeRenderer(container.value, nextStatus => { status.value = nextStatus }, { transparent: props.transparent })
  await renderer.init(props.shapes)
  // 非同期初期化中に入力が変わった場合も、最新の正常値を反映する。
  update()
})

watch(() => props.shapes, update)
onUnmounted(() => { observer?.disconnect(); void renderer?.dispose() })
</script>

<template>
  <div class="preview-status" role="status" aria-live="polite">
    <span class="backend" :data-state="status.state" data-testid="backend">{{ status.backend }}</span>
    <span>{{ status.message }}</span>
  </div>
  <div ref="container" class="canvas-container" data-testid="canvas-container">
    <div v-if="$slots.background" class="preview-background" :style="{ width: `${fit.width}px`, height: `${fit.height}px` }" aria-hidden="true" inert>
      <div class="preview-background-logical" :style="{ transform: `scale(${fit.scale})` }"><slot name="background" /></div>
    </div>
    <svg v-if="outlines.length" class="selection-overlay" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><polygon v-for="outline in outlines" :key="outline.id" :points="outline.points" fill="none" stroke="#e8b85d" stroke-width="2" stroke-dasharray="6 4" vector-effect="non-scaling-stroke" /></svg>
    <div v-if="$slots.interaction && status.state === 'ready'" class="preview-interaction" :style="{ width: `${fit.width}px`, height: `${fit.height}px` }"><slot name="interaction" :fit="fit" /></div>
    <p v-if="status.state === 'error'" class="canvas-message" role="alert">
      描画できませんでした。<br />
      {{ status.message }}<br />
      ブラウザの GPU 設定を確認し、プレビューを再起動してください。
    </p>
    <p v-else-if="status.state === 'initializing'" class="canvas-message">GPU を初期化中…</p>
  </div>
</template>

<style scoped>
.preview-background { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); overflow:hidden; pointer-events:none; z-index:0; }
.preview-background-logical { width:1920px; height:1080px; transform-origin:top left; }
.canvas-container :deep(canvas) { position:relative; z-index:1; }
.selection-overlay { z-index:2; }
.canvas-message { z-index:3; }
.preview-interaction { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); z-index:4; }
</style>
