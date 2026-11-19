<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { clientToLogical, hitShape, manipulationFrame } from '../previewGeometry.js'
import { applyDirectValues, assertDirectEdit, directContext, directValues } from '../directEdit.js'
const props = defineProps({ editor: Object, fit: Object })
const e = props.editor
const surface = ref(null)
let drag = null
const context = computed(() => {
  try { return e.selection && e.transition ? directContext(e.transition, e.selection, e.mode, e.scope, e.timeMs) : null }
  catch { return null }
})
const frame = computed(() => manipulationFrame(e.renderShapes, e.selection, context.value, props.fit.scale))
const points = computed(() => frame.value?.points.map(p => `${p.x},${p.y}`).join(' '))
const handleRadius = computed(() => 6 / (props.fit.scale || 1))
function release() {
  const current = drag; drag = null
  if (current && surface.value?.hasPointerCapture(current.pointer)) surface.value.releasePointerCapture(current.pointer)
}
function cancel(event) {
  if (drag && Number.isFinite(event?.pointerId) && event.pointerId !== drag.pointer) return
  if (drag) { e.cancelGesture(drag.token); release() }
}
function down(event) {
  if (event.button !== 0 || event.isPrimary === false || !e.transition || drag) return
  const bounds = surface.value.getBoundingClientRect()
  const point = clientToLogical(event.clientX, event.clientY, bounds)
  if (!point) return
  const action = event.target.dataset.action ?? 'move'
  if (action === 'move') {
    const hit = hitShape(e.renderShapes, point)
    if (!hit) { e.selectLayer(null); return }
    const layerId = hit.groupId ?? hit.id
    const itemId = hit.groupId && e.pickMode === 'child' ? hit.itemId : undefined
    if (e.selection?.layerId !== layerId || e.selection?.itemId !== itemId) e.selectLayer(layerId, itemId)
  }
  try {
    e.pause()
    const current = directContext(e.transition, e.selection, e.mode, e.scope, e.timeMs)
    assertDirectEdit(current, e.selection, e.mode, e.scope, e.keySelection, action, e.timeMs)
    const pivot = { x: current.values['transform.x'], y: current.values['transform.y'] }
    drag = { pointer: event.pointerId, point, bounds, clientX: event.clientX, clientY: event.clientY, action, pivot,
      values: { ...current.values }, selection: { ...e.selection }, key: e.keySelection ? { ...e.keySelection } : null,
      scope: e.scope, mode: e.mode, time: e.timeMs, transitionId: e.transitionId }
    drag.token = e.beginGesture(); surface.value.setPointerCapture(event.pointerId); surface.value.focus({ preventScroll: true }); event.preventDefault()
  } catch (error) { e.error = error.message }
}
function move(event) {
  if (!drag || event.pointerId !== drag.pointer) return
  const bounds = surface.value.getBoundingClientRect()
  if (['left', 'top', 'width', 'height'].some(key => Math.abs(bounds[key] - drag.bounds[key]) > .5)) { cancel(); return }
  if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 3) return
  const point = clientToLogical(event.clientX, event.clientY, bounds, true)
  if (!point) return
  try {
    const current = drag
    const values = directValues(current.action, current.point, point, current.pivot, current.values)
    e.updateGesture(project => applyDirectValues(project.transitions.find(t => t.id === current.transitionId),
      current.selection, current.mode, current.scope, current.key, values, current.time), current.token)
  } catch (error) { e.error = error.message }
}
function up(event) { if (drag && event.pointerId === drag.pointer) { move(event); if (drag) e.endGesture(drag.token); release() } }
watch(() => e.gestureActive, active => { if (!active) release() })
watch(() => [e.transitionId, e.selection?.layerId, e.selection?.itemId, e.mode, e.scope], () => {
  if (drag && (drag.transitionId !== e.transitionId || drag.selection.layerId !== e.selection?.layerId
    || drag.selection.itemId !== e.selection?.itemId || drag.mode !== e.mode || drag.scope !== e.scope)) cancel()
})
watch(() => [props.fit.width, props.fit.height], cancel)
onMounted(() => window.addEventListener('resize', cancel))
onUnmounted(() => { cancel(); window.removeEventListener('resize', cancel) })
</script>
<template>
  <svg ref="surface" class="direct-preview" viewBox="0 0 1920 1080" aria-label="図形を直接操作" tabindex="0" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancel" @lostpointercapture="cancel">
    <template v-if="frame">
      <polygon :points="points" class="direct-frame" vector-effect="non-scaling-stroke" />
      <line :x1="frame.top.x" :y1="frame.top.y" :x2="frame.rotate.x" :y2="frame.rotate.y" class="direct-frame" vector-effect="non-scaling-stroke" />
      <circle :cx="frame.pivot.x" :cy="frame.pivot.y" :r="3 / fit.scale" class="direct-pivot" />
      <rect v-for="(point, index) in frame.points" :key="index" data-action="scale" :data-handle="`scale-${index}`" :x="point.x - handleRadius" :y="point.y - handleRadius" :width="handleRadius * 2" :height="handleRadius * 2" class="direct-handle scale-handle" vector-effect="non-scaling-stroke" />
      <circle data-action="rotate" data-handle="rotate" :cx="frame.rotate.x" :cy="frame.rotate.y" :r="handleRadius" class="direct-handle rotate-handle" vector-effect="non-scaling-stroke" />
    </template>
  </svg>
</template>
