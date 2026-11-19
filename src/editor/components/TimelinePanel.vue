<script setup>
import { computed, ref, watch } from 'vue'
import { TRACK_PROPERTIES, TRANSFORM_TRACK_PROPERTIES } from '../../domain/transition/animation/tracks.js'
import { addKey, editKeyDisplay, getTracks, displayContext } from '../displayValues.js'
import { labelFor } from '../fields.js'
import EditorField from './EditorField.vue'
const props = defineProps({ editor: Object })
const e = props.editor
const property = ref('transform.x')
const tracks = computed(() => e.layer ? getTracks(e.layer, e.selection?.itemId, e.scope) : [])
const selectedTrack = computed(() => tracks.value.find(track => track.property === property.value))
const properties = computed(() => e.scope === 'group' ? TRANSFORM_TRACK_PROPERTIES : TRACK_PROPERTIES)
watch(() => e.scope, () => { if (!properties.value.includes(property.value)) property.value = 'transform.x' })
function edit(edit) { return e.editTransition(t => edit(getTracks(t.layers.find(layer => layer.id === e.layer.id), e.selection.itemId, e.scope, true))) }
function addTrack() { edit(tracks => { if (tracks.some(track => track.property === property.value)) throw new RangeError('この項目のトラックは既にあります。'); tracks.push({ property: property.value, mode: ['child', 'group'].includes(e.scope) ? 'offset' : 'absolute', keyframes: [] }) }) }
function addCurrentKey() { e.editTransition(t => addKey(t, e.selection, e.scope, property.value, e.timeMs)) }
function addPositionKeys() {
  e.editTransition(t => {
    const layer = t.layers.find(layer => layer.id === e.layer.id)
    const tracks = getTracks(layer, e.selection.itemId, e.scope)
    let added = false
    for (const axis of ['transform.x', 'transform.y']) if (!tracks.find(track => track.property === axis)?.keyframes.some(key => key.timeMs === e.timeMs)) { addKey(t, e.selection, e.scope, axis, e.timeMs); added = true }
    if (!added) throw new RangeError('同じ時刻のX/Yキーは既にあります。既存キーを編集してください。')
  })
}
function keyDisplay(index) {
  const time = selectedTrack.value.keyframes[index].timeMs
  if (time > e.transition.durationMs) return { error: '範囲外の時刻' }
  try { const context = displayContext(e.transition, e.selection, e.scope, time); return { value: context.values[property.value], error: context.restrictions[property.value] } }
  catch (error) { return { error: error.message } }
}
function changeKeyTime(index, event) {
  const old = selectedTrack.value.keyframes[index].timeMs
  if (!edit(tracks => { const track = tracks.find(track => track.property === property.value); const value = event.target.value === '' ? NaN : Number(event.target.value); if (value > e.transition.durationMs) throw new RangeError('キー時刻はduration以内で指定してください。'); track.keyframes[index].timeMs = value; track.keyframes.sort((a, b) => a.timeMs - b.timeMs) })) event.target.value = old
}
function changeKeyValue(index, event) {
  const old = keyDisplay(index).value
  if (!e.editTransition(t => editKeyDisplay(t, e.selection, e.scope, property.value, index, event.target.value === '' ? NaN : Number(event.target.value)))) event.target.value = old
}
</script>
<template>
  <section class="editor-panel timeline-panel" aria-labelledby="timeline-title"><div class="panel-heading"><h2 id="timeline-title">タイムライン</h2><small>切替時刻 {{ e.transition?.switchAtMs ?? 0 }} ms</small></div>
    <div class="panel-body">
    <div v-if="!e.selection" class="editor-empty-state"><p>トラックを表示</p><span>レイヤーを選ぶと、キーフレームと時間差を確認・編集できます。</span></div>
    <template v-else>
      <div class="timeline-toolbar timeline-context">
        <label v-if="e.layer.kind === 'group' && !e.selection.itemId"><span class="field-label">編集階層</span><select id="track-scope" v-model="e.scope"><option value="group">Group全体</option><option value="child">Child共通 · 基準item-000</option></select></label>
        <p v-else class="control-note">{{ e.selection.itemId ? 'Individual · この子だけの動き（全体時刻）' : 'Shape自身の動き' }}</p>
        <EditorField v-if="e.layer.kind === 'group'" id="editor-stagger" label="Stagger · Childのみ" unit="ms" :value="e.layer.childAnimation?.staggerMs ?? 0" :min="0" :max="Number.MAX_SAFE_INTEGER" :slider-max="120" @change="e.editTransition(t => { const layer = t.layers.find(layer => layer.id === e.layer.id); layer.childAnimation ??= { staggerMs: 0, tracks: [] }; layer.childAnimation.staggerMs = $event })" />
      </div>
      <p v-if="e.scope === 'child'" class="control-note">共通キーはitem-000の画面表示値を基準に編集します。キー時刻はChildのローカル時刻、待機中は開始キーの値です。</p>
      <div class="timeline-axis" aria-hidden="true"><span>0 ms</span><span>{{ e.transition.durationMs }} ms</span></div>
      <div class="timeline-tracks">
        <div v-for="track in tracks" :key="track.property" class="timeline-track"><button :aria-pressed="property === track.property" @click="property = track.property">{{ labelFor(track.property) }}</button>
          <div class="track-rail"><span class="switch-marker" :style="{ left: `${e.transition.durationMs ? e.transition.switchAtMs / e.transition.durationMs * 100 : 0}%` }"></span><span class="time-marker" :style="{ left: `${e.transition.durationMs ? e.timeMs / e.transition.durationMs * 100 : 0}%` }"></span><button v-for="(key, index) in track.keyframes" :key="index" class="key-marker" :style="{ left: `${Math.min(100, e.transition.durationMs ? key.timeMs / e.transition.durationMs * 100 : 0)}%` }" :aria-label="`${labelFor(track.property)} ${key.timeMs}msへシーク`" @click="property = track.property; e.seek(key.timeMs)">◆</button></div>
        </div>
      </div>
      <div class="timeline-toolbar timeline-track-actions"><label><span class="field-label">対象プロパティ</span><select id="track-property" v-model="property"><option v-for="property in properties" :key="property" :value="property">{{ labelFor(property) }}</option></select></label>
        <button type="button" @click="addTrack">トラック追加</button><button type="button" class="button-danger" :disabled="!selectedTrack" @click="edit(tracks => tracks.splice(tracks.findIndex(track => track.property === property), 1))">トラック削除</button>
      </div>
      <p v-if="e.mode !== 'keyframe'" class="control-note">キーを変更するには「キーフレーム編集」へ切り替えてください。</p>
      <template v-else>
        <div class="editor-actions timeline-key-actions"><button type="button" class="button-primary" @click="addCurrentKey">現在時刻にキー追加</button><button type="button" @click="addPositionKeys">位置キー追加 (X/Y)</button></div>
        <p class="control-note">値はキー時刻での画面表示値です。傾斜はローカル形状の値です。回転した親の位置編集では同時刻のX/Yキーを対で変更します。</p>
        <div v-if="selectedTrack" class="result-scroll"><table class="key-table"><thead><tr><th>時刻 (ms)</th><th>表示値</th><th>Easing</th><th></th></tr></thead><tbody>
          <tr v-for="(key, index) in selectedTrack.keyframes" :key="index"><td><input :aria-label="`キー${index + 1}の時刻`" type="number" :value="key.timeMs" min="0" :max="e.transition.durationMs" @change="changeKeyTime(index, $event)" /></td>
            <td><span v-if="keyDisplay(index).error" class="control-note">{{ keyDisplay(index).error }}</span><input v-else :aria-label="`キー${index + 1}の表示値`" type="number" step="any" :value="Number(keyDisplay(index).value?.toFixed(6))" @change="changeKeyValue(index, $event)" /></td>
            <td><select :aria-label="`キー${index + 1}のEasing`" :value="key.easing ?? 'linear'" @change="edit(tracks => { tracks.find(track => track.property === property).keyframes[index].easing = $event.target.value })"><option value="linear">Linear</option><option value="easeInCubic">Ease In Cubic</option><option value="easeOutCubic">Ease Out Cubic</option><option value="easeInOutCubic">Ease In Out Cubic</option></select></td>
            <td><button type="button" class="button-danger" :aria-label="`キー${index + 1}を削除`" @click="edit(tracks => tracks.find(track => track.property === property).keyframes.splice(index, 1))">削除</button></td>
          </tr>
        </tbody></table></div>
      </template>
    </template>
    </div>
  </section>
</template>
