<script setup>
import { computed, ref, shallowRef, watch } from 'vue'
import ShapePreview from './ShapePreview.vue'
import NumberSlider from './NumberSlider.vue'
import { createSampleAnimatedTransition } from '../domain/transition/sampleAnimatedTransition.js'
import { evaluateTransition } from '../domain/transition/evaluateTransition.js'

const transition = ref(createSampleAnimatedTransition())
const timeMs = ref(800)
const previewVisible = ref(true)
const evaluation = computed(() => {
  try { return { ...evaluateTransition(transition.value, timeMs.value), error: '' } }
  catch (error) { return { shapes: [], error: error.message } }
})
const renderShapes = shallowRef([])
const displayedTime = ref(800)
const displayedStaggerMs = ref(40)
watch(evaluation, result => {
  if (result.error) return
  renderShapes.value = result.shapes
  displayedTime.value = Math.min(transition.value.durationMs, Math.max(0, timeMs.value))
  displayedStaggerMs.value = transition.value.layers[1].childAnimation.staggerMs
}, { immediate: true })
const group = computed(() => transition.value.layers[1])
const round = value => Number(value.toFixed(2))

function reset() {
  transition.value = createSampleAnimatedTransition()
  timeMs.value = 800
}
</script>

<template>
  <main>
    <header class="page-header">
      <div>
        <p class="eyebrow">GENERATIVE SLIDE / PHASE 2</p>
        <h1>時刻から動きを確かめる</h1>
        <p class="intro">時刻を前後に動かし、時間差のある移動と回転を確認できます。</p>
      </div>
      <button type="button" @click="reset">初期値に戻す</button>
    </header>

    <section class="preview-panel" aria-labelledby="preview-title">
      <div class="section-header">
        <h2 id="preview-title">プレビュー · {{ displayedTime }} ms</h2>
        <button type="button" @click="previewVisible = !previewVisible">{{ previewVisible ? 'プレビューを停止' : 'プレビューを開始' }}</button>
      </div>
      <ShapePreview v-if="previewVisible" :shapes="renderShapes" />
      <div v-else class="preview-stopped" role="status">プレビューを停止しました。再開すると描画を初期化します。</div>
      <div class="preview-caption"><span>1920 × 1080 / 16:9</span><span>赤・青の共通回転と、白い図形の個別回転</span></div>
    </section>

    <p v-if="evaluation.error" class="input-warning" role="alert">{{ evaluation.error }} 直前の正常な描画を保持します。</p>
    <section class="shape-controls phase-one-controls" aria-label="時刻と時間差の確認">
      <fieldset class="shape-card">
        <legend>指定時刻</legend>
        <NumberSlider id="time-ms" v-model="timeMs" label="時刻" unit="ms" :min="0" :max="transition.durationMs" />
        <div class="demo-actions">
          <button type="button" @click="timeMs = 0">開始 · 0 ms</button>
          <button type="button" @click="timeMs = 400">中間 · 400 ms</button>
          <button type="button" @click="timeMs = 800">中間 · 800 ms</button>
          <button type="button" @click="timeMs = transition.durationMs">終了 · {{ transition.durationMs }} ms</button>
        </div>
        <p class="control-note">時刻を戻しても同じ状態になります。範囲外の数値は0〜{{ transition.durationMs }} msに収めて評価します。</p>
      </fieldset>
      <fieldset class="shape-card">
        <legend>Child · 時間差</legend>
        <NumberSlider id="stagger-ms" v-model="group.childAnimation.staggerMs" label="1個ごとの遅延" unit="ms" :min="0" :max="transition.durationMs" :slider-max="120" />
        <p class="control-note">初期値は40 ms。子はX -1000→0、回転 -45°→0°で変化します。</p>
        <p class="control-note">白いitem-002は全体時刻で90°→0°に回転します。共通のX移動は引き継ぎます。</p>
        <p class="control-note">さらにGroup全体がY -80→0へ移動します。</p>
      </fieldset>
    </section>

    <details class="resolved-details">
      <summary>指定時刻の評価結果を見る</summary>
      <div class="result-scroll"><table>
        <thead><tr><th>ID</th><th>ローカル時刻 (ms)</th><th>X</th><th>Y</th><th>回転 (°)</th><th>画面の中心 X / Y</th></tr></thead>
        <tbody><tr v-for="shape in renderShapes" :key="shape.id">
          <td>{{ shape.id }}</td><td>{{ shape.groupId ? round(displayedTime - shape.index * displayedStaggerMs) : '—' }}</td>
          <td>{{ round(shape.transform.x) }}</td><td>{{ round(shape.transform.y) }}</td><td>{{ round(shape.transform.rotation) }}</td>
          <td>{{ round(shape.worldMatrix[4]) }} / {{ round(shape.worldMatrix[5]) }}</td>
        </tr></tbody>
      </table></div>
    </details>
    <footer class="notes">
      <p>図形は中心を軸に拡縮 → 時計回り回転 → 移動。Groupの変換をその後に重ねます。</p>
      <p>確認用の時刻指定画面です。自動再生や保存は後続Phaseで実装します。</p>
    </footer>
  </main>
</template>
