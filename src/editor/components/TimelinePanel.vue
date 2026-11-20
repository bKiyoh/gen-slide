<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { TRACK_PROPERTIES, TRANSFORM_TRACK_PROPERTIES } from '../../domain/transition/animation/tracks.js'
import { addKey, editKeyDisplay, getTracks, displayContext } from '../displayValues.js'
import { labelFor } from '../fields.js'
import EditorField from './EditorField.vue'
import NumberSlider from '../../components/NumberSlider.vue'
import { draggedKeyTime } from '../directEdit.js'
const props = defineProps({ editor: Object })
const e = props.editor
const scopeLabel = computed(() => !e.selection ? '対象なし' : ({ group: 'グループ全体', child: '子の共通の動き', individual: 'この子だけ', shape: '図形' })[e.scope])
const property = ref('transform.x')
const tracks = computed(() => e.layer ? getTracks(e.layer, e.selection?.itemId, e.scope) : [])
const selectedTrack = computed(() => tracks.value.find(track => track.property === property.value))
const properties = computed(() => e.scope === 'group' ? TRANSFORM_TRACK_PROPERTIES : TRACK_PROPERTIES)
let drag = null
let suppressKeyClick = false
function selectKey(track, index) { property.value = track.property; e.selectKey(track.property, track.keyframes[index].timeMs) }
function clickKey(track, index) { if (suppressKeyClick) suppressKeyClick = false; else { e.mode = 'keyframe'; selectKey(track, index) } }
function release() {
  const current = drag; drag = null
  if (current?.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer)
}
function cancel(event) {
  if (drag && Number.isFinite(event?.pointerId) && event.pointerId !== drag.pointer) return
  if (drag?.type === 'key') e.cancelGesture(drag.token)
  release()
}
function startKey(event, track, index) {
  if (event.button !== 0 || event.isPrimary === false || drag) return
  suppressKeyClick = false
  selectKey(track, index)
  if (e.mode !== 'keyframe') return
  const bounds = event.currentTarget.closest('.track-rail').getBoundingClientRect()
  if (!bounds.width) return
  drag = { type: 'key', pointer: event.pointerId, element: event.currentTarget, bounds,
    startX: event.clientX, time: track.keyframes[index].timeMs, track: JSON.parse(JSON.stringify(track)), index,
    property: track.property, selection: { ...e.selection }, scope: e.scope, transitionId: e.transitionId, duration: e.transition.durationMs }
  drag.token = e.beginGesture(); drag.element.setPointerCapture(event.pointerId); event.preventDefault()
}
function startSeek(event) {
  if (event.button !== 0 || event.isPrimary === false || drag) return
  e.pause()
  const element = event.currentTarget.closest('.track-rail')
  drag = { type: 'seek', element, pointer: event.pointerId, bounds: element.getBoundingClientRect(), duration: e.transition.durationMs }
  element.setPointerCapture(event.pointerId); move(event); event.preventDefault()
}
function move(event) {
  if (!drag || drag.pointer !== event.pointerId) return
  const current = drag
  const bounds = current.element.closest('.track-rail').getBoundingClientRect()
  if (['left', 'width'].some(key => Math.abs(bounds[key] - current.bounds[key]) > .5)) { cancel(); return }
  if (current.type === 'seek') { e.seek(Math.round(Math.max(0, Math.min(1, (event.clientX - current.bounds.left) / current.bounds.width)) * current.duration)); return }
  try {
    const time = draggedKeyTime(current.track, current.index, current.time + (event.clientX - current.startX) / current.bounds.width * current.duration, current.duration)
    if (time !== current.time) suppressKeyClick = true
    if (e.updateGesture(project => {
      const transition = project.transitions.find(t => t.id === current.transitionId)
      const layer = transition.layers.find(layer => layer.id === current.selection.layerId)
      const track = getTracks(layer, current.selection.itemId, current.scope).find(track => track.property === current.property)
      track.keyframes[current.index].timeMs = time
      track.keyframes.sort((a, b) => a.timeMs - b.timeMs)
    }, current.token)) e.selectKey(current.property, time)
  } catch (error) { e.error = error.message }
}
function up(event) { if (drag?.pointer === event.pointerId) { move(event); if (drag?.type === 'key') e.endGesture(drag.token); release() } }
watch(() => e.gestureActive, active => { if (!active && drag?.type === 'key') release() })
watch(() => [e.transitionId, e.selection?.layerId, e.selection?.itemId, e.scope, e.mode], cancel)
onUnmounted(cancel)
watch(() => e.scope, () => { if (!properties.value.includes(property.value)) property.value = 'transform.x' })
function edit(edit) { return e.editTransition(t => edit(getTracks(t.layers.find(layer => layer.id === e.layer.id), e.selection.itemId, e.scope, true))) }
function addTrack() { edit(tracks => { if (tracks.some(track => track.property === property.value)) throw new RangeError('この項目のトラックは既にあります。'); tracks.push({ property: property.value, mode: ['child', 'group'].includes(e.scope) ? 'offset' : 'absolute', keyframes: [] }) }) }
function addCurrentKey() { if (e.editTransition(t => addKey(t, e.selection, e.scope, property.value, e.timeMs))) e.selectKey(property.value, e.timeMs) }
function addPairedKeys(keys) {
  if (e.editTransition(t => {
    const layer = t.layers.find(layer => layer.id === e.layer.id)
    const tracks = getTracks(layer, e.selection.itemId, e.scope)
    let added = false
    for (const axis of keys) if (!tracks.find(track => track.property === axis)?.keyframes.some(key => key.timeMs === e.timeMs)) { addKey(t, e.selection, e.scope, axis, e.timeMs); added = true }
    if (!added) throw new RangeError('同じ時刻のX/Yキーは既にあります。既存キーを編集してください。')
  })) { property.value = keys[0]; e.selectKey(property.value, e.timeMs) }
}
function keyDisplay(index) {
  const time = selectedTrack.value.keyframes[index].timeMs
  if (time > e.transition.durationMs) return { error: '範囲外の時刻' }
  try { const context = displayContext(e.transition, e.selection, e.scope, time); return { value: context.values[property.value], error: context.restrictions[property.value] } }
  catch (error) { return { error: error.message } }
}
function changeKeyTime(index, event) {
  const old = selectedTrack.value.keyframes[index].timeMs
  const value = event.target.value === '' ? NaN : Number(event.target.value)
  if (!edit(tracks => { const track = tracks.find(track => track.property === property.value); if (value > e.transition.durationMs) throw new RangeError('キー時刻はduration以内で指定してください。'); track.keyframes[index].timeMs = value; track.keyframes.sort((a, b) => a.timeMs - b.timeMs) })) event.target.value = old
  else e.selectKey(property.value, value)
}
function changeKeyValue(index, event) {
  const old = keyDisplay(index).value
  if (!e.editTransition(t => editKeyDisplay(t, e.selection, e.scope, property.value, index, event.target.value === '' ? NaN : Number(event.target.value)))) event.target.value = old
}
</script>
<template>
  <section class="editor-panel timeline-panel" aria-labelledby="timeline-title">
    <div class="panel-heading"><h2 id="timeline-title">タイムライン</h2><NumberSlider id="editor-time" :model-value="Math.round(e.timeMs)" label="現在時刻" unit="ms" :min="0" :max="e.transition?.durationMs ?? 0" @update:model-value="e.seek" /><small>{{ scopeLabel }} · 切替 {{ e.transition?.switchAtMs ?? 0 }} ms</small></div>
    <div class="panel-body">
      <div v-if="!e.selection" class="editor-empty-state"><p>レイヤーを選ぶと動きを表示</p><span>キーの選択で中央の編集欄に値・時刻・補間を表示します。</span></div>
      <template v-else>
        <div class="timeline-axis" aria-hidden="true"><span>0 ms</span><span>{{ e.transition.durationMs }} ms</span></div>
        <div class="timeline-tracks">
          <div v-for="track in tracks" :key="track.property" class="timeline-track"><button :aria-pressed="property === track.property" @click="property = track.property; e.mode = 'keyframe'">{{ labelFor(track.property) }}</button>
            <div class="track-rail" @pointerdown="startSeek" @pointermove="move" @pointerup="up" @pointercancel="cancel" @lostpointercapture="cancel">
              <span class="switch-marker" :style="{ left: `${e.transition.durationMs ? e.transition.switchAtMs / e.transition.durationMs * 100 : 0}%` }"></span>
              <button class="time-marker" aria-label="再生ヘッドをドラッグ" :style="{ left: `${e.transition.durationMs ? e.timeMs / e.transition.durationMs * 100 : 0}%` }" @pointerdown.stop="startSeek"></button>
              <button v-for="(key, index) in track.keyframes" :key="index" class="key-marker" :aria-pressed="e.keySelection?.property === track.property && e.keySelection?.scope === e.scope && e.keySelection?.timeMs === key.timeMs" :style="{ left: `${Math.min(100, e.transition.durationMs ? key.timeMs / e.transition.durationMs * 100 : 0)}%` }" :aria-label="`${labelFor(track.property)} ${key.timeMs}msのキーを選択`" @pointerdown.stop="startKey($event, track, index)" @pointermove.stop="move" @pointerup.stop="up" @pointercancel.stop="cancel" @lostpointercapture.stop="cancel" @click.stop="clickKey(track, index)">◆</button>
            </div>
          </div>
        </div>
        <p v-if="!tracks.length" class="control-note">この対象の動きはまだありません。「動きを編集」からキーを追加します。</p>
      </template>
    </div>
  </section>
  <Teleport defer to="#animation-inspector">
    <div v-if="e.selection">
      <div class="timeline-toolbar timeline-context">
        <label v-if="e.layer.kind === 'group' && !e.selection.itemId"><span class="field-label">編集階層</span><select id="track-scope" v-model="e.scope"><option value="group">グループ全体</option><option value="child">子の共通の動き · 基準は図形1</option></select></label>
        <p v-else class="control-note">{{ e.selection.itemId ? 'この子だけの動き（全体時刻）' : 'この図形の動き' }}</p>
      </div>
      <div class="timeline-toolbar timeline-track-actions"><label><span class="field-label">対象プロパティ</span><select id="track-property" v-model="property"><option v-for="property in properties" :key="property" :value="property">{{ labelFor(property) }}</option></select></label>
        <button type="button" @click="addTrack">トラック追加</button><button type="button" class="button-danger" :disabled="!selectedTrack" @click="edit(tracks => tracks.splice(tracks.findIndex(track => track.property === property), 1))">トラック削除</button>
      </div>
      <div class="editor-actions timeline-key-actions"><button type="button" class="button-primary" @click="addCurrentKey">現在時刻にキー追加</button><button type="button" @click="addPairedKeys(['transform.x', 'transform.y'])">位置キー追加 (X/Y)</button><button type="button" @click="addPairedKeys(['transform.scaleX', 'transform.scaleY'])">倍率キー追加 (X/Y)</button></div>
      <p class="control-note">キーを選んで編集します。位置・倍率は同時刻のX/Yキーが必要です。</p>
      <div v-if="selectedTrack" class="result-scroll"><table class="key-table"><thead><tr><th>時刻 (ms)</th><th>表示値</th><th>Easing</th><th></th></tr></thead><tbody>
        <tr v-for="(key, index) in selectedTrack.keyframes" :key="index" :data-selected="e.keySelection?.scope === e.scope && e.keySelection?.property === property && e.keySelection?.timeMs === key.timeMs"><td><input :aria-label="`キー${index + 1}の時刻`" type="number" @focus="e.selectKey(property, key.timeMs)" :value="key.timeMs" min="0" :max="e.transition.durationMs" @change="changeKeyTime(index, $event)" /></td>
          <td><span v-if="keyDisplay(index).error" class="control-note">{{ keyDisplay(index).error }}</span><input v-else :aria-label="`キー${index + 1}の表示値`" type="number" step="any" @focus="e.selectKey(property, key.timeMs)" :value="Number(keyDisplay(index).value?.toFixed(6))" @change="changeKeyValue(index, $event)" /></td>
          <td><select :aria-label="`キー${index + 1}のEasing`" :value="key.easing ?? 'linear'" @change="edit(tracks => { tracks.find(track => track.property === property).keyframes[index].easing = $event.target.value })"><option value="linear">Linear</option><option value="easeInCubic">Ease In Cubic</option><option value="easeOutCubic">Ease Out Cubic</option><option value="easeInOutCubic">Ease In Out Cubic</option></select></td>
          <td><button type="button" class="button-danger" :aria-label="`キー${index + 1}を削除`" @click="edit(tracks => tracks.find(track => track.property === property).keyframes.splice(index, 1))">削除</button></td>
        </tr>
      </tbody></table></div>
      <details class="animation-details"><summary>開始のずれ・操作の詳細</summary>
        <EditorField v-if="e.layer.kind === 'group'" id="editor-stagger" label="図形ごとの開始のずれ" unit="ms" :value="e.layer.childAnimation?.staggerMs ?? 0" :min="0" :max="Number.MAX_SAFE_INTEGER" :slider-max="120" @change="e.editTransition(t => { const layer = t.layers.find(layer => layer.id === e.layer.id); layer.childAnimation ??= { staggerMs: 0, tracks: [] }; layer.childAnimation.staggerMs = $event })" />
        <p v-if="e.scope === 'child'" class="control-note">共通キーはitem-000の画面表示値を基準に編集します。キー時刻はChildのローカル時刻、待機中は開始キーの値です。</p>
        <p class="control-note">キーは1ms刻みでドラッグでき、隣のキーの手前で止まります。再生ヘッドのドラッグはシークだけです。</p>
      </details>
    </div>
  </Teleport>
</template>
