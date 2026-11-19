<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { createShapeRenderer } from '../renderer/three/createShapeRenderer.js'
import { fitCanvas } from '../renderer/fitCanvas.js'
import { createPresentationController } from './presentationController.js'
import { resolveSlide } from './slideRegistry.js'
import './presentation.css'

const props = defineProps({ project: { type: Object, required: true } })
defineEmits(['edit-project'])
const root = ref(null)
const viewport = ref(null)
const effects = ref(null)
const index = ref(0)
const slide = computed(() => props.project.slides[index.value])
const component = computed(() => resolveSlide(slide.value?.component))
const fit = reactive({ width: 0, height: 0, scale: 0 })
const visual = reactive({ visible: false })
const status = ref({ state: 'initializing', backend: '初期化中', message: '' })
const playback = ref({ state: 'idle', timeMs: 0 })
const warning = ref('')
const controls = ref(true)
const fullscreen = ref(false)
const busy = computed(() => playback.value.state === 'transitioning')
const activeTransition = computed(() => props.project.transitions.find(transition => transition.id === (busy.value ? playback.value.transitionId : slide.value?.transitionId)))
let renderer
let controller
let observer
let disposed = false
function clear() {
  visual.visible = false
  // 非表示にしてからクリアする。失敗しても通常スライドは操作できる。
  try { if (status.value.state === 'ready') renderer?.updateShapes([]) } catch { /* 演出解除を優先する。 */ }
}
function resize() {
  if (!disposed && viewport.value) Object.assign(fit, fitCanvas(viewport.value.clientWidth, viewport.value.clientHeight))
}
function handleKey(event) {
  const target = event.target
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat
    || target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
  if (event.code === 'Space' && target?.closest?.('button, a')) return
  if (['ArrowRight', 'PageDown', 'Space'].includes(event.code)) { event.preventDefault(); void controller?.next() }
  else if (['ArrowLeft', 'PageUp'].includes(event.code)) { event.preventDefault(); controller?.previous() }
}
function updateFullscreen() { fullscreen.value = document.fullscreenElement === root.value; resize() }
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement === root.value) await document.exitFullscreen()
    else {
      if (!root.value.requestFullscreen) throw new Error('このブラウザでは全画面APIを利用できません。')
      await root.value.requestFullscreen()
    }
  } catch (error) { if (!disposed) warning.value = `全画面に変更できません: ${error.message}。通常表示で発表を続けられます。` }
}

onMounted(() => {
  controller = createPresentationController({ getProject: () => props.project,
    isReady: () => status.value.state === 'ready',
    prepare: shapes => renderer.prepareShapes(shapes),
    draw: async frame => {
      renderer.updateShapes(frame.shapes)
      if (disposed || status.value.state !== 'ready') throw new Error('描画バックエンドが停止しました。')
      visual.visible = true
      await nextTick()
    }, clear, now: () => performance.now(),
    requestFrame: callback => requestAnimationFrame(callback), cancelFrame: id => cancelAnimationFrame(id),
    onSlide: async value => { index.value = value; await nextTick() },
    onState: value => { playback.value = value },
    onWarning: message => { warning.value = message },
  })
  renderer = createShapeRenderer(effects.value, value => {
    if (disposed) return
    status.value = value
    if (value.state === 'error') controller.fail(new Error(value.message))
  }, { transparent: true })
  void renderer.init([])
  resize()
  observer = new ResizeObserver(resize)
  observer.observe(viewport.value)
  window.addEventListener('keydown', handleKey)
  document.addEventListener('fullscreenchange', updateFullscreen)
})
onUnmounted(() => {
  disposed = true
  controller?.dispose()
  observer?.disconnect()
  window.removeEventListener('keydown', handleKey)
  document.removeEventListener('fullscreenchange', updateFullscreen)
  void renderer?.dispose()
})
</script>

<template>
  <main ref="root" class="presentation" :class="{ 'controls-hidden': !controls }" :data-state="playback.state" :data-time="playback.timeMs">
    <header v-if="controls" class="presentation-toolbar">
      <div class="presentation-heading"><span class="eyebrow">GENERATIVE SLIDE / PRESENTATION</span><span class="presentation-counter" aria-live="polite">{{ project.slides.length ? index + 1 : 0 }} / {{ project.slides.length }}</span></div>
      <div class="presentation-actions"><button @click="$emit('edit-project')">Editorへ戻る</button><button @click="toggleFullscreen">{{ fullscreen ? '全画面を終了' : '全画面で発表' }}</button><button @click="controls = false">操作パネルを隠す</button></div>
    </header>
    <button v-else class="show-presentation-controls" aria-label="操作パネルを表示" @click="controls = true">操作を表示</button>
    <div ref="viewport" class="presentation-viewport">
      <div v-if="project.slides.length" class="presentation-stage" :style="{ width: `${fit.width}px`, height: `${fit.height}px` }">
        <div class="slide-logical" :data-slide-id="slide.id" :style="{ transform: `scale(${fit.scale})` }">
          <component :is="component" v-if="component" :key="slide.id" @next="controller?.next()" />
          <article v-else class="slide-content slide-unknown"><p class="slide-kicker">UNREGISTERED SLIDE</p><h1>未登録のスライドです</h1><p>{{ slide.component }}</p><p>Editorの発表構成で登録済みスライドを選んでください。前後のスライドへは移動できます。</p></article>
        </div>
        <div ref="effects" class="presentation-effects" :data-visible="visual.visible" :style="{ visibility: visual.visible ? 'visible' : 'hidden' }" aria-hidden="true"></div>
      </div>
      <div v-else class="presentation-empty"><h1>スライドを追加してください</h1><p>Editorの「発表構成」でスライドと演出を設定できます。</p><button @click="$emit('edit-project')">Editorで設定する</button></div>
    </div>
    <!-- 空のProjectでもRenderer初期化・破棄の順序を同じにする。 -->
    <div v-if="!project.slides.length" ref="effects" class="empty-effects" aria-hidden="true"></div>
    <footer v-if="controls" class="presentation-footer">
      <div class="presentation-actions"><button :disabled="busy || index <= 0" @click="controller.previous()">← 前へ</button><button class="button-primary" :disabled="busy || index >= project.slides.length - 1" @click="controller.next()">次へ →</button><span>{{ busy ? '演出中 · 追加入力は無視します' : '→ / Space / PageDown · ← / PageUp' }}</span></div>
      <span class="backend" :data-state="status.state" :title="status.message">{{ status.backend }}</span>
      <span class="presentation-transition-label">{{ activeTransition ? `${busy ? '再生中' : '次の演出'}: ${activeTransition.name}` : index >= project.slides.length - 1 ? '最後のスライド' : '次は即時切替' }}</span>
      <p v-if="warning" class="presentation-warning" role="status">{{ warning }}</p>
    </footer>
    <p v-else-if="warning" class="presentation-warning floating-warning" role="status">{{ warning }}</p>
  </main>
</template>
